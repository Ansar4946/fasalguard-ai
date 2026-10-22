"""Explicitly invoked public-data smoke check; not a fabricated farmer observation."""

import json
from datetime import UTC, datetime

from app.satellite import provider, raster

polygon = {"type": "Polygon", "coordinates": [[[72.0, 31.0], [72.002, 31.0], [72.002, 31.002], [72.0, 31.002], [72.0, 31.0]]]}
scenes = provider.search(polygon, datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 2, 20, tzinfo=UTC), 30)
print(json.dumps({"catalogScenes": len(scenes), "testAOI": "public imagery sample; not a registered farmer field"}), flush=True)
if not scenes:
    raise RuntimeError("NO_REAL_SCENE_AVAILABLE")
scene = scenes[0]
print(
    json.dumps(
        {
            "sceneId": scene["id"],
            "acquiredAt": scene["properties"]["datetime"],
            "offsetApplied": scene["properties"].get("earthsearch:boa_offset_applied"),
            "radiometry": scene["assets"]["red"].get("raster:bands"),
        }
    ),
    flush=True,
)
result = raster.process(scene, polygon)
print(
    json.dumps(
        {
            "provenance": result["provenance"],
            "statistics": result["statistics"],
            "outputBytes": {name: len(output[0]) for name, output in result["outputs"].items()},
        },
        allow_nan=False,
    ),
    flush=True,
)
