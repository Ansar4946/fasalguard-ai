"""Validated Open-Meteo forecasts; no synthetic fallback or inferred issuance time.

Daily variable selection follows OpenFarm weather.py (BSD-3-Clause); see notices.
"""

import logging
import math
import time
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import httpx

from app.config import get_settings

# httpx INFO logs include the full query string, which may contain a commercial key.
logging.getLogger("httpx").setLevel(logging.WARNING)

VARIABLES = {
    "temperatureC": ("temperature_2m", "°C", -100, 65),
    "relativeHumidityPercent": ("relative_humidity_2m", "%", 0, 100),
    "precipitationMm": ("precipitation", "mm", 0, 1000),
    "precipitationProbabilityPercent": ("precipitation_probability", "%", 0, 100),
    "windSpeedKph": ("wind_speed_10m", "km/h", 0, 500),
    "windGustKph": ("wind_gusts_10m", "km/h", 0, 500),
    "solarRadiationWm2": ("shortwave_radiation", "W/m²", 0, 1500),
    "et0Mm": ("et0_fao_evapotranspiration", "mm", 0, 10),
    "soilMoistureM3M3": ("soil_moisture_0_to_1cm", "m³/m³", 0, 1),
    "soilTemperatureC": ("soil_temperature_0cm", "°C", -100, 100),
}
DAILY = {
    "highC": ("temperature_2m_max", "°C"),
    "lowC": ("temperature_2m_min", "°C"),
    "totalPrecipitationMm": ("precipitation_sum", "mm"),
    "maxWindKph": ("wind_speed_10m_max", "km/h"),
    "maxRainProbabilityPercent": ("precipitation_probability_max", "%"),
}


class ProviderError(Exception):
    def __init__(self, code="WEATHER_PROVIDER_UNAVAILABLE", retryable=True):
        self.code, self.retryable = code, retryable
        super().__init__(code)


def number(value, low, high):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value) or not low <= value <= high:
        raise ProviderError("WEATHER_INVALID_RESPONSE", False)
    return value


def parse(raw, now=None):
    now = now or datetime.now(UTC)
    try:
        if raw["timezone"] != "Asia/Karachi":
            raise ValueError("Unexpected timezone")
        times = raw["hourly"]["time"]
        if len(times) != 168 or any(b - a != 3600 for a, b in zip(times, times[1:], strict=False)):
            raise ValueError("Incomplete hourly forecast")
        hourly = []
        for i, timestamp in enumerate(times):
            point = {"time": datetime.fromtimestamp(timestamp, UTC).isoformat()}
            for name, (variable, unit, low, high) in VARIABLES.items():
                if raw["hourly_units"][variable] != unit or len(raw["hourly"][variable]) != len(times):
                    raise ValueError("Invalid hourly units or lengths")
                point[name] = number(raw["hourly"][variable][i], low, high)
            if point["temperatureC"] is None:
                raise ValueError("Missing temperature")
            hourly.append(point)
        if not times[0] <= now.timestamp() <= times[-1]:
            raise ValueError("Forecast does not cover now")
        daily = []
        dates = raw["daily"]["time"]
        if len(dates) != 7:
            raise ValueError("Incomplete daily forecast")
        for i, timestamp in enumerate(dates):
            key = datetime.fromtimestamp(timestamp, ZoneInfo("Asia/Karachi")).date().isoformat()
            day = {"key": key}
            for name, (variable, unit) in DAILY.items():
                if raw["daily_units"][variable] != unit or len(raw["daily"][variable]) != 7:
                    raise ValueError("Invalid daily units or lengths")
                low, high = (-100, 65) if name in ("highC", "lowC") else (0, 100 if name == "maxRainProbabilityPercent" else 1000)
                day[name] = number(raw["daily"][variable][i], low, high)
            if day["highC"] is not None and day["lowC"] is not None and day["highC"] < day["lowC"]:
                raise ValueError("Daily maximum below minimum")
            daily.append(day)
        expected = sorted({datetime.fromtimestamp(t, ZoneInfo("Asia/Karachi")).date().isoformat() for t in times})
        if [d["key"] for d in daily] != expected or daily[0]["key"] != now.astimezone(ZoneInfo("Asia/Karachi")).date().isoformat():
            raise ValueError("Invalid daily dates")
        current = raw["current"]
        if not -900 <= now.timestamp() - current["time"] <= 7200:
            raise ValueError("Old current forecast")
        point = {"time": datetime.fromtimestamp(current["time"], UTC).isoformat()}
        for name, (variable, unit, low, high) in VARIABLES.items():
            if variable in current:
                if raw["current_units"][variable] != unit:
                    raise ValueError("Invalid current units")
                point[name] = number(current[variable], low, high)
            else:
                point[name] = None
        if point["temperatureC"] is None:
            raise ValueError("Missing current temperature")
        return {
            "provider": "OPEN_METEO",
            "timezone": "Asia/Karachi",
            "fetchedAt": now.isoformat(),
            "providerIssuedAt": None,
            "resolutionMinutes": 60,
            "current": point,
            "hourly": hourly,
            "daily": daily,
            "rawMetadata": {
                "dataKind": "MODEL_FORECAST",
                "processingVersion": "f04-v1",
                "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)",
                "gridLatitude": number(raw["latitude"], -90, 90),
                "gridLongitude": number(raw["longitude"], -180, 180),
            },
        }
    except (KeyError, ValueError, TypeError, OverflowError, OSError) as exc:
        raise ProviderError("WEATHER_INVALID_RESPONSE", False) from exc


def fetch(latitude, longitude):
    s = get_settings()
    if s.weather_provider != "open-meteo":
        raise ProviderError("WEATHER_PROVIDER_NOT_SUPPORTED", False)
    if s.environment == "production" and not s.open_meteo_api_key:
        raise ProviderError("WEATHER_COMMERCIAL_KEY_REQUIRED", False)
    host = "customer-api.open-meteo.com" if s.open_meteo_api_key else "api.open-meteo.com"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "Asia/Karachi",
        "timeformat": "unixtime",
        "forecast_days": 7,
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
        "hourly": ",".join(v[0] for v in VARIABLES.values()),
        "daily": ",".join(v[0] for v in DAILY.values()),
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m",
    }
    if s.open_meteo_api_key:
        params["apikey"] = s.open_meteo_api_key
    started = time.monotonic()
    with httpx.Client(timeout=3, follow_redirects=False, trust_env=False) as client:
        for attempt in range(2):
            try:
                with client.stream("GET", f"https://{host}/v1/forecast", params=params) as response:
                    if not response.is_success:
                        retryable = response.status_code == 429 or response.status_code >= 500
                        if retryable and attempt == 0:
                            # Ignore untrusted Retry-After; keep the complete request below the BFF budget.
                            time.sleep(0.2)
                            continue
                        raise ProviderError("WEATHER_RATE_LIMITED" if response.status_code == 429 else "WEATHER_PROVIDER_UNAVAILABLE", retryable)
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data.extend(chunk)
                        if len(data) > 1_000_000 or time.monotonic() - started > 7:
                            raise ProviderError("WEATHER_RESPONSE_LIMIT", False)
                    import json

                    return parse(json.loads(data))
            except (httpx.HTTPError, ValueError) as exc:
                if attempt:
                    raise ProviderError() from exc
                time.sleep(0.2)
    raise ProviderError()
