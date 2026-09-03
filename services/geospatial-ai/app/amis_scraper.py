from __future__ import annotations

from datetime import date
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class AmisScrapeError(RuntimeError):
    pass


MARKET_NAMES = {
    "dgkhan": "Dera Ghazi Khan", "faisalabad": "Faisalabad", "gujranwala": "Gujranwala",
    "jauharabad": "Jauharabad", "lahore": "Lahore", "mandibahaudin": "Mandi Bahauddin",
    "multan": "Multan", "multanroadlahore": "Multan Road Lahore", "pakpattan": "Pakpattan",
    "rahimyarkhan": "Rahim Yar Khan", "rawalpindi": "Rawalpindi", "sahiwal": "Sahiwal",
    "sargodha": "Sargodha",
}


def normalize_crop_name(value: str) -> str:
    key = re.sub(r"[^a-z]", "", value.casefold())
    aliases = {"wheat": "Wheat", "maize": "Maize", "seedcottonphutti": "Cotton", "cotton": "Cotton", "riceirri": "Rice", "ricebasmatisupernew": "Rice", "sugarcane": "Sugarcane"}
    return aliases.get(key, " ".join(value.split()).title())


def normalize_market_name(value: str) -> str:
    cleaned = re.sub(r"^\d+\s*", "", " ".join(value.split())).strip()
    key = re.sub(r"[^a-z]", "", cleaned.casefold())
    return MARKET_NAMES.get(key, cleaned.title())


def parse_price(value: str) -> int | None:
    cleaned = value.replace(",", "").strip()
    if not cleaned or cleaned == "-" or not re.fullmatch(r"\d+(?:\.\d+)?", cleaned):
        return None
    amount = round(float(cleaned))
    return amount if amount > 0 else None


def parse_price_date(soup: BeautifulSoup) -> date:
    match = re.search(r"Dated\s*:\s*(\d{2})-(\d{2})-(\d{4})", soup.get_text(" ", strip=True), re.I)
    if not match:
        raise AmisScrapeError("AMIS price date was not found")
    day, month, year = (int(item) for item in match.groups())
    return date(year, month, day)


def parse_commodity_page(html: str, crop_name: str, source_url: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    price_date = parse_price_date(soup)
    result: list[dict[str, Any]] = []
    for row in soup.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 5:
            continue
        minimum = parse_price(cells[2].get_text(" ", strip=True))
        maximum = parse_price(cells[3].get_text(" ", strip=True))
        average = parse_price(cells[4].get_text(" ", strip=True))
        if minimum is None or maximum is None or average is None:
            continue
        market_link = cells[0].find("a")
        market_text = market_link.get_text(" ", strip=True) if market_link else cells[0].get_text(" ", strip=True)
        market = normalize_market_name(market_text)
        if not market or minimum > maximum or not minimum <= average <= maximum:
            continue
        result.append({"crop": normalize_crop_name(crop_name), "market": market, "district": market, "province": "Punjab", "minimumPrice": minimum, "maximumPrice": maximum, "averagePrice": average, "quantity": 100, "unit": "KG", "source": "AMIS", "priceDate": price_date.isoformat(), "sourceIdentifier": f"AMIS:{crop_name}:{market}:{price_date.isoformat()}", "sourceUrl": source_url})
    if not result:
        raise AmisScrapeError(f"AMIS returned no usable prices for {crop_name}")
    return result


class AmisScraper:
    def __init__(self, base_url: str, timeout_seconds: float = 20, delay_seconds: float = 1) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"amis.pk", "www.amis.pk"} or parsed.username or parsed.password:
            raise AmisScrapeError("AMIS base URL is not an approved origin")
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout_seconds = timeout_seconds
        self.delay_seconds = delay_seconds
        self.session = requests.Session()
        retry = Retry(total=2, connect=2, read=2, backoff_factor=0.5, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset({"GET"}), respect_retry_after_header=True)
        self.session.mount("http://", HTTPAdapter(max_retries=retry))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "FasalGuard-MarketBot/1.0 (+market-data ingestion; contact configured by operator)", "Accept": "text/html,application/xhtml+xml"})

    def fetch(self, commodities: list[dict[str, str]]) -> list[dict[str, Any]]:
        prices: list[dict[str, Any]] = []
        for index, commodity in enumerate(commodities):
            if index:
                time.sleep(self.delay_seconds)
            commodity_id = commodity["commodityId"]
            if not commodity_id.isdigit():
                raise AmisScrapeError("Invalid AMIS commodity identifier")
            target = urljoin(self.base_url, f"ViewPrices.aspx?searchType=0&commodityId={commodity_id}")
            try:
                response = self.session.get(target, timeout=self.timeout_seconds, allow_redirects=False)
                response.raise_for_status()
            except requests.RequestException as exc:
                raise AmisScrapeError(f"AMIS request failed for {commodity['name']}") from exc
            if "text/html" not in response.headers.get("content-type", "").casefold():
                raise AmisScrapeError("AMIS returned an unexpected content type")
            if len(response.content) > 2_000_000:
                raise AmisScrapeError("AMIS response exceeded the configured safety limit")
            prices.extend(parse_commodity_page(response.text, commodity["name"], target))
        return prices
