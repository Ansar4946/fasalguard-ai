import base64
import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app, baseline_context, historical_mean
def test_historical_baseline_is_index_specific():
    items=[{"index":"NDVI","statistics":{"mean":.6}},{"index":"NDVI","statistics":{"mean":.4}},{"index":"NDMI","statistics":{"mean":.1}}]
    assert historical_mean(items,"NDVI")==.5
    assert historical_mean(items,"UNKNOWN") is None

def test_baseline_context_uses_unique_capture_history():
    items=[
        {"captureId":"one","index":"NDVI"},
        {"captureId":"one","index":"NDMI"},
        {"captureId":"two","index":"NDVI"},
        {"captureId":"three","index":"NDVI"},
    ]
    result=baseline_context(items)
    assert result.method=="ROLLING_FIELD_BASELINE"
    assert result.captureIds==["one","two","three"]
    assert result.observationCount==3

def encoded_image(color:tuple[int,int,int])->str:
    output=io.BytesIO()
    Image.new("RGB",(640,480),color).save(output,format="JPEG")
    return base64.b64encode(output.getvalue()).decode("ascii")

def test_quality_rejects_overexposed_image():
    client=TestClient(app)
    response=client.post("/v1/vision/quality",json={"imageBase64":encoded_image((255,255,255)),"contentType":"image/jpeg","category":"LEAF_FRONT"})
    assert response.status_code==200
    assert response.json()["acceptable"] is False
    assert "OVEREXPOSED" in [issue["code"] for issue in response.json()["issues"]]

def test_predict_fails_honestly_without_model(monkeypatch,tmp_path):
    monkeypatch.setenv("VISION_MODEL_PATH",str(tmp_path/"missing.onnx"))
    monkeypatch.setenv("VISION_MODEL_MANIFEST_PATH",str(tmp_path/"missing.json"))
    client=TestClient(app)
    response=client.post("/v1/vision/predict",json={"images":[{"imageBase64":encoded_image((40,120,50)),"contentType":"image/jpeg","category":"LEAF_FRONT"}]})
    assert response.status_code==503
    assert response.json()["detail"]=="MODEL_NOT_CONFIGURED"
