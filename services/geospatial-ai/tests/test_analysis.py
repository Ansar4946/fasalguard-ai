from app.main import historical_mean
def test_historical_baseline_is_index_specific():
    items=[{"index":"NDVI","statistics":{"mean":.6}},{"index":"NDVI","statistics":{"mean":.4}},{"index":"NDMI","statistics":{"mean":.1}}]
    assert historical_mean(items,"NDVI")==.5
    assert historical_mean(items,"UNKNOWN") is None
