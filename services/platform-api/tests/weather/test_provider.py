import copy
from datetime import timedelta
from unittest.mock import patch

import httpx
import pytest
import respx

from app.weather.provider import ProviderError, fetch, parse
from tests.weather.fixtures import NOW, raw


def test_real_contract_and_timezone():
    b = parse(raw(), NOW)
    assert len(b["hourly"]) == 168 and len(b["daily"]) == 7
    assert b["hourly"][0]["time"] == "2026-10-13T19:00:00+00:00"
    assert b["daily"][0]["key"] == "2026-10-14"
    assert b["providerIssuedAt"] is None
    assert b["current"]["precipitationMm"] is None


@pytest.mark.parametrize("change", ["units", "length", "nan", "infinity", "bool", "range", "missing", "duplicate", "old", "timezone", "daily", "dailydate"])
def test_rejects_invalid_response(change):
    r = copy.deepcopy(raw())
    if change == "units":
        r["hourly_units"]["wind_speed_10m"] = "m/s"
    if change == "length":
        r["hourly"]["temperature_2m"].pop()
    if change in ("nan", "infinity", "bool", "range", "missing"):
        r["hourly"]["temperature_2m"][0] = {"nan": float("nan"), "infinity": float("inf"), "bool": True, "range": 999, "missing": None}[change]
    if change == "duplicate":
        r["hourly"]["time"][1] = r["hourly"]["time"][0]
    if change == "old":
        r["current"]["time"] -= 10000
    if change == "timezone":
        r["timezone"] = "UTC"
    if change == "daily":
        r["daily"]["time"].pop()
    if change == "dailydate":
        r["daily"]["time"][0] += 86400
    with pytest.raises(ProviderError):
        parse(r, NOW)


@respx.mock
@pytest.mark.parametrize("status,calls", [(400, 1), (401, 1), (429, 2), (500, 2), (503, 2)])
def test_bounded_retry(status, calls):
    route = respx.get("https://api.open-meteo.com/v1/forecast").mock(return_value=httpx.Response(status, headers={"retry-after": "99999999"}))
    with patch("app.weather.provider.time.sleep") as sleep, pytest.raises(ProviderError):
        fetch(31, 72)
    assert route.call_count == calls
    if calls == 2:
        sleep.assert_called_once_with(0.2)


@respx.mock
def test_recovery_and_timeout():
    route = respx.get("https://api.open-meteo.com/v1/forecast").mock(side_effect=[httpx.ConnectTimeout("timeout"), httpx.Response(200, json=raw())])
    with patch("app.weather.provider.parse", return_value={"realParserTestedSeparately": True}), patch("app.weather.provider.time.sleep"):
        assert fetch(31, 72)["realParserTestedSeparately"]
    assert route.call_count == 2


@respx.mock
def test_malformed_and_oversized_response():
    route = respx.get("https://api.open-meteo.com/v1/forecast").mock(return_value=httpx.Response(200, content=b"x" * 1_000_001))
    with pytest.raises(ProviderError, match="WEATHER_RESPONSE_LIMIT"):
        fetch(31, 72)
    assert route.call_count == 1


def test_forecast_outside_current_day_rejected():
    with pytest.raises(ProviderError):
        parse(raw(), NOW + timedelta(days=8))


def test_commercial_access_required_in_production():
    from types import SimpleNamespace

    settings = SimpleNamespace(environment="production", weather_provider="open-meteo", open_meteo_api_key="")
    with patch("app.weather.provider.get_settings", return_value=settings), pytest.raises(ProviderError, match="WEATHER_COMMERCIAL_KEY_REQUIRED"):
        fetch(31, 72)


def test_unsupported_provider_is_explicit():
    from types import SimpleNamespace

    settings = SimpleNamespace(weather_provider="openweathermap")
    with patch("app.weather.provider.get_settings", return_value=settings), pytest.raises(ProviderError, match="WEATHER_PROVIDER_NOT_SUPPORTED"):
        fetch(31, 72)


@pytest.mark.parametrize("change", ["future-current", "inverted-extremes"])
def test_rejects_impossible_provider_timing_and_extremes(change):
    r = raw()
    if change == "future-current":
        r["current"]["time"] += 7200
    else:
        r["daily"]["temperature_2m_min"][0] = 30
        r["daily"]["temperature_2m_max"][0] = 20
    with pytest.raises(ProviderError):
        parse(r, NOW)
