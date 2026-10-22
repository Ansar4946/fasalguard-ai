import numpy as np
import pytest
from rasterio.features import geometry_mask
from rasterio.transform import from_origin

from app.satellite.raster import geometry, private_path


def test_field_holes_and_adjacent_field_isolation():
    polygon = {"type": "Polygon", "coordinates": [[[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]], [[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]]]}
    mask = geometry_mask([polygon], out_shape=(4, 5), transform=from_origin(0, 40, 10, 10), invert=True)
    assert int(mask.sum()) == 12
    assert not mask[:, 4].any()
    assert not mask[1:3, 1:3].any()


def test_invalid_geometry_and_path_traversal():
    with pytest.raises(ValueError):
        geometry({"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]})
    with pytest.raises(ValueError, match="MEDIA_KEY_OUTSIDE_STORAGE"):
        private_path("../../../etc/passwd")


def test_no_pixels_outside_field_enter_statistics():
    from app.satellite.science import statistics

    values = np.array([[0.1, 1000]], dtype=np.float32)
    assert statistics(values, np.array([[True, False]]), np.array([[4, 4]]))["mean"] == pytest.approx(0.1)


def test_actual_geotiff_processing_aligns_scl_and_masks_all_outputs(tmp_path, monkeypatch):
    """Synthetic raster fixture, never returned as real satellite imagery."""
    import io

    import rasterio
    from PIL import Image
    from rasterio.io import MemoryFile
    from rasterio.warp import transform_geom

    from app.satellite import raster

    assets = {}
    for name, value in {"blue": 300, "green": 600, "red": 400, "nir": 4500, "swir16": 2000, "scl": 4}.items():
        is_scl = name == "scl"
        size, resolution = (2, 20) if is_scl else (4, 10)
        data = np.full((size, size), value, dtype=np.uint16)
        if is_scl:
            data[0, 0] = 9
        path = tmp_path / f"{name}.tif"
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            width=size,
            height=size,
            count=1,
            dtype="uint16",
            crs="EPSG:32642",
            transform=from_origin(786450, 3433700, resolution, resolution),
            nodata=0,
        ) as dst:
            dst.write(data, 1)
        assets[name] = {"href": str(path), "raster:bands": [{"scale": 0.0001, "offset": -0.1, "nodata": 0}]}
    projected = {"type": "Polygon", "coordinates": [[[786450, 3433660], [786490, 3433660], [786490, 3433700], [786450, 3433700], [786450, 3433660]]]}
    polygon = transform_geom("EPSG:32642", "EPSG:4326", projected)
    monkeypatch.setattr(raster, "asset_url", lambda asset: asset["href"])
    result = raster.process({"collection": "sentinel-2-l2a", "assets": assets, "properties": {"earthsearch:boa_offset_applied": True}}, polygon)
    stats = result["statistics"]
    assert 0 < stats["NDVI"]["validPixelCount"] < stats["NDVI"]["fieldPixelCount"]
    assert all(s["validPixelCount"] == stats["NDVI"]["validPixelCount"] for s in stats.values())
    with MemoryFile(result["outputs"]["EVI"][0]) as memory, memory.open() as src:
        evi, valid = src.read(1), src.read(2)
        assert src.crs.to_epsg() == 32643  # field east of72E, source tile is zone42
        assert src.transform.a == 10
        assert np.isnan(evi[valid == 0]).all()
        np.testing.assert_allclose(evi[valid == 1], 0.6996587, atol=1e-6)
    png = np.array(Image.open(io.BytesIO(result["outputs"]["TRUE_COLOR"][0])))
    assert int((png[:, :, 3] > 0).sum()) == stats["NDVI"]["validPixelCount"]
    # An overlapping acquisition in another UTM zone must keep the field grid.
    from rasterio.warp import Resampling, calculate_default_transform, reproject

    alternate = {}
    for name, asset in assets.items():
        destination = tmp_path / f"alternate-{name}.tif"
        with rasterio.open(asset["href"]) as src:
            transform, width, height = calculate_default_transform(
                src.crs, "EPSG:32643", src.width, src.height, *src.bounds, resolution=20 if name == "scl" else 10
            )
            profile = {**src.profile, "crs": "EPSG:32643", "transform": transform, "width": width, "height": height}
            with rasterio.open(destination, "w", **profile) as dst:
                reproject(rasterio.band(src, 1), rasterio.band(dst, 1), resampling=Resampling.nearest)
        alternate[name] = {**asset, "href": str(destination)}
    second = raster.process({"collection": "sentinel-2-l2a", "assets": alternate, "properties": {"earthsearch:boa_offset_applied": True}}, polygon)
    assert second["provenance"] == result["provenance"]
