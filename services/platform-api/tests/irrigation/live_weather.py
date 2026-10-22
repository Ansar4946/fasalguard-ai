"""Explicit real public-weather smoke check, not a farmer measurement."""

import json
from datetime import date

from app.irrigation.weather import archive

rows, provenance = archive(31, 72, date(2025, 1, 1), date(2025, 1, 7))
print(json.dumps({"publicSample": True, "weather": rows, "provenance": provenance}, allow_nan=False))
