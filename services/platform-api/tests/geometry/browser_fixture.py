"""Creates only disposable synthetic F05 browser identities; never prints access tokens."""

import json
from pathlib import Path

from sqlalchemy import text

from app.db import transaction
from tests.geometry.fixtures import feature, square
from tests.irrigation.test_integration import identity


def main():
    owner = identity()
    other = identity()
    with transaction() as c:
        owner["farm"] = c.execute(text("SELECT farm_id::text FROM fields WHERE id=:id"), {"id": owner["field"]}).scalar_one()
    Path("/tmp/f05-browser-fixture.json").write_text(
        json.dumps(
            {
                "owner": owner,
                "other": other,
                "geojson": {
                    "type": "FeatureCollection",
                    "features": [feature(name="F05 imported parcel with hole"), feature(square(72.001, 31.001, 0.0003), name="F05 GPS parcel")],
                },
            }
        )
    )
    print("Synthetic F05 browser fixture created (credentials omitted).")


if __name__ == "__main__":
    main()
