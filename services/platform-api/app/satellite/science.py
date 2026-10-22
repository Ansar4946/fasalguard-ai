"""Reflectance indices adapted from OpenFarm (BSD-3-Clause; see licenses/OPENFARM.txt).

Corrections: explicit metadata normalization, no EVI clipping, shared conservative
SCL/field/nodata mask, and missing denominators are NaN rather than healthy zeroes.
"""

import numpy as np

VERSION = "f02-reflectance-scl-v2"
INDICES = ("NDVI", "EVI", "NDWI", "NDMI")
CLEAR_CLASSES = (4, 5, 6)  # vegetation, bare ground, water; reject uncertain/shadow pixels


def reflectance(dn: np.ndarray, asset: dict, properties: dict, collection: str = "sentinel-2-l2a") -> np.ndarray:
    bands = asset.get("raster:bands", [])
    if len(bands) != 1:
        raise ValueError("MISSING_RADIOMETRY")
    scale = bands[0].get("scale")
    offset = bands[0].get("offset")
    if scale is None or not np.isfinite(scale) or scale <= 0:
        raise ValueError("MISSING_RADIOMETRY")
    applied = properties.get("earthsearch:boa_offset_applied")
    if applied is True:
        offset = 0.0  # harmonized EarthSearch COGs already have the BOA offset applied
    elif offset is None or not np.isfinite(offset):
        raise ValueError("MISSING_RADIOMETRY")
    elif collection == "sentinel-2-l2a" and offset != 0:
        # Element84 issue #66 reports inconsistent pre-C1 flags. Do not guess for
        # unharmonized legacy COGs; raw C1 assets use declared scale/offset once.
        raise ValueError("AMBIGUOUS_RADIOMETRY")
    out = dn.astype(np.float32) * float(scale) + float(offset)
    nodata = bands[0].get("nodata", 0)
    out[(dn == nodata) | ~np.isfinite(dn)] = np.nan
    return out


def ratio(numerator: np.ndarray, denominator: np.ndarray, valid: np.ndarray) -> np.ndarray:
    out = np.full(numerator.shape, np.nan, dtype=np.float32)
    np.divide(numerator, denominator, out=out, where=valid & np.isfinite(denominator) & (np.abs(denominator) > 1e-6))
    out[~np.isfinite(out)] = np.nan
    return out


def calculate(bands: dict[str, np.ndarray], scl: np.ndarray, inside: np.ndarray) -> tuple[dict, np.ndarray]:
    blue, green, red, nir, swir = (bands[k] for k in ("blue", "green", "red", "nir", "swir16"))
    valid = inside & np.isin(scl, CLEAR_CLASSES)
    for band in bands.values():
        valid &= np.isfinite(band)
    # One shared denominator mask makes coverage and previews consistent across indices.
    denominators = (nir + red, nir + 6 * red - 7.5 * blue + 1, green + nir, nir + swir)
    for denominator in denominators:
        valid &= np.isfinite(denominator) & (np.abs(denominator) > 1e-6)
    return {
        "NDVI": ratio(nir - red, denominators[0], valid),
        "EVI": ratio(2.5 * (nir - red), denominators[1], valid),
        "NDWI": ratio(green - nir, denominators[2], valid),
        "NDMI": ratio(nir - swir, denominators[3], valid),
    }, valid


def statistics(data: np.ndarray, inside: np.ndarray, scl: np.ndarray) -> dict:
    selected = data[inside & np.isfinite(data)]
    total = int(inside.sum())
    valid = int(selected.size)
    cloud = int((inside & np.isin(scl, (3, 8, 9, 10))).sum())
    return {
        "mean": float(selected.mean()) if valid else None,
        "min": float(selected.min()) if valid else None,
        "max": float(selected.max()) if valid else None,
        "validPixelCount": valid,
        "fieldPixelCount": total,
        "validPixelPercentage": 100 * valid / total if total else 0,
        "maskedPixelPercentage": 100 * (total - valid) / total if total else 100,
        "maskedCloudPercentage": 100 * cloud / total if total else 0,
        "processingVersion": VERSION,
    }
