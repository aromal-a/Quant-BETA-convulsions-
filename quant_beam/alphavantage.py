"""Optional Alpha Vantage price source.

The key is read ONLY from the ALPHAVANTAGE_API_KEY environment variable (or a
GitHub Actions secret of the same name). Never write the key into this repo.
Crypto and Indian index symbols are not mapped here; those stay on the
default source.
"""

import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from .fetch import FetchError

URL = "https://www.alphavantage.co/query?"
SYMBOL_MAP = {"RELIANCE.NS": "RELIANCE.BSE", "TCS.NS": "TCS.BSE", "INFY.NS": "INFY.BSE"}


def available():
    return bool(os.environ.get("ALPHAVANTAGE_API_KEY"))


def supports(symbol):
    return not symbol.startswith("^") and not symbol.endswith("-USD")


def fetch_closes(symbol, timeout=30):
    key = os.environ.get("ALPHAVANTAGE_API_KEY")
    if not key:
        raise FetchError("ALPHAVANTAGE_API_KEY is not set")
    query = urllib.parse.urlencode({
        "function": "TIME_SERIES_DAILY",
        "symbol": SYMBOL_MAP.get(symbol, symbol),
        "outputsize": "full",
        "apikey": key,
    })
    try:
        with urllib.request.urlopen(URL + query, timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError) as error:
        raise FetchError(f"{symbol}: {error}")
    series = payload.get("Time Series (Daily)")
    if not series:
        message = payload.get("Note") or payload.get("Information") or payload.get("Error Message") or "no data"
        raise FetchError(f"{symbol}: {message}")
    days = sorted(series)
    stamps = [int(datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()) for d in days]
    closes = [float(series[d]["4. close"]) for d in days]
    return stamps, closes


def with_fallback(reader):
    """Use `reader` first; if it fails and a key is set, try Alpha Vantage instead.

    The free Alpha Vantage tier allows only a few calls a day, so it is a backup,
    not the main source.
    """
    def read(symbol):
        try:
            return reader(symbol)
        except FetchError:
            if available() and supports(symbol):
                return fetch_closes(symbol)
            raise
    return read
