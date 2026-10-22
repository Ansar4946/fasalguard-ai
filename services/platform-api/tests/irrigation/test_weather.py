import copy
import math
from datetime import date

import httpx
import pytest
import respx

from app.irrigation.weather import WeatherUnavailable, archive, normalize


def payload():
    return {
        "timezone": "Asia/Karachi",
        "daily_units": {"et0_fao_evapotranspiration": "mm", "precipitation_sum": "mm"},
        "hourly_units": {"wind_speed_10m": "m/s", "relative_humidity_2m": "%"},
        "daily": {"time": ["2025-01-01"], "et0_fao_evapotranspiration": [4], "precipitation_sum": [0]},
        "hourly": {"time": [f"2025-01-01T{hour:02}:00" for hour in range(24)], "wind_speed_10m": [2] * 24, "relative_humidity_2m": [50] * 24},
    }


def test_daily_units_and_wind_height_conversion():
    rows, provenance = normalize(payload(), date(2025, 1, 1), date(2025, 1, 1))
    assert rows[0]["et0Mm"] == 4  # daily ET0, never multiplied24 times
    assert rows[0]["wind2mMs"] == pytest.approx(2 * 4.87 / math.log(67.8 * 10 - 5.42))
    assert provenance["kind"] == "REANALYSIS_NOT_FIELD_MEASUREMENT"


@pytest.mark.parametrize("change", ["missing", "units", "hours", "timezone"])
def test_missing_hour_units_and_timezone_rejected(change):
    data = copy.deepcopy(payload())
    if change == "missing":
        data["hourly"]["wind_speed_10m"][5] = None
    if change == "units":
        data["daily_units"]["et0_fao_evapotranspiration"] = "inch"
    if change == "hours":
        data["hourly"]["time"][2] = data["hourly"]["time"][1]
    if change == "timezone":
        data["timezone"] = "UTC"
    with pytest.raises(WeatherUnavailable):
        normalize(data, date(2025, 1, 1), date(2025, 1, 1))


@respx.mock
@pytest.mark.parametrize("status", [429, 500, 503])
def test_provider_outage_has_no_weather_fallback(status):
    respx.get("https://archive-api.open-meteo.com/v1/archive").mock(return_value=httpx.Response(status))
    with pytest.raises(WeatherUnavailable, match="WEATHER_UNAVAILABLE"):
        archive(31, 72, date(2025, 1, 1), date(2025, 1, 1))


@respx.mock
def test_provider_timeout_has_no_fallback():
    respx.get("https://archive-api.open-meteo.com/v1/archive").mock(side_effect=httpx.ReadTimeout("test timeout"))
    with pytest.raises(WeatherUnavailable):
        archive(31, 72, date(2025, 1, 1), date(2025, 1, 1))
