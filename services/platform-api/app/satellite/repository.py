"""Reuse the TypeORM-owned satellite schema and unified farmer/field identities."""

import hashlib
import json

from sqlalchemy import text

from app.satellite.science import VERSION

PROVIDER = "EARTHSEARCH_STAC"
OWNER = "JOIN fields fi ON fi.id=sc.field_id JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id"
LIVE = "fi.deleted_at IS NULL AND f.deleted_at IS NULL"
VIEW = '''sc.id::text, sc.field_id::text AS "fieldId", sc.provider,
sc.provider_scene_id AS "providerSceneId", sc.processing_status AS "processingStatus",
sc.acquisition_date AS "acquisitionDate", sc.processed_date AS "processedDate",
sc.cloud_coverage AS "cloudCoverage", sc.usable_pixel_percentage AS "usablePixelPercentage",
sc.data_quality AS "dataQuality", sc.created_at AS "createdAt", sc.raw_metadata AS "metadata"'''


def field(c, user_id: str, field_id: str):
    return (
        c.execute(
            text("""SELECT fi.id::text, ST_AsGeoJSON(fi.boundary)::json AS boundary
    FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
    WHERE fi.id=:fid AND fp.user_id=:uid AND fi.deleted_at IS NULL AND f.deleted_at IS NULL"""),
            {"fid": field_id, "uid": user_id},
        )
        .mappings()
        .first()
    )


