"""Create a synthetic browser identity only in the disposable f02_test database."""

import json
from pathlib import Path

from sqlalchemy import text

from app.db import transaction
from tests.satellite.test_integration import identity

fixture = identity.__wrapped__()
other = identity.__wrapped__()
with transaction() as connection:
    legacy = str(
        connection.execute(
            text(
                "INSERT INTO satellite_captures(field_id,provider,processing_status,raw_metadata,requested_from,requested_to) "
                "VALUES(:fid,'LEGACY_TEST','NO_VALID_SCENE',CAST(:metadata AS jsonb),'2025-01-01','2025-02-20') RETURNING id"
            ),
            {"fid": fixture["field"], "metadata": json.dumps({"testFixture": True})},
        ).scalar_one()
    )
Path("/app/f02-browser-fixture.json").write_text(
    json.dumps(
        {
            "field": fixture["field"],
            "token": fixture["headers"]["Authorization"][7:],
            "otherToken": other["headers"]["Authorization"][7:],
            "legacyCapture": legacy,
        }
    )
)
print("Synthetic F02 browser identities created; tokens stored privately, not logged.")
