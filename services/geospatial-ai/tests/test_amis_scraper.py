import pytest

from app.amis_scraper import AmisScrapeError, normalize_crop_name, normalize_market_name, parse_commodity_page


AMIS_FIXTURE = """
<html><body><table>
  <tr><td>Dated:03-09-2026</td><td>Graph</td><td>Min</td><td>Max</td><td>FQP</td><td>Quantity</td></tr>
  <tr><td><b>1 <a href='ViewPrices.aspx'>Faisalabad</a></b></td><td>Graph</td><td>11,500</td><td>12000</td><td>11750</td><td>-</td></tr>
  <tr><td><b>2 <a href='ViewPrices.aspx'>Lahore</a></b></td><td>Graph</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
</table></body></html>
"""


def test_parses_real_amis_column_order_and_skips_unavailable_rows():
    records = parse_commodity_page(AMIS_FIXTURE, "wheat", "http://www.amis.pk/example")
    assert records == [{
        "crop": "Wheat", "market": "Faisalabad", "district": "Faisalabad", "province": "Punjab",
        "minimumPrice": 11500, "maximumPrice": 12000, "averagePrice": 11750,
        "quantity": 100, "unit": "KG", "source": "AMIS", "priceDate": "2026-09-03",
        "sourceIdentifier": "AMIS:wheat:Faisalabad:2026-09-03", "sourceUrl": "http://www.amis.pk/example",
    }]


def test_normalizes_supported_crop_and_market_aliases():
    assert normalize_crop_name("Seed Cotton(Phutti)") == "Cotton"
    assert normalize_market_name("12 MandiBahaudin") == "Mandi Bahauddin"


def test_rejects_page_without_observation_date():
    with pytest.raises(AmisScrapeError):
        parse_commodity_page("<html><table></table></html>", "Wheat", "http://example.test")
