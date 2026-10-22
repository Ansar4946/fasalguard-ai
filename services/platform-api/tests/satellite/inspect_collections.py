"""Read-only public catalog compatibility check; prints no credentials."""

import json

import httpx

polygon = {"type": "Polygon", "coordinates": [[[72, 31], [72.002, 31], [72.002, 31.002], [72, 31.002], [72, 31]]]}
for collection in ("sentinel-2-l2a", "sentinel-2-c1-l2a"):
    response = httpx.post(
        "https://earth-search.aws.element84.com/v1/search",
        json={"collections": [collection], "intersects": polygon, "datetime": "2026-09-13T00:00:00Z/2026-10-12T23:59:59Z", "limit": 1},
        timeout=25,
    )
    response.raise_for_status()
    data = response.json()
    scenes = data.get("features", [])
    print(
        json.dumps(
            {
                "collection": collection,
                "found": len(scenes),
                "scene": {
                    "id": scenes[0]["id"],
                    "properties": scenes[0]["properties"],
                    "assets": {key: value for key, value in scenes[0]["assets"].items() if key in ("blue", "green", "red", "nir", "nir08", "swir16", "scl")},
                }
                if scenes
                else None,
            }
        ),
        flush=True,
    )
