"""Synthetic xarray products validate the adapter only, never a live satellite claim."""

from datetime import date

import numpy as np
import pytest

from app.irrigation.wapor import WaporBlocked, private_artifact, summarize


def sample():
    xr = pytest.importorskip("xarray")
    pytest.importorskip("rioxarray")
    ds = xr.Dataset(
        {"aeti_24_mm": (("time_bins", "y", "x"), np.full((2, 3, 3), 4.0)), "npp": (("time_bins", "y", "x"), np.full((2, 3, 3), 1.8))},
        coords={
            "time_bins": np.array(["2025-01-01T12:00", "2025-01-02T12:00"], dtype="datetime64[ns]"),
            "x": [72.0005, 72.0015, 72.0025],
            "y": [31.0025, 31.0015, 31.0005],
        },
    )
    ds["aeti_24_mm"].attrs["units"] = "mm day-1"
    ds["npp"].attrs["units"] = "gC m-2 day-1"
    return ds.rio.write_crs("EPSG:4326")


POLYGON = {"type": "Polygon", "coordinates": [[[72, 31], [72.003, 31], [72.003, 31.003], [72, 31.003], [72, 31]]]}


def test_actual_grid_units_common_mask_and_carbon_conversion():
    ds = sample()
    result = summarize(ds, POLYGON, date(2025, 1, 1), date(2025, 1, 2), 0.45, 100)
    assert result["actualEtMm"] == pytest.approx(8)
    assert result["biomassKgDmHa"] == pytest.approx(80)
    assert result["biomassWaterProductivityKgM3"] == pytest.approx(1)
    assert not result["isCropYield"]
    ds["npp"].values[0, 0, 0] = np.nan
    assert summarize(ds, POLYGON, date(2025, 1, 1), date(2025, 1, 2), 0.45, 100)["validPixelCount"] == 8


@pytest.mark.parametrize("change", ["units", "dates", "missing", "coverage", "zero"])
def test_missing_or_incompatible_product_is_not_fabricated(change):
    ds = sample()
    if change == "units":
        ds["npp"].attrs["units"] = "kg/ha"
    if change == "dates":
        ds = ds.isel(time_bins=[0])
    if change == "missing":
        ds = ds.drop_vars("npp")
    if change == "coverage":
        ds["npp"].values[:, :2, :] = np.nan
    if change == "zero":
        ds["aeti_24_mm"].values[:] = 0
    with pytest.raises(WaporBlocked):
        summarize(ds, POLYGON, date(2025, 1, 1), date(2025, 1, 2), 0.45, 100)


def test_private_path_rejects_non_uuid():
    with pytest.raises(ValueError):
        private_artifact("../../secret")
