from datetime import date

import pytest
from pydantic import ValidationError

from app.irrigation.schemas import Parameters, WeatherDay
from app.irrigation.science import calculate, reference_et, water_productivity
from tests.irrigation.fixtures import PARAMETERS, profile, weather


def test_fao56_example18_brussels_daily_grass():
    # FAO56 Chapter4 Example18, 6July (day187), published rounded ET0=3.9mm/day.
    got = reference_et(elevation_m=100, latitude=50.8, day=date(2001, 7, 6), radiation_mj=22.07, tmax_c=21.5, tmin_c=12.3, vapor_kpa=1.409, wind_ms=2.078)
    assert got == pytest.approx(3.9, abs=0.08)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1])
def test_invalid_reference_weather_is_not_estimated(value):
    with pytest.raises(ValueError):
        reference_et(elevation_m=100, latitude=31, day=date(2025, 1, 1), radiation_mj=value, tmax_c=20, tmin_c=10, vapor_kpa=1.4, wind_ms=2)


@pytest.mark.parametrize("change", [{"thetaWP": 0.3}, {"theta0": 0.9}, {"Zrini": 2}, {"REW": 100}, {"pbase": 0}, {"Kcbmid": float("nan")}])
def test_inconsistent_soil_and_crop_parameters_rejected(change):
    with pytest.raises(ValidationError):
        Parameters(**{**PARAMETERS, **change})


def test_daily_balance_closes_for_constant_root_zone_and_volume_units():
    result = calculate(profile(), weather(), [], 2)
    depletion = 1000 * (PARAMETERS["thetaFC"] - PARAMETERS["theta0"]) * PARAMETERS["Zrini"]
    for row in result["daily"]:
        expected = depletion - row["Rain"] + row["Runoff"] - row["Irrig"] + row["IrrLoss"] + row["ETa"] + row["DP"]
        assert row["Dr"] == pytest.approx(expected, abs=1e-8)
        depletion = row["Dr"]
        assert 0 <= row["Ks"] <= 1
    advisory = result["advisory"]
    assert advisory["grossDepthMm"] == pytest.approx(advisory["netDepthMm"] / 0.8)
    assert advisory["volumeM3"] == pytest.approx(advisory["grossDepthMm"] * 20)
    assert result["initialCondition"] == "SCENARIO"
    assert not advisory["automaticApplication"]


def test_rainfall_reduces_depletion_and_excess_water_is_not_all_effective():
    dry = calculate(profile(), weather(), [], 1)
    wet = calculate(profile(), weather(rain=40), [], 1)
    assert wet["daily"][-1]["Dr"] < dry["daily"][-1]["Dr"]
    assert sum(row["Runoff"] + row["DP"] for row in wet["daily"]) > 0


def test_irrigation_efficiency_applied_once():
    event = {"date": "2025-01-01", "grossDepthMm": 10, "wettedFraction": 1, "efficiency": 0.5}
    row = calculate(profile(), weather(days=1), [event], 1)["daily"][0]
    assert row["Irrig"] == 10
    assert row["IrrLoss"] == 5


def test_missing_or_repeated_weather_day_rejected():
    days = weather()
    days[1] = days[0]
    with pytest.raises(ValueError, match="INCOMPLETE_DAILY_WEATHER"):
        calculate(profile(), days, [], 1)


@pytest.mark.parametrize("change", [{"rainMm": None}, {"et0Mm": -1}, {"wind2mMs": float("inf")}, {"rhMinPercent": 101}])
def test_weather_missing_or_invalid_is_not_zero_filled(change):
    with pytest.raises(ValidationError):
        WeatherDay(**{**weather()[0], **change})


def test_water_productivity_dimensions_and_no_zero_fallback():
    assert water_productivity(6000, 400) == pytest.approx(1.5)
    with pytest.raises(ValueError):
        water_productivity(6000, 0)
    with pytest.raises(ValueError):
        water_productivity(float("nan"), 400)


def test_equal_or_declining_basal_coefficients_cannot_divide_by_zero():
    for mid in (0.15, 0.1):
        with pytest.raises(ValidationError):
            Parameters(**{**PARAMETERS, "Kcbmid": mid})


def test_root_growth_curve_and_available_storage():
    inputs = profile()
    inputs["parameters"].update({"Lini":1,"Ldev":2,"Lmid":1,"Lend":1,"Zrini":0.2,"Zrmax":0.8})
    output = calculate(inputs, weather(days=5), [], 1)
    # FAO56 stage curve: initial through day1, then half/full development.
    assert [row["Zr"] for row in output["daily"]] == pytest.approx([0.2,0.2,0.5,0.8,0.8])
    for row in output["daily"]:
        assert row["TAW"] == pytest.approx(1000*(0.25-0.1)*row["Zr"])
        assert 0 <= row["Dr"] <= row["TAW"]


def test_boolean_is_not_a_numeric_measurement():
    with pytest.raises(ValidationError):
        WeatherDay(**{**weather()[0], "et0Mm": True})
