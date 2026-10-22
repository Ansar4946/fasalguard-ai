import json
from pathlib import Path

from sqlalchemy import text

from app.db import engine, transaction


def main():
    assert engine().url.database == "f03_runtime_test"
    ids = json.loads(Path("/tmp/f05-browser-result.json").read_text())["importedFieldIds"]
    results = []
    with transaction() as c:
        for i, fid in enumerate(ids):
            row = dict(
                c.execute(
                    text("""SELECT id::text,version,ST_IsValid(boundary) AS valid,ST_SRID(boundary) AS srid,
       ST_NRings(boundary) AS rings,area_hectares AS hectares,ST_Area(boundary::geography,true) AS area_m2,
       boundary_metadata->>'source' AS source,jsonb_array_length(coalesce(boundary_metadata->'gpsSamples','[]'::jsonb)) AS gps_samples
       FROM fields WHERE id=:id AND deleted_at IS NULL"""),
                    {"id": fid},
                )
                .mappings()
                .one()
            )
            assert row["version"] == 2 and row["valid"] and row["srid"] == 4326
            assert abs(row["hectares"] * 10000 - row["area_m2"]) < 0.000001
            assert row["rings"] == (2 if i == 0 else 1)
            assert row["source"] == ("MAP_DRAWN" if i == 0 else "GPS_CAPTURE")
            assert row["gps_samples"] == (0 if i == 0 else 4)
            results.append(row)
        receipt_count = c.execute(text("SELECT count(*) FROM field_geometry_imports WHERE result->'fields'->0->>'id'=:id"), {"id": ids[0]}).scalar_one()
        assert receipt_count == 1
    Path("/results/database-proof.json").write_text(
        json.dumps({"status": "RUN_PASS", "fields": results, "importReceipts": receipt_count, "coordinatesOmitted": True}, indent=2)
    )
    print("Direct PostGIS proof passed: versions, topology, holes, area, GPS sample count and one import receipt.")


if __name__ == "__main__":
    main()
