"""Isolated pyWaPOR ETLook v3 pipeline; no interactive credential prompts or fake outputs."""

import builtins
import contextlib
import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import UUID

import numpy as np
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom

from app.config import get_settings
from app.irrigation.science import water_productivity
from app.satellite.raster import geometry


class WaporBlocked(Exception):
    def __init__(self, code):
        self.code = code


def private_artifact(run_id):
    base = Path(get_settings().wapor_work_dir).resolve()
    path = (base / str(UUID(str(run_id))) / "output.nc").resolve()
    if not path.is_relative_to(base):
        raise ValueError("UNSAFE_ARTIFACT_PATH")
    return path


def summarize(dataset, polygon, start, end, carbon_fraction, max_pixels):
    """Daily products only, fixed units, common valid field pixels across the whole period."""
    if "aeti_24_mm" not in dataset or "npp" not in dataset:
        raise WaporBlocked("WAPOR_REQUIRED_PRODUCTS_MISSING")
    if dataset["aeti_24_mm"].attrs.get("units") != "mm day-1" or dataset["npp"].attrs.get("units") != "gC m-2 day-1":
        raise WaporBlocked("WAPOR_UNSUPPORTED_UNITS")
    expected = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    dates = [datetime.fromisoformat(str(value)[:19]).date() for value in dataset.time_bins.values.astype("datetime64[s]")]
    if dates != expected:
        raise WaporBlocked("WAPOR_INCOMPLETE_DAILY_PERIOD")
    et = dataset["aeti_24_mm"].transpose("time_bins", "y", "x").values
    npp = dataset["npp"].transpose("time_bins", "y", "x").values
    if et.shape != npp.shape or et.size > max_pixels * len(dates):
        raise WaporBlocked("WAPOR_RASTER_LIMIT")
    crs = dataset.rio.crs
    if crs is None:
        raise WaporBlocked("WAPOR_MISSING_CRS")
    transform = dataset.rio.transform(recalc=True)
    inside = geometry_mask([transform_geom("EPSG:4326", crs, polygon)], out_shape=et.shape[1:], transform=transform, invert=True)
    field_count = int(inside.sum())
    valid = inside & np.all(np.isfinite(et) & np.isfinite(npp) & (et >= 0) & (npp >= 0), axis=0)
    valid &= et.sum(axis=0) > 0
    count = int(valid.sum())
    if count < 4 or not field_count or count / field_count < 0.8:
        raise WaporBlocked("WAPOR_INSUFFICIENT_FIELD_COVERAGE")
    # Geographic grid cells have different areas; use ellipsoidal row area weights.
    weights = np.ones(inside.shape)
    if crs.is_geographic:
        if crs.to_epsg() != 4326 or transform.b != 0 or transform.d != 0:
            raise WaporBlocked("WAPOR_UNSUPPORTED_GRID")
        from pyproj import Geod

        geod = Geod(ellps="WGS84")
        for y in range(weights.shape[0]):
            left, top = transform * (0, y)
            right, bottom = transform * (1, y + 1)
            area, _ = geod.polygon_area_perimeter([left, right, right, left], [top, top, bottom, bottom])
            weights[y, :] = abs(area)
    elif not crs.is_projected:
        raise WaporBlocked("WAPOR_UNSUPPORTED_GRID")
    et_mm = float(np.average(et.sum(axis=0)[valid], weights=weights[valid]))
    biomass = float(np.average(npp.sum(axis=0)[valid] * 10 / carbon_fraction, weights=weights[valid]))
    return {
        "actualEtMm": et_mm,
        "biomassKgDmHa": biomass,
        "biomassWaterProductivityKgM3": water_productivity(biomass, et_mm),
        "fieldPixelCount": field_count,
        "validPixelCount": count,
        "validCoveragePercent": 100 * count / field_count,
        "qualityBasis": "FINITE_MODEL_OUTPUT_NOT_CLEAR_PIXEL_COVERAGE",
        "dryMatterCarbonFraction": carbon_fraction,
        "startDate": str(start),
        "endDate": str(end),
        "method": "PYWAPOR_3.7.3_ETLOOK_V3_NPP_CARBON_TO_DRY_MATTER",
        "isCropYield": False,
        "crs": str(crs),
        "nativeGrid": list(transform)[:6],
        "resolution": list(dataset.rio.resolution()),
    }


