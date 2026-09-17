"""Re-reads daily closing prices from the Yahoo Finance chart endpoint."""

import json
import time
import urllib.parse
import urllib.request

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d"
HEADERS = {"User-Agent": "Mozilla/5.0 (Quant-beam; +https://github.com/aromal-a/Quant-BETA-convulsions-)"}


class FetchError(RuntimeError):
    pass


def fetch_closes(symbol, history="2y", retries=3, timeout=20):
    """Return (timestamps, closes) for one symbol, oldest first, gaps removed."""
    url = CHART_URL.format(symbol=urllib.parse.quote(symbol), range=history)
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            return parse_chart(payload, symbol)
        except (OSError, ValueError, FetchError) as error:
            last_error = error
            time.sleep(2 ** attempt)
    raise FetchError(f"{symbol}: {last_error}")


def parse_chart(payload, symbol):
    chart = payload.get("chart") or {}
    if chart.get("error"):
        raise FetchError(f"{symbol}: {chart['error']}")
    results = chart.get("result") or []
    if not results:
        raise FetchError(f"{symbol}: empty result")
    result = results[0]
    stamps = result.get("timestamp") or []
    closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    pairs = [(t, c) for t, c in zip(stamps, closes) if c is not None and c > 0]
    if len(pairs) < 30:
        raise FetchError(f"{symbol}: only {len(pairs)} usable prices")
    return [t for t, _ in pairs], [c for _, c in pairs]
