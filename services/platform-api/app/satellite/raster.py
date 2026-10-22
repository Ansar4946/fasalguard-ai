"""Metric, polygon-isolated source COG reading and tiled GeoTIFF output; see license notice.

Nearest sampling deliberately avoids cloud/nodata bleeding during interpolation.
SCL is 20m source information, even when output is on a 10m grid.
"""

import io
import math
import os
import uuid
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.features import geometry_mask
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_geom
from rasterio.windows import from_bounds
from shapely.geometry import shape

from app.config import get_settings
from app.satellite import science
from app.satellite.provider import asset_url


def geometry(polygon: dict):
    geom = shape(polygon)
    if geom.geom_type not in ("Polygon", "MultiPolygon") or geom.is_empty or not geom.is_valid:
        raise ValueError("INVALID_FIELD_GEOMETRY")
    west, south, east, north = geom.bounds
    if west < -180 or east > 180 or south < -80 or north > 84 or east - west > 1 or north - south > 1:
        raise ValueError("FIELD_GEOMETRY_OUT_OF_RANGE")
    if sum(len(ring.coords) for part in ([geom] if geom.geom_type == "Polygon" else geom.geoms) for ring in [part.exterior, *part.interiors]) > 10000:
        raise ValueError("FIELD_GEOMETRY_TOO_COMPLEX")
    return geom


def process(item: dict, polygon: dict) -> dict:
    field = geometry(polygon)
    assets = item["assets"]
    for name in ("blue", "green", "red", "nir", "swir16", "scl"):
        asset_url(assets[name])
    # Disable sidecar/listing requests; read only trusted range-addressable TIFF assets.
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="25",
        GDAL_HTTP_MAX_RETRY="1",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    ):
        with rasterio.open(asset_url(assets["red"])) as src:
            if not src.crs or not src.crs.is_projected or src.crs.linear_units != "metre":
                raise ValueError("UNSUPPORTED_RASTER_CRS")
            # A field's grid must not change when STAC selects an overlapping tile
            # from another UTM zone. Use the field centroid, not the scene CRS.
            longitude, latitude = field.centroid.x, field.centroid.y
            zone = max(1, min(60, math.floor((longitude + 180) / 6) + 1))
            crs = rasterio.crs.CRS.from_epsg((32600 if latitude >= 0 else 32700) + zone)
            projected = transform_geom("EPSG:4326", crs, polygon)
            west, south, east, north = shape(projected).bounds
            left, top = math.floor(west / 10) * 10, math.ceil(north / 10) * 10
            width, height = math.ceil((east - left) / 10), math.ceil((top - south) / 10)
            if width < 1 or height < 1 or width * height > get_settings().satellite_max_pixels:
                raise ValueError("FIELD_RASTER_TOO_LARGE")
            transform = from_origin(left, top, 10, 10)
        inside = geometry_mask([projected], out_shape=(height, width), transform=transform, invert=True)
        if not inside.any():
            raise ValueError("FIELD_SMALLER_THAN_PIXEL")
        bands = {}
        scl = None
        for name in ("blue", "green", "red", "nir", "swir16", "scl"):
            with rasterio.open(asset_url(assets[name])) as src:
                bounds = rasterio.warp.transform_bounds(crs, src.crs, left, top - height * 10, left + width * 10, top)
                window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
                # A padded bounded source window prevents reading an entire satellite tile.
                window = rasterio.windows.Window(window.col_off - 2, window.row_off - 2, window.width + 4, window.height + 4)
                if window.width * window.height > get_settings().satellite_max_pixels * 4:
                    raise ValueError("SOURCE_WINDOW_TOO_LARGE")
                raw = src.read(1, window=window, boundless=True, masked=True)
                values = raw.astype(np.float32).filled(np.nan)
                if name != "scl":
                    values = science.reflectance(values, assets[name], item["properties"], item["collection"])
                destination = np.full((height, width), np.nan, dtype=np.float32)
                reproject(
                    values,
                    destination,
                    src_transform=src.window_transform(window),
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=crs,
                    src_nodata=np.nan,
                    dst_nodata=np.nan,
                    resampling=Resampling.nearest,
                )
                if name == "scl":
                    scl = destination
                else:
                    bands[name] = destination
    indices, valid = science.calculate(bands, scl, inside)
    stats = {name: science.statistics(values, inside, scl) for name, values in indices.items()}
    rgb = np.stack([bands["red"], bands["green"], bands["blue"]], axis=-1)
    rgba = np.dstack([(np.nan_to_num(np.clip(rgb * 2.5, 0, 1)) * 255).astype(np.uint8), (valid * 255).astype(np.uint8)])
    preview = io.BytesIO()
    Image.fromarray(rgba).save(preview, format="PNG")
    outputs = {"TRUE_COLOR": (preview.getvalue(), "image/png")}
    for name, values in indices.items():
        with MemoryFile() as memory:
            with memory.open(
                driver="GTiff",
                width=width,
                height=height,
                count=2,
                dtype="float32",
                crs=crs,
                transform=transform,
                nodata=np.nan,
                compress="deflate",
                tiled=True,
                blockxsize=256,
                blockysize=256,
            ) as dst:
                dst.write(values, 1)
                dst.write(valid.astype(np.float32), 2)
            outputs[name] = (memory.read(), "image/tiff")
        # PNG is a presentation-only range; the TIFF/statistics preserve unclipped EVI.
        normalized = np.nan_to_num(np.clip((values + 1) / 2, 0, 1))
        pixels = np.dstack(
            [
                (255 * (1 - normalized)).astype(np.uint8),
                (255 * normalized).astype(np.uint8),
                np.zeros_like(valid, dtype=np.uint8),
                (valid * 255).astype(np.uint8),
            ]
        )
        preview = io.BytesIO()
        Image.fromarray(pixels).save(preview, format="PNG")
        outputs[f"{name}_PREVIEW"] = (preview.getvalue(), "image/png")
    return {
        "outputs": outputs,
        "statistics": stats,
        "provenance": {
            "processingVersion": science.VERSION,
            "crs": str(crs),
            "resolutionMetres": 10,
            "sclResolutionMetres": 20,
            "resampling": "nearest",
            "clearSclClasses": list(science.CLEAR_CLASSES),
            "transform": list(transform)[:6],
            "width": width,
            "height": height,
        },
    }


def private_path(key: str) -> Path:
    base = Path(get_settings().media_local_dir).resolve()
    target = (base / key).resolve()
    if not target.is_relative_to(base):
        raise ValueError("MEDIA_KEY_OUTSIDE_STORAGE")
    return target


def write_private(key: str, body: bytes) -> None:
    target = private_path(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(body)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