def get(c, user_id: str, capture_id: str):
    row = (
        c.execute(
            text(f"SELECT {VIEW} FROM satellite_captures sc {OWNER} WHERE sc.id=:cid AND fp.user_id=:uid AND {LIVE}"), {"cid": capture_id, "uid": user_id}
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def recent(c, user_id: str, field_id: str):
    return [
        dict(row)
        for row in c.execute(
            text(
                f"SELECT {VIEW} FROM satellite_captures sc {OWNER} WHERE sc.field_id=:fid AND fp.user_id=:uid AND {LIVE} ORDER BY sc.created_at DESC LIMIT 50"
            ),
            {"fid": field_id, "uid": user_id},
        ).mappings()
    ]


def create(c, user_id: str, field_id: str, boundary: dict, start, end, cloud: float) -> str:
    metadata = {
        "boundarySnapshot": boundary,
        "geometryHash": hashlib.sha256(json.dumps(boundary, sort_keys=True).encode()).hexdigest(),
        "maxCloudCoverage": cloud,
        "processingVersion": VERSION,
    }
    capture_id = str(
        c.execute(
            text("""INSERT INTO satellite_captures(field_id,provider,requested_from,requested_to,raw_metadata)
    VALUES(:fid,:provider,:start,:end,CAST(:metadata AS jsonb)) RETURNING id"""),
            {"fid": field_id, "provider": PROVIDER, "start": start, "end": end, "metadata": json.dumps(metadata)},
        ).scalar_one()
    )
    c.execute(text("INSERT INTO satellite_task_outbox(capture_id,user_id) VALUES(:cid,:uid)"), {"cid": capture_id, "uid": user_id})
    return capture_id


def update(c, capture_id: str, status: str, metadata: dict | None = None):
    c.execute(
        text("UPDATE satellite_captures SET processing_status=:status,raw_metadata=raw_metadata||CAST(:meta AS jsonb),updated_at=now() WHERE id=:cid"),
        {"cid": capture_id, "status": status, "meta": json.dumps(metadata or {})},
    )


def complete_outbox(c, capture_id: str):
    c.execute(text("UPDATE satellite_task_outbox SET completed_at=now() WHERE capture_id=:cid"), {"cid": capture_id})


def defer_outbox(c, capture_id: str, seconds: int):
    """Pull the next redispatch close when a capture only lost the per-field lock (a sibling is running)."""
    c.execute(
        text("UPDATE satellite_task_outbox SET next_dispatch_at=now()+make_interval(secs=>:s) WHERE capture_id=:cid AND completed_at IS NULL"),
        {"cid": capture_id, "s": seconds},
    )


def result_rows(c, capture_id: str, kind: str):
    if kind == "statistics":
        query = 'SELECT index,statistics,created_at AS "createdAt" FROM satellite_statistics WHERE capture_id=:cid ORDER BY index'
    elif kind == "layers":
        query = """SELECT sl.id::text,sl.type,ma.content_type AS "contentType",sl.metadata
        FROM satellite_layers sl JOIN media_assets ma ON ma.id=sl.media_asset_id WHERE sl.capture_id=:cid ORDER BY sl.type"""
    else:
        raise ValueError("INVALID_RESULT_KIND")
    return [dict(row) for row in c.execute(text(query), {"cid": capture_id}).mappings()]


def publish(c, capture_id: str, user_id: str, item: dict, result: dict, keys: dict):
    props = item["properties"]
    for name, (body, content_type) in result["outputs"].items():
        key = keys[name]
        media_id = c.execute(
            text("""INSERT INTO media_assets(owner_id,object_key,original_filename,content_type,size_bytes,checksum,purpose,status,metadata,completed_at)
        VALUES(:uid,:key,:filename,:ct,:size,:checksum,'satellite','ready',CAST(:meta AS jsonb),now())
        ON CONFLICT(object_key) DO UPDATE SET size_bytes=EXCLUDED.size_bytes,checksum=EXCLUDED.checksum,updated_at=now() RETURNING id"""),
            {
                "uid": user_id,
                "key": key,
                "filename": key.rsplit("/", 1)[1],
                "ct": content_type,
                "size": len(body),
                "checksum": hashlib.sha256(body).hexdigest(),
                "meta": json.dumps({"captureId": capture_id, "processingVersion": VERSION}),
            },
        ).scalar_one()
        c.execute(
            text("""INSERT INTO satellite_layers(capture_id,type,media_asset_id,metadata) VALUES(:cid,:name,:mid,CAST(:meta AS jsonb))
        ON CONFLICT(capture_id,type) DO UPDATE SET media_asset_id=EXCLUDED.media_asset_id,metadata=EXCLUDED.metadata,updated_at=now()"""),
            {"cid": capture_id, "name": name, "mid": media_id, "meta": json.dumps(result["provenance"])},
        )
    for name, stats in result["statistics"].items():
        c.execute(
            text("""INSERT INTO satellite_statistics(capture_id,index,statistics) VALUES(:cid,:name,CAST(:stats AS jsonb))
        ON CONFLICT(capture_id,index) DO UPDATE SET statistics=EXCLUDED.statistics,updated_at=now()"""),
            {"cid": capture_id, "name": name, "stats": json.dumps(stats, allow_nan=False)},
        )
    usable = result["statistics"]["NDVI"]["validPixelPercentage"]
    status = "COMPLETED" if usable >= 20 else "CLOUD_BLOCKED"
    provenance = {
        **result["provenance"],
        "collection": item["collection"],
        "offsetApplied": props.get("earthsearch:boa_offset_applied"),
        "radiometry": {name: item["assets"][name].get("raster:bands") for name in ("blue", "green", "red", "nir", "swir16")},
        "diagnosticCapability": "NONE",
    }
    c.execute(
        text("""UPDATE satellite_captures SET provider_scene_id=:scene,satellite=:satellite,
    acquisition_date=:acquired,cloud_coverage=:cloud,usable_pixel_percentage=:usable,
    data_quality=:quality,processing_status=:status,processed_date=now(),updated_at=now(),
    raw_metadata=raw_metadata||CAST(:provenance AS jsonb) WHERE id=:cid"""),
        {
            "cid": capture_id,
            "scene": item["id"],
            "satellite": props.get("platform"),
            "acquired": props["datetime"],
            "cloud": props["eo:cloud_cover"],
            "usable": usable,
            "quality": "GOOD" if usable >= 80 else "PARTIAL" if usable >= 20 else "POOR",
            "status": status,
            "provenance": json.dumps(provenance),
        },
    )
    if status == "COMPLETED":
        c.execute(
            text(
                "UPDATE fields SET last_successful_capture_at=GREATEST(last_successful_capture_at,CAST(:at AS timestamptz)),"
                "updated_at=now() WHERE id=(SELECT field_id FROM satellite_captures WHERE id=:cid)"
            ),
            {"at": props["datetime"], "cid": capture_id},
        )
    complete_outbox(c, capture_id)
