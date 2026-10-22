"""Bounded historical weather with daily unit/completeness provenance."""

import math
from datetime import UTC, datetime, timedelta

import httpx

from app.config import get_settings


class WeatherUnavailable(Exception):
    pass


def archive(latitude, longitude, start, end):
    settings = get_settings()
    key = settings.irrigation_weather_api_key
    if settings.environment == "production" and not key:
        raise WeatherUnavailable("WEATHER_COMMERCIAL_ACCESS_REQUIRED")
    base = "https://customer-archive-api.open-meteo.com" if key else "https://archive-api.open-meteo.com"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": str(start),
        "end_date": str(end),
        "timezone": "Asia/Karachi",
        "wind_speed_unit": "ms",
        "daily": "et0_fao_evapotranspiration,precipitation_sum",
        "hourly": "wind_speed_10m,relative_humidity_2m",
    }
    if key:
        params["apikey"] = key
    try:
        with httpx.Client(timeout=settings.irrigation_weather_timeout, follow_redirects=False, trust_env=False) as client:
            response = client.get(f"{base}/v1/archive", params=params)
            response.raise_for_status()
            if len(response.content) > 5_000_000:
                raise WeatherUnavailable("WEATHER_RESPONSE_TOO_LARGE")
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherUnavailable("WEATHER_UNAVAILABLE") from exc
    return normalize(data, start, end)


def normalize(data, start, end):
    try:
        if data["timezone"] != "Asia/Karachi" or data["hourly_units"]["wind_speed_10m"] != "m/s":
            raise ValueError("units")
        if data["daily_units"]["et0_fao_evapotranspiration"] != "mm" or data["daily_units"]["precipitation_sum"] != "mm":
            raise ValueError("units")
        if data["hourly_units"]["relative_humidity_2m"] != "%":
            raise ValueError("units")
        dates = [str(start + timedelta(days=i)) for i in range((end - start).days + 1)]
        if data["daily"]["time"] != dates or len(data["hourly"]["time"]) != len(dates) * 24:
            raise ValueError("dates")
        rows = []
        for i, day in enumerate(dates):
            hours = data["hourly"]["time"][24 * i : 24 * (i + 1)]
            if hours != [f"{day}T{hour:02}:00" for hour in range(24)]:
                raise ValueError("hours")
            winds = data["hourly"]["wind_speed_10m"][24 * i : 24 * (i + 1)]
            humidity = data["hourly"]["relative_humidity_2m"][24 * i : 24 * (i + 1)]
            if len(winds) != 24 or len(humidity) != 24 or not all(isinstance(v, int | float) and math.isfinite(v) for v in winds + humidity):
                raise ValueError("missing")
            if any(isinstance(v, bool) or v < 0 or v > 80 for v in winds) or any(isinstance(v, bool) or v < 0 or v > 100 for v in humidity):
                raise ValueError("invalid hourly measurement")
            rows.append(
                {
                    "date": day,
                    "et0Mm": data["daily"]["et0_fao_evapotranspiration"][i],
                    "rainMm": data["daily"]["precipitation_sum"][i],
                    "wind2mMs": sum(winds) / 24 * 4.87 / math.log(67.8 * 10 - 5.42),
                    "rhMinPercent": min(humidity),
                }
            )
        from app.irrigation.schemas import WeatherDay

        rows = [WeatherDay.model_validate(row).model_dump(mode="json") for row in rows]
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise WeatherUnavailable("WEATHER_INCOMPLETE_OR_INVALID") from exc
    return rows, {
        "provider": "OPEN_METEO_ARCHIVE",
        "kind": "REANALYSIS_NOT_FIELD_MEASUREMENT",
        "timezone": data["timezone"],
        "units": data["daily_units"],
        "windHeightConversion": "FAO56_10m_to_2m",
        "dailyEt0": "PROVIDER_FAO56_SHORT_GRASS",
        "retrievedAt": datetime.now(UTC).isoformat(),
        "gridLatitude": data.get("latitude"),
        "gridLongitude": data.get("longitude"),
    }
