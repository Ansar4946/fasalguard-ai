"""Creates synthetic browser fixtures only in the guarded disposable F03 database."""

import json
from pathlib import Path

from tests.irrigation.fixtures import PARAMETERS
from tests.irrigation.test_integration import identity

owner, other = identity(), identity()
Path("/app/f03-browser-fixture.json").write_text(
    json.dumps(
        {
            "field": owner["field"],
            "cycle": owner["cycle"],
            "parameters": PARAMETERS,
            "token": owner["headers"]["Authorization"][7:],
            "otherToken": other["headers"]["Authorization"][7:],
        }
    )
)
print("Synthetic browser identities created; fixture tokens stored privately, not logged.")
