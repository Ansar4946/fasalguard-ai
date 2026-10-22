import numpy as np
import pytest

from app.satellite.science import calculate, reflectance, statistics


def sample(shape=(1, 1)):
    return {key: np.full(shape, value, dtype=np.float32) for key, value in {"blue": 0.03, "green": 0.06, "red": 0.04, "nir": 0.45, "swir16": 0.2}.items()}


def test_numerical_indices():
    result, valid = calculate(sample(), np.array([[4]]), np.array([[True]]))
    for name, expected in {"NDVI": 0.83673469, "EVI": 0.69965870, "NDWI": -0.76470588, "NDMI": 0.38461538}.items():
        assert result[name][0, 0] == pytest.approx(expected, abs=1e-6)
    assert valid.all()


@pytest.mark.parametrize("scl", [0, 1, 2, 3, 7, 8, 9, 10, 11])
def test_shared_scl_mask(scl):
    result, valid = calculate(sample(), np.array([[scl]]), np.array([[True]]))
    assert not valid.any()
    assert all(np.isnan(value).all() for value in result.values())


def test_denominator_nodata_and_boundary():
    bands = sample((1, 4))
    bands["nir"][0, 0] = 0
    bands["red"][0, 0] = 0
    bands["blue"][0, 1] = np.nan
    result, valid = calculate(bands, np.full((1, 4), 4), np.array([[True, True, False, True]]))
    assert valid.tolist() == [[False, False, False, True]]
    assert np.isnan(result["NDVI"][0, :3]).all()


def test_all_masked_is_null_and_does_not_mislabel_nodata_as_cloud():
    stats = statistics(np.full((1, 2), np.nan), np.array([[True, True]]), np.array([[9, 0]]))
    assert stats["mean"] is None
    assert stats["validPixelPercentage"] == 0
    assert stats["maskedPixelPercentage"] == 100
    assert stats["maskedCloudPercentage"] == 50


def test_offset_applied_once_and_evi_constant_requires_reflectance():
    raw = np.array([[5500, 0]], dtype=np.uint16)
    asset = {"raster:bands": [{"scale": 0.0001, "offset": -0.1, "nodata": 0}]}
    original = reflectance(raw, asset, {"earthsearch:boa_offset_applied": False}, "sentinel-2-c1-l2a")
    harmonized = reflectance(raw - np.array([[1000, 0]], dtype=np.uint16), asset, {"earthsearch:boa_offset_applied": True})
    assert original[0, 0] == pytest.approx(0.45)
    np.testing.assert_allclose(original, harmonized, atol=1e-6)
    assert np.isnan(original[0, 1])
    with pytest.raises(ValueError, match="AMBIGUOUS_RADIOMETRY"):
        reflectance(raw, asset, {"earthsearch:boa_offset_applied": False}, "sentinel-2-l2a")
    for malformed in ({}, {"raster:bands": [{"scale": 0.0001}]}):
        with pytest.raises(ValueError, match="MISSING_RADIOMETRY"):
            reflectance(raw, malformed, {})


def test_evi_is_not_artificially_clipped():
    bands = sample()
    bands["blue"][:] = 0.2
    bands["red"][:] = 0.05
    bands["nir"][:] = 0.6
    result, _ = calculate(bands, np.array([[4]]), np.array([[True]]))
    assert result["EVI"][0, 0] > 1
