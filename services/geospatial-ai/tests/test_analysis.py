from app.main import baseline_context, historical_mean
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
