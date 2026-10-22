"""Explicit, guarded live-weather evidence helper for the disposable test database only."""

import json
import sys
from pathlib import Path

from sqlalchemy import text

from app.auth import decode_access_token
from app.db import engine, transaction
from app.weather import service

assert engine().url.database == "f03_runtime_test", "Only the disposable runtime test database is allowed."
fixture = json.loads(Path("/tmp/f04-browser-fixture.json").read_text())
claims = decode_access_token(fixture["token"])
with transaction() as c:
    ctx = service.context(c, claims["sub"], fixture["field"])
    assert c.execute(text("SELECT name FROM fields WHERE id=:id"), {"id": fixture["field"]}).scalar_one() == "F03 synthetic test field"
    if sys.argv[1:] == ["reset"]:
        cell = f"{round(ctx['latitude'], 3):.3f}:{round(ctx['longitude'], 3):.3f}"
        service.cache().delete(f"weather:f04:v1:open-meteo:Asia-Karachi:{cell}")
        c.execute(text("DELETE FROM weather_forecasts WHERE field_id=:id"), {"id": fixture["field"]})
        print("Reset only the synthetic browser field forecast and its isolated F04 provider cache cell.")
    elif sys.argv[1:] == ["verify"]:
        row = (
            c.execute(
                text(
                    "SELECT provider,generated_at,valid_from,valid_to,points,metadata FROM weather_forecasts "
                    "WHERE field_id=:id ORDER BY generated_at DESC LIMIT 1"
                ),
                {"id": fixture["field"]},
            )
            .mappings()
            .one()
        )
        assert len(row["points"]) == 168 and len(row["metadata"]["bundle"]["daily"]) == 7
        assert row["provider"] == "OPEN_METEO" and row["metadata"]["bundle"]["rawMetadata"]["dataKind"] == "MODEL_FORECAST"
        evidence = {
            "status": "RUN_PASS",
            "database": "disposable f03_runtime_test",
            "fieldId": fixture["field"],
            "provider": row["provider"],
            "generatedAt": row["generated_at"].isoformat(),
            "validFrom": row["valid_from"].isoformat(),
            "validTo": row["valid_to"].isoformat(),
            "hourlyPoints": len(row["points"]),
            "dailyPoints": 7,
            "dataKind": "MODEL_FORECAST",
        }
        Path("/results/database-live.json").write_text(json.dumps(evidence, indent=2))
        print(json.dumps(evidence))
    else:
        raise SystemExit("Choose reset or verify.")
