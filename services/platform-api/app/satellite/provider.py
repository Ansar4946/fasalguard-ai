"""Bounded EarthSearch STAC search. Asset URLs are never supplied by API callers."""

from datetime import datetime
from urllib.parse import urlparse

import httpx
from shapely.geometry import shape

STAC = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-l2a"
ASSET_HOSTS = frozenset({"sentinel-cogs.s3.us-west-2.amazonaws.com"})


class ProviderError(Exception):
    pass


def asset_url(asset: dict) -> str:
    href = asset.get("href", "")
    url = urlparse(href)
    if url.scheme != "https" or url.hostname not in ASSET_HOSTS or url.port not in (None, 443) or url.username or url.password or url.query or url.fragment:
        raise ProviderError("UNSAFE_ASSET_URL")
    if not url.path.endswith(".tif"):
        raise ProviderError("UNSUPPORTED_ASSET")
    return href


def search(polygon: dict, start: datetime, end: datetime, max_cloud: float) -> list[dict]:
    request = {"collections": [COLLECTION], "intersects": polygon, "datetime": f"{start.isoformat()}/{end.isoformat()}", "limit": 100}
    scenes = {}
    with httpx.Client(timeout=25, follow_redirects=False, trust_env=False) as client:
        # Follow only server-owned continuation tokens at the fixed endpoint, not remote links.
        for _ in range(5):
            try:
                response = client.post(STAC, json=request)
                response.raise_for_status()
                if len(response.content) > 12_000_000:
                    raise ProviderError("CATALOG_TOO_LARGE")
                result = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise ProviderError("CATALOG_UNAVAILABLE") from exc
            for item in result.get("features", []):
                props = item.get("properties", {})
                try:
                    acquired = datetime.fromisoformat(props["datetime"].replace("Z", "+00:00"))
                    cloud = float(props["eo:cloud_cover"])
                    overlaps = shape(item["geometry"]).intersects(shape(polygon))
                except (KeyError, ValueError, TypeError) as exc:
                    raise ProviderError("INVALID_STAC_ITEM") from exc
                if item.get("collection") == COLLECTION and start <= acquired <= end and 0 <= cloud <= max_cloud and overlaps:
                    scenes[item["id"]] = item
            next_link = next((link for link in result.get("links", []) if link.get("rel") == "next"), None)
            if not next_link:
                break
            token = next_link.get("body", {}).get("next")
            if not token:
                raise ProviderError("UNSUPPORTED_STAC_PAGINATION")
            request = {**request, "next": token}
        else:
            raise ProviderError("CATALOG_LIMIT_EXCEEDED")
    return sorted(scenes.values(), key=lambda item: (item["properties"]["eo:cloud_cover"], item["properties"]["datetime"]), reverse=False)
