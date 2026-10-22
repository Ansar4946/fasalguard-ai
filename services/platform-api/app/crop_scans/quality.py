"""Image validation and quality gate for crop-scan images (runs before any model call).

Thresholds are carried over from the legacy implementations so behaviour is unchanged:
  * brightness / dark / bright ratios: services/geospatial-ai/app/main.py quality_metrics
  * focus (Laplacian variance < 18 => POSSIBLY_BLURRY): same source
  * minimum 320x320 px, 15 MB: services/api crop-scan.processor.ts

New in this port: CROP_NOT_VISIBLE when almost no plant-coloured pixels are present. Phase F01
testing showed the hosted models return confident labels for images with no plant at all
(e.g. rice model: "Healthy" 0.92 on a solid black image), so screening must not run on them.
The plant-pixel threshold is deliberately permissive (diseased, yellow or brown tissue counts)
and its false-rejection rate is measured on labelled dataset images (docs/features/F01.md).
"""

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MIN_DIMENSION = 320
PLANT_PIXEL_MIN_FRACTION = 0.05
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class ImageRejected(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class QualityResult:
    acceptable: bool
    issues: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


def decode(raw: bytes) -> Image.Image:
    """Decode by content (never by filename/claimed MIME). Raises ImageRejected."""
    if len(raw) > MAX_IMAGE_BYTES:
        raise ImageRejected("IMAGE_TOO_LARGE")
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt = probe.format
        probe.verify()
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ImageRejected("CORRUPT_IMAGE") from exc
    if fmt not in ALLOWED_FORMATS:
        raise ImageRejected("UNSUPPORTED_IMAGE_FORMAT")
    image = ImageOps.exif_transpose(image).convert("RGB")
    if image.width < MIN_DIMENSION or image.height < MIN_DIMENSION:
        raise ImageRejected("IMAGE_DIMENSIONS_TOO_SMALL")
    return image


def plant_pixel_fraction(image: Image.Image) -> float:
    """Fraction of pixels whose hue/saturation/value is plausible for plant tissue.

    Hue 15°–170° (yellow-brown through green to cyan-green), saturation >= 0.15, value >= 0.12.
    This accepts healthy (green) and diseased (yellow/brown/necrotic-edge) tissue and rejects
    grey/black/white/blue backgrounds. It is a gate, not a classifier.
    """
    hsv = np.asarray(image.resize((128, 128)).convert("HSV"), dtype=np.float32)
    h = hsv[..., 0] * (360.0 / 255.0)
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    plant = (h >= 15) & (h <= 170) & (s >= 0.15) & (v >= 0.12)
    return float(plant.mean())


def assess(image: Image.Image) -> QualityResult:
    gray = np.asarray(image.resize((256, 256)).convert("L"), dtype=np.float32)
    mean = float(gray.mean())
    dark = float((gray <= 18).mean())
    bright = float((gray >= 245).mean())
    lap = -4 * gray + np.roll(gray, 1, 0) + np.roll(gray, -1, 0) + np.roll(gray, 1, 1) + np.roll(gray, -1, 1)
    focus = float(lap[1:-1, 1:-1].var())
    plant = plant_pixel_fraction(image)
    issues: list[dict] = []
    if mean < 38 or dark > 0.65:
        issues.append({"code": "TOO_DARK", "score": round(mean / 255, 4)})
    if mean > 225 or bright > 0.65:
        issues.append({"code": "OVEREXPOSED", "score": round(bright, 4)})
    if focus < 18:
        issues.append({"code": "POSSIBLY_BLURRY", "score": round(focus, 4)})
    if plant < PLANT_PIXEL_MIN_FRACTION:
        issues.append({"code": "CROP_NOT_VISIBLE", "score": round(plant, 4)})
    return QualityResult(
        acceptable=not issues,
        issues=issues,
        metadata={
            "method": "PIXEL_QUALITY_V2",
            "brightnessMean": round(mean, 4),
            "focusScore": round(focus, 4),
            "darkRatio": round(dark, 4),
            "brightRatio": round(bright, 4),
            "plantPixelFraction": round(plant, 4),
        },
    )