def compute(run_id, snapshot):
    settings = get_settings()
    if not settings.wapor_enabled:
        raise WaporBlocked("WAPOR_NOT_CONFIGURED")
    if settings.wapor_configuration not in {"WaPOR3_level_2", "WaPOR3_level_3"}:
        raise WaporBlocked("WAPOR_UNSUPPORTED_CONFIGURATION")
    try:
        import pywapor
    except ImportError as exc:
        raise WaporBlocked("WAPOR_WORKER_DEPENDENCIES_MISSING") from exc
    polygon = snapshot["context"]["boundary"]
    geom = geometry(polygon)
    west, south, east, north = geom.bounds
    # Conservative job footprint cap before upstream downloads, including narrow fields.
    if east - west > 0.05 or north - south > 0.05 or geom.area > 0.001:
        raise WaporBlocked("WAPOR_FOOTPRINT_LIMIT")
    request = snapshot["request"]["body"]
    start, end = date.fromisoformat(request["startDate"]), date.fromisoformat(request["endDate"])
    path = private_artifact(run_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    def no_prompt(*_args, **_kwargs):
        raise WaporBlocked("WAPOR_PROVIDER_CREDENTIALS_REQUIRED")

    # Account provisioning is an explicit operator action in this dedicated worker.
    # Dedicated prefork child, concurrency1: parent enforces the hard task timeout.
    # Load only explicitly mounted operator-provisioned encrypted credentials.
    credential_dir = Path(settings.wapor_credentials_dir)
    try:
        from cryptography.fernet import Fernet

        cipher = Fernet((credential_dir / "secret.txt").read_bytes().strip())
        accounts = json.loads((credential_dir / "keys.json").read_text())
    except (OSError, ValueError) as exc:
        raise WaporBlocked("WAPOR_PROVIDER_CREDENTIALS_REQUIRED") from exc

    def credentials(account):
        try:
            username, password = accounts[account]
            return (cipher.decrypt(username.encode()).decode(), cipher.decrypt(password.encode()).decode())
        except Exception as exc:  # noqa: BLE001
            raise WaporBlocked("WAPOR_PROVIDER_CREDENTIALS_REQUIRED") from exc

    old_input = builtins.input
    old_credentials = pywapor.collect.accounts.get
    pywapor.collect.accounts.get = credentials
    builtins.input = no_prompt
    try:
        with open(os.devnull, "w", encoding="utf8") as output, contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            project = pywapor.Project(str(path.parent), [west, south, east, north], [str(start), str(end)])
            project.load_configuration(name=settings.wapor_configuration)
            project.set_passwords()
            project.download_data()
            project.run_pre_se_root()
            project.run_se_root()
            project.run_pre_et_look(bin_length=1)
            dataset = project.run_et_look(et_look_version="v3", export_vars=["aeti_24_mm", "npp"])
            if dataset is None:
                raise WaporBlocked("WAPOR_NO_OUTPUT")
            with dataset:
                result = summarize(dataset, polygon, start, end, request["dryMatterCarbonFraction"], settings.wapor_max_pixels)
                temporary = path.with_suffix(".tmp.nc")
                dataset.to_netcdf(temporary)
                temporary.replace(path)
        return {**result, "carbonFractionSource": request["carbonFractionSource"], "artifact": f"/api/water-productivity-runs/{run_id}/artifact"}
    finally:
        builtins.input = old_input
        pywapor.collect.accounts.get = old_credentials
