from datetime import timedelta

import pytest

from app.weather.rules import evaluate, matches
from tests.weather.fixtures import NOW


@pytest.mark.parametrize(
    "operator,value,expected", [("gt", 35, False), ("gte", 35, True), ("lt", 35, False), ("lte", 35, True), ("eq", 35, True), ("invalid", 35, False)]
)
def test_threshold_boundary(operator, value, expected):
    assert matches({"temperatureC": 35}, {"all": [{"variable": "temperatureC", "operator": operator, "value": value}]}) is expected


@pytest.mark.parametrize(
    "conditions", [{}, {"all": []}, {"all": "bad"}, {"unknown": []}, {"any": [None]}, {"all": [{"variable": "missing", "operator": "gte", "value": 1}]}]
)
def test_invalid_rule_never_matches(conditions):
    assert not matches({"temperatureC": 35}, conditions)


@pytest.mark.parametrize("fresh,status,allowed", [(True, "DEMO_UNVERIFIED", False), (True, "EXPERT_APPROVED", True), (False, "EXPERT_APPROVED", False)])
def test_only_fresh_approved_future_warnings(fresh, status, allowed):
    rule = {
        "id": "test",
        "category": "HEAT",
        "suitability": "HARMFUL",
        "priority": 1,
        "conditions": {"all": [{"variable": "temperatureC", "operator": "gte", "value": 35}]},
        "validationStatus": status,
    }
    future = {"time": (NOW + timedelta(hours=1)).isoformat(), "temperatureC": 35}
    result = evaluate([future], [rule], fresh, NOW)
    assert result["recommendationAllowed"] is allowed
    future["time"] = (NOW - timedelta(hours=1)).isoformat()
    assert not evaluate([future], [rule], fresh, NOW)["matches"]
