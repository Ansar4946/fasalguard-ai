"""Explicit synthetic inputs, never presented as measured farmer data."""

from datetime import date, timedelta

PARAMETERS = {
    "Kcmini": 0.35,
    "Kcmmid": 1.15,
    "Kcmend": 0.6,
    "Kcbini": 0.15,
    "Kcbmid": 1.1,
    "Kcbend": 0.5,
    "Lini": 25,
    "Ldev": 50,
    "Lmid": 50,
    "Lend": 25,
    "hini": 0.01,
    "hmax": 1.2,
    "thetaFC": 0.25,
    "thetaWP": 0.1,
    "theta0": 0.15,
    "Zrini": 0.5,
    "Zrmax": 0.5,
    "pbase": 0.5,
    "Ze": 0.1,
    "REW": 8,
    "CN2": 70,
}


def profile():
    return {
        "parameters": dict(PARAMETERS),
        "initialDate": "2025-01-01",
        "initialCondition": "SCENARIO",
        "efficiency": 0.8,
        "wettedFraction": 1,
        "source": "Synthetic test profile; not measured agricultural data",
        "uplandNoGroundwater": True,
    }


def weather(rain=0, days=7):
    return [{"date": str(date(2025, 1, 1) + timedelta(days=i)), "et0Mm": 4, "rainMm": rain, "wind2mMs": 2, "rhMinPercent": 40} for i in range(days)]
