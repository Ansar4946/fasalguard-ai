"""Explicit synthetic provider fixture; never returned by production code."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.weather.provider import DAILY, VARIABLES

NOW = datetime(2026, 10, 14, 10, tzinfo=UTC)


def raw(now=NOW):
    start = now.astimezone(ZoneInfo("Asia/Karachi")).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    times = [int((start + timedelta(hours=i)).timestamp()) for i in range(168)]
    values = {
        "temperatureC": 25,
        "relativeHumidityPercent": 60,
        "precipitationMm": 0,
        "precipitationProbabilityPercent": 20,
        "windSpeedKph": 10,
        "windGustKph": 20,
        "solarRadiationWm2": 100,
        "et0Mm": 0.1,
        "soilMoistureM3M3": 0.2,
        "soilTemperatureC": 24,
    }
    hourly = {"time": times, **{v[0]: [values[k]] * 168 for k, v in VARIABLES.items()}}
    daily = {"time": times[::24], **{v[0]: [25 if k in ("highC", "lowC") else 0] * 7 for k, v in DAILY.items()}}
    return {
        "timezone": "Asia/Karachi",
        "latitude": 31,
        "longitude": 72,
        "hourly": hourly,
        "daily": daily,
        "hourly_units": {v[0]: v[1] for v in VARIABLES.values()},
        "daily_units": {v[0]: v[1] for v in DAILY.values()},
        "current": {"time": int(now.timestamp()), "temperature_2m": 25},
        "current_units": {"temperature_2m": "°C"},
    }
