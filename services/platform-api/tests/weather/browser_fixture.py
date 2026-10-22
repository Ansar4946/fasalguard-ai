"""Private synthetic test identities; never log tokens or commit this generated file."""

import json
from pathlib import Path

from sqlalchemy import text

from app.db import transaction
from tests.irrigation.test_integration import identity

owner, other = identity(), identity()
with transaction() as c:
    c.execute(text("UPDATE crop_cycles SET status='active' WHERE id=:id"), {"id": owner["cycle"]})
Path("/tmp/f04-browser-fixture.json").write_text(
    json.dumps({"field": owner["field"], "token": owner["headers"]["Authorization"][7:], "otherToken": other["headers"]["Authorization"][7:]})
)
print("Synthetic F04 browser identities created; tokens retained in private /tmp file.")
