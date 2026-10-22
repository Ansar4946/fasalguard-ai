"""Pinned pyfao56 adapter (CC0). See licenses/PYFAO56.txt and F03.md.

Every agronomic parameter is explicit. Actual ET is distinct from reference ET.
Recommendations are advisory and never recorded as actual irrigation events.
"""

import math
from datetime import timedelta

import pandas as pd
import pyfao56 as fao

from app.irrigation.schemas import Parameters, WeatherDay

VERSION = "f03-pyfao56-1.4.3-dual-v1"


def reference_et(*, elevation_m, latitude, day, radiation_mj, tmax_c, tmin_c, vapor_kpa, wind_ms, wind_height_m=2):
    values = (elevation_m, latitude, radiation_mj, tmax_c, tmin_c, vapor_kpa, wind_ms, wind_height_m)
    if not all(math.isfinite(v) for v in values) or not -60 <= latitude <= 60 or tmin_c > tmax_c:
        raise ValueError("INVALID_WEATHER")
    if radiation_mj < 0 or vapor_kpa < 0 or wind_ms < 0 or wind_height_m < 0.1:
        raise ValueError("INVALID_WEATHER")
    value = fao.refet.ascedaily(
        "S", elevation_m, latitude, day.timetuple().tm_yday, radiation_mj, tmax_c, tmin_c, vapr=vapor_kpa, wndsp=wind_ms, wndht=wind_height_m
    )
    if not math.isfinite(value) or value < 0:
        raise ValueError("INVALID_REFERENCE_ET")
    return value


def calculate(profile: dict, days: list[dict], events: list[dict], area_ha: float):
    from datetime import date

    parameters = Parameters.model_validate(profile["parameters"])
    weather = [WeatherDay.model_validate(item) for item in days]
    start = date.fromisoformat(profile["initialDate"])
    if not weather or len(weather) > 366 or weather[0].date != start or area_ha <= 0 or not math.isfinite(area_ha):
        raise ValueError("INVALID_CALCULATION_RANGE")
    if any(item.date != start + timedelta(days=i) for i, item in enumerate(weather)):
        raise ValueError("INCOMPLETE_DAILY_WEATHER")
    if len(weather) > parameters.Lini + parameters.Ldev + parameters.Lmid + parameters.Lend:
        raise ValueError("OUTSIDE_CROP_STAGES")
    wth = fao.Weather()
    wth.wndht = 2.0  # API input is already normalized to wind at2m, never unknown height.
    wth.wdata = pd.DataFrame(
        [{"ETref": item.et0Mm, "Rain": item.rainMm, "Wndsp": item.wind2mMs, "RHmin": item.rhMinPercent, "MorP": "P"} for item in weather],
        index=[item.date.strftime("%Y-%j") for item in weather],
    ).reindex(columns=wth.cnames)
    irr = fao.Irrigation()
    for item in events:
        when = date.fromisoformat(str(item["date"]))
        if start <= when <= weather[-1].date:
            irr.addevent(when.year, when.timetuple().tm_yday, item["grossDepthMm"], item["wettedFraction"], 100 * item["efficiency"])
    model = fao.Model(start.strftime("%Y-%j"), weather[-1].date.strftime("%Y-%j"), fao.Parameters(**parameters.model_dump()), wth, irr=irr, roff=True)
    model.run()
    output = []
    columns = ("ETref", "ETc", "ETa", "TAW", "RAW", "Dr", "DP", "Runoff", "Rain", "Irrig", "IrrLoss", "Ks", "Zr")
    for i, (_, row) in enumerate(model.odata.iterrows()):
        values = {name: float(row[name]) for name in columns}
        if not all(math.isfinite(v) for v in values.values()) or values["Dr"] < -1e-6 or values["Dr"] > values["TAW"] + 1e-5:
            raise ValueError("INVALID_MODEL_OUTPUT")
        values["date"] = weather[i].date.isoformat()
        output.append(values)
    last = output[-1]
    net = last["Dr"] if last["Dr"] >= last["RAW"] else 0.0
    gross = net / profile["efficiency"]
    return {
        "daily": output,
        "advisory": {
            "asOf": last["date"],
            "netDepthMm": net,
            "grossDepthMm": gross,
            "volumeM3": gross * area_ha * 10,
            "basis": "END_OF_DAY_DEPLETION",
            "automaticApplication": False,
        },
        "method": VERSION,
        "assumptions": [
            "Homogeneous upland soil; no capillary rise, ponding or salinity",
            "No coefficient weather adjustment",
            "Soil evaporation starts depleted as defined by pyfao56",
            "Advisory is not a forecast or recorded irrigation",
        ],
        "initialCondition": profile["initialCondition"],
        "parameterVerification": "FARMER_SUPPLIED_NOT_CALIBRATED",
    }


def water_productivity(biomass_kg_ha: float, actual_et_mm: float):
    if not math.isfinite(biomass_kg_ha) or not math.isfinite(actual_et_mm) or biomass_kg_ha < 0 or actual_et_mm <= 0:
        raise ValueError("INVALID_PRODUCTIVITY_INPUT")
    return biomass_kg_ha / (actual_et_mm * 10)
