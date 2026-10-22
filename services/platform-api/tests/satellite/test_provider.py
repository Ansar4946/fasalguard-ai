from datetime import UTC, datetime

import httpx
import pytest
import respx

from app.satellite.provider import STAC, ProviderError, asset_url, search

POLYGON = {"type": "Polygon", "coordinates": [[[72, 31], [72.001, 31], [72.001, 31.001], [72, 31.001], [72, 31]]]}
START, END = datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 2, 1, tzinfo=UTC)


def item(cloud=10, identity="recorded-test-scene"):
    return {"id": identity, "collection": "sentinel-2-l2a", "geometry": POLYGON, "properties": {"datetime": "2025-01-10T00:00:00Z", "eo:cloud_cover": cloud}}


@respx.mock
def test_pagination_and_cloud_filter():
    route = respx.post(STAC).mock(
        side_effect=[
            httpx.Response(200, json={"features": [item(50)], "links": [{"rel": "next", "body": {"next": "token"}}]}),
            httpx.Response(200, json={"features": [item()], "links": []}),
        ]
    )
    assert len(search(POLYGON, START, END, 30)) == 1
    assert route.call_count == 2


@respx.mock
def test_no_scenes():
    respx.post(STAC).respond(200, json={"features": []})
    assert search(POLYGON, START, END, 30) == []


@respx.mock
@pytest.mark.parametrize("status", [429, 500, 503])
def test_provider_outage(status):
    respx.post(STAC).respond(status)
    with pytest.raises(ProviderError, match="CATALOG_UNAVAILABLE"):
        search(POLYGON, START, END, 30)


@respx.mock
def test_timeout():
    respx.post(STAC).mock(side_effect=httpx.ReadTimeout("test timeout"))
    with pytest.raises(ProviderError, match="CATALOG_UNAVAILABLE"):
        search(POLYGON, START, END, 30)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/a.tif",
        "https://evil.example/a.tif",
        "https://sentinel-cogs.s3.us-west-2.amazonaws.com:444/a.tif",
        "https://user@sentinel-cogs.s3.us-west-2.amazonaws.com/a.tif",
        "file:///etc/passwd",
        "https://sentinel-cogs.s3.us-west-2.amazonaws.com/a.tif?signature=secret",
    ],
)
def test_asset_url_is_not_arbitrary(url):
    with pytest.raises(ProviderError):
        asset_url({"href": url})
