"""Versioned crop rules, evaluated only on future points and finite measurements."""

import math
from datetime import datetime

RANK = {"BENEFICIAL": 0, "MOSTLY_BENEFICIAL": 1, "CAUTION": 2, "HARMFUL": 3, "CRITICAL": 4}
OPERATORS = {"gt": lambda a, b: a > b, "gte": lambda a, b: a >= b, "lt": lambda a, b: a < b, "lte": lambda a, b: a <= b, "eq": lambda a, b: a == b}


def matches(point, conditions):
    def test(condition):
        if not isinstance(condition, dict):
            return False
        if not isinstance(condition.get("variable"), str) or not isinstance(condition.get("operator"), str):
            return False
        actual, threshold = point.get(condition.get("variable")), condition.get("value")
        op = OPERATORS.get(condition.get("operator"))
        return bool(
            op and all(isinstance(v, int | float) and not isinstance(v, bool) and math.isfinite(v) for v in (actual, threshold)) and op(actual, threshold)
        )

    if not isinstance(conditions, dict) or set(conditions) - {"all", "any"}:
        return False
    all_conditions, any_conditions = conditions.get("all", []), conditions.get("any", [])
    if not isinstance(all_conditions, list) or not isinstance(any_conditions, list) or not (all_conditions or any_conditions):
        return False
    return (not all_conditions or all(test(c) for c in all_conditions)) and (not any_conditions or any(test(c) for c in any_conditions))


def evaluate(points, rules, fresh, now):
    future = [p for p in points if datetime.fromisoformat(p["time"]) >= now]
    found = []
    for rule in rules:
        hits = [p["time"] for p in future if matches(p, rule["conditions"])]
        if hits and rule["suitability"] in RANK:
            approved = rule["validationStatus"] == "EXPERT_APPROVED"
            found.append({**rule, "isExpertApproved": approved, "recommendationAllowed": fresh and approved, "validFrom": hits[0], "validTo": hits[-1]})
    found.sort(key=lambda r: (-RANK[r["suitability"]], -r["priority"], str(r["id"])))
    approved = [r for r in found if r["recommendationAllowed"]]
    return {
        "assessment": found[0]["suitability"] if found else None,
        "productionAssessment": approved[0]["suitability"] if approved else None,
        "matches": found,
        "recommendationAllowed": bool(approved),
        "disclaimer": (
            "Only expert-approved rules on fresh forecasts support guidance. "
            "Demo rules are illustrative; forecasts are model estimates, not field observations."
        ),
        "ruleProvenance": {
            "hasExpertApprovedRules": any(r["validationStatus"] == "EXPERT_APPROVED" for r in rules),
            "demoRuleCount": sum(r["validationStatus"] == "DEMO_UNVERIFIED" for r in rules),
        },
    }
