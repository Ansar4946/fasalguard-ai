import json

import httpx
import pytest
import respx

from app.config import Settings
from app.crop_scans import vision
from app.crop_scans.vision import ModelConfig, RoboflowClient, VisionError

KEY = "rf_test_key_DO_NOT_LEAK"


def settings(**kw) -> Settings:
    base = dict(
        DATABASE_URL="postgresql://u:p@h/db",
        JWT_ACCESS_SECRET="x" * 40,
        ROBOFLOW_API_KEY=KEY,
        ROBOFLOW_WHEAT_MODEL_ID="wheat-m",
        ROBOFLOW_WHEAT_MODEL_VERSION="1",
        ROBOFLOW_RICE_MODEL_ID="rice-m",
        ROBOFLOW_RICE_MODEL_VERSION="1",
        ROBOFLOW_COTTON_MODEL_ID="cotton-m",
        ROBOFLOW_COTTON_MODEL_VERSION="1",
    )
    base.update(kw)
    return Settings(**base)


# Response shapes observed from the real deployed models on 2026-10-13 (image field removed).
WHEAT_MULTILABEL = {
    "predictions": {"BlackPoint": {"confidence": 0.529}, "HealthyLeaf": {"confidence": 0.51}, "WheatBlast": {"confidence": 0.02}},
    "predicted_classes": ["BlackPoint", "HealthyLeaf"],
}
RICE_SINGLE = {"predictions": [{"class": "Healthy", "confidence": 0.92}, {"class": "Blast", "confidence": 0.05}], "top": "Healthy", "confidence": 0.92}
EMPTY = {"predictions": [], "top": None, "confidence": 0.0}


def test_normalize_multilabel_dict():
    assert vision.normalize_predictions(WHEAT_MULTILABEL)[:2] == [
        {"condition": "BlackPoint", "confidence": 0.529},
        {"condition": "HealthyLeaf", "confidence": 0.51},
    ]


def test_normalize_single_label_list():
    assert vision.normalize_predictions(RICE_SINGLE)[0] == {"condition": "Healthy", "confidence": 0.92}


def test_normalize_top_only_and_empty():
    assert vision.normalize_predictions({"top": "Blast", "confidence": 0.7}) == [{"condition": "Blast", "confidence": 0.7}]
    assert vision.normalize_predictions(EMPTY) == []


def test_normalize_drops_invalid_confidences():
    r = {
        "predictions": [
            {"class": "A", "confidence": 1.4},
            {"class": "B", "confidence": -0.1},
            {"class": "C", "confidence": True},
            {"class": "D", "confidence": 0.3},
        ]
    }
    assert vision.normalize_predictions(r) == [{"condition": "D", "confidence": 0.3}]


def test_aggregate_averages_over_all_images():
    agg = vision.aggregate(
        [[{"condition": "Blast", "confidence": 0.9}], [{"condition": "Blast", "confidence": 0.5}, {"condition": "Healthy", "confidence": 0.4}]]
    )
    assert agg[0] == {"condition": "Blast", "confidence": 0.7, "supportingImages": 2}
    assert agg[1]["condition"] == "Healthy" and agg[1]["confidence"] == pytest.approx(0.2)


@pytest.mark.parametrize(
    "crops,code",
    [
        ([None], "CROP_CONTEXT_REQUIRED"),
        ([""], "CROP_CONTEXT_REQUIRED"),
        (["Maize"], "CROP_NOT_SUPPORTED"),
        (["sugarcane"], "CROP_NOT_SUPPORTED"),
        (["wheat", "rice"], "CROP_CONTEXT_MISMATCH"),
    ],
)
def test_select_model_never_falls_back_to_another_crop(crops, code):
    with pytest.raises(VisionError) as e:
        vision.select_model(settings(), crops)
    assert e.value.code == code


def test_select_model_case_insensitive_and_explicit():
    assert vision.select_model(settings(), [" Wheat ", "wheat"]).model_id == "wheat-m"
    assert vision.select_model(settings(), ["COTTON"]).model_id == "cotton-m"


def test_select_model_requires_key_and_registered_model():
    with pytest.raises(VisionError) as e:
        vision.select_model(settings(ROBOFLOW_API_KEY=""), ["wheat"])
    assert e.value.code == "VISION_PROVIDER_NOT_CONFIGURED"
    with pytest.raises(VisionError) as e:
        vision.select_model(settings(ROBOFLOW_COTTON_MODEL_ID=""), ["cotton"])
    assert e.value.code == "CROP_NOT_SUPPORTED"


MODEL = ModelConfig("rice", "rice-m", "1")
URL = "https://serverless.roboflow.com/rice-m/1"


@respx.mock
def test_predict_success_strips_image_and_never_stores_key():
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={**RICE_SINGLE, "image": {"width": 9}}))
    p = RoboflowClient(settings()).predict(MODEL, [b"jpeg1", b"jpeg2"])
    assert route.call_count == 2 and route.calls[0].request.url.params["api_key"] == KEY
    assert p.predicted_condition == "Healthy" and p.confidence == pytest.approx(0.92)
    assert p.alternatives == [{"condition": "Blast", "confidence": 0.05}]
    raw = json.dumps(p.raw)
    assert KEY not in raw and '"image"' not in raw


@pytest.mark.parametrize(
    "response,code,retryable",
    [
        (httpx.Response(500), "VISION_PROVIDER_UNAVAILABLE", True),
        (httpx.Response(503), "VISION_PROVIDER_UNAVAILABLE", True),
        (httpx.Response(429), "VISION_PROVIDER_UNAVAILABLE", True),
        (httpx.Response(401), "VISION_PROVIDER_AUTH_FAILED", False),
        (httpx.Response(404), "VISION_MODEL_NOT_FOUND", False),
        (httpx.Response(400), "VISION_PROVIDER_REJECTED", False),
        (httpx.Response(200, content=b"not json"), "VISION_PROVIDER_BAD_RESPONSE", False),
        (httpx.Response(200, json=[1, 2]), "VISION_PROVIDER_BAD_RESPONSE", False),
        (httpx.Response(200, json=EMPTY), "VISION_NO_USABLE_PREDICTION", False),
    ],
)
@respx.mock
def test_predict_error_mapping(response, code, retryable):
    respx.post(URL).mock(return_value=response)
    with pytest.raises(VisionError) as e:
        RoboflowClient(settings()).predict(MODEL, [b"jpeg"])
    assert (e.value.code, e.value.retryable) == (code, retryable)


@respx.mock
def test_predict_timeout_is_retryable():
    respx.post(URL).mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(VisionError) as e:
        RoboflowClient(settings()).predict(MODEL, [b"jpeg"])
    assert e.value.code == "VISION_PROVIDER_TIMEOUT" and e.value.retryable


@respx.mock
def test_predict_connection_error_is_retryable():
    respx.post(URL).mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(VisionError) as e:
        RoboflowClient(settings()).predict(MODEL, [b"jpeg"])
    assert e.value.code == "VISION_PROVIDER_UNAVAILABLE" and e.value.retryable


def test_predict_requires_images():
    with pytest.raises(VisionError) as e:
        RoboflowClient(settings()).predict(MODEL, [])
    assert e.value.code == "SCAN_IMAGE_REQUIRED"
