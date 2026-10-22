"""Vision screening provider (Roboflow hosted classification models).

Fixes relative to the legacy NestJS provider:
  * explicit crop -> model registry. Legacy fell through to a generic model (configured as the
    cotton model) for every crop other than wheat/rice, including fields with no active crop
    cycle, so e.g. a maize leaf received cotton-disease labels. Here an unknown crop is
    CROP_NOT_SUPPORTED and no model is called.
  * provider errors are mapped to stable codes; HTTP 429/5xx and timeouts are retryable.
  * the API key is never logged or stored in raw responses.
"""

import base64
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx

from app.config import Settings


class VisionError(Exception):
    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code, self.retryable = code, retryable


@dataclass(frozen=True)
class ModelConfig:
    crop: str
    model_id: str
    version: str


@dataclass
class Prediction:
    model_id: str
    model_version: str
    predicted_condition: str
    confidence: float
    alternatives: list[dict]
    inference_timestamp: str
    raw: dict = field(default_factory=dict)
    latency_ms: int = 0


def normalize_crop(name: str | None) -> str:
    return (name or "").strip().lower()


def registry(s: Settings) -> dict[str, ModelConfig]:
    out: dict[str, ModelConfig] = {}
    for crop, mid, ver in (
        ("wheat", s.roboflow_wheat_model_id, s.roboflow_wheat_model_version),
        ("rice", s.roboflow_rice_model_id, s.roboflow_rice_model_version),
        ("cotton", s.roboflow_cotton_model_id, s.roboflow_cotton_model_version),
    ):
        if mid and ver:
            out[crop] = ModelConfig(crop, mid, ver)
    return out


def select_model(s: Settings, crop_names: list[str | None]) -> ModelConfig:
    crops = {normalize_crop(c) for c in crop_names}
    crops.discard("")
    if len(crops) > 1:
        raise VisionError("CROP_CONTEXT_MISMATCH")
    if not crops:
        raise VisionError("CROP_CONTEXT_REQUIRED")
    crop = crops.pop()
    if not s.roboflow_api_key:
        raise VisionError("VISION_PROVIDER_NOT_CONFIGURED")
    model = registry(s).get(crop)
    if model is None:
        raise VisionError("CROP_NOT_SUPPORTED")
    return model


def _valid(c) -> bool:
    return isinstance(c, int | float) and not isinstance(c, bool) and 0 <= c <= 1


def normalize_predictions(resp: dict) -> list[dict]:
    """Same normalisation as legacy normalizePredictions(): list (detection/single-label),
    dict (multi-label classification) or top/confidence; strongest score per condition."""
    values: dict[str, float] = {}

    def add(cond, conf):
        if cond and _valid(conf):
            values[cond] = max(values.get(cond, 0.0), float(conf))

    preds = resp.get("predictions")
    if isinstance(preds, list):
        for p in preds:
            if isinstance(p, dict):
                add(p.get("class") or p.get("class_name"), p.get("confidence"))
    elif isinstance(preds, dict):
        for cond, p in preds.items():
            if isinstance(p, dict):
                add(cond, p.get("confidence"))
    if not values and resp.get("top"):
        add(resp.get("top"), resp.get("confidence"))
    return sorted(({"condition": k, "confidence": v} for k, v in values.items()), key=lambda x: -x["confidence"])


def aggregate(per_image: list[list[dict]]) -> list[dict]:
    totals: dict[str, dict] = {}
    for preds in per_image:
        for p in preds:
            t = totals.setdefault(p["condition"], {"confidence": 0.0, "supportingImages": 0})
            t["confidence"] += p["confidence"]
            t["supportingImages"] += 1
    n = max(1, len(per_image))
    return sorted(
        ({"condition": c, "confidence": v["confidence"] / n, "supportingImages": v["supportingImages"]} for c, v in totals.items()),
        key=lambda x: -x["confidence"],
    )


class RoboflowClient:
    def __init__(self, s: Settings, http: httpx.Client | None = None):
        self.s = s
        self.http = http or httpx.Client(timeout=httpx.Timeout(s.vision_timeout_seconds, connect=5.0))

    def _classify(self, model: ModelConfig, jpeg: bytes) -> dict:
        base = self.s.roboflow_base_url.rstrip("/")
        if base == "https://detect.roboflow.com":
            base = "https://classify.roboflow.com"
        url = f"{base}/{model.model_id}/{model.version}"
        try:
            r = self.http.post(
                url,
                params={"api_key": self.s.roboflow_api_key, "format": "json"},
                content=base64.b64encode(jpeg),
                headers={"content-type": "application/x-www-form-urlencoded"},
            )
        except httpx.TimeoutException as exc:
            raise VisionError("VISION_PROVIDER_TIMEOUT", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise VisionError("VISION_PROVIDER_UNAVAILABLE", retryable=True) from exc
        if r.status_code in (401, 403):
            raise VisionError("VISION_PROVIDER_AUTH_FAILED")
        if r.status_code == 404:
            raise VisionError("VISION_MODEL_NOT_FOUND")
        if r.status_code == 429 or r.status_code >= 500:
            raise VisionError("VISION_PROVIDER_UNAVAILABLE", retryable=True)
        if r.status_code != 200:
            raise VisionError("VISION_PROVIDER_REJECTED")
        try:
            body = r.json()
        except ValueError as exc:
            raise VisionError("VISION_PROVIDER_BAD_RESPONSE") from exc
        if not isinstance(body, dict):
            raise VisionError("VISION_PROVIDER_BAD_RESPONSE")
        body.pop("image", None)
        return body

    def predict(self, model: ModelConfig, images_jpeg: list[bytes]) -> Prediction:
        if not images_jpeg:
            raise VisionError("SCAN_IMAGE_REQUIRED")
        started = time.monotonic()
        responses = [self._classify(model, img) for img in images_jpeg]
        agg = aggregate([normalize_predictions(r) for r in responses])
        if not agg:
            raise VisionError("VISION_NO_USABLE_PREDICTION")
        top = agg[0]
        if not _valid(top["confidence"]):
            raise VisionError("INVALID_PROVIDER_CONFIDENCE")
        return Prediction(
            model_id=model.model_id,
            model_version=model.version,
            predicted_condition=top["condition"],
            confidence=round(top["confidence"], 6),
            alternatives=[{"condition": a["condition"], "confidence": round(a["confidence"], 6)} for a in agg[1:4]],
            inference_timestamp=datetime.now(UTC).isoformat(),
            raw={"task": "classification", "cropName": model.crop, "imageCount": len(images_jpeg), "perImage": responses, "aggregation": agg},
            latency_ms=int((time.monotonic() - started) * 1000),
        )
