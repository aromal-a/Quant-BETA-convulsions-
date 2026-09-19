"""Trading cost slice: how much one round trip (buy, then sell straight back) loses.

Reads the live Binance order book and walks it level by level, so the cost
includes the bid-ask spread, the price impact of large orders, and fees.
"""

import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

from .fetch import HEADERS, FetchError

DEPTH_URL = "https://api.binance.com/api/v3/depth?symbol={symbol}&limit=5000"
PAIRS = {"BTCUSDT": "Bitcoin", "ETHUSDT": "Ethereum", "SOLUSDT": "Solana"}
TAKER_FEE = 0.001  # Binance standard spot fee per side, before any discounts
SIZES = [100, 1_000, 10_000, 100_000, 1_000_000, 5_000_000]
CURVE = np.logspace(2, 7, 41)  # $100 .. $10M, for the page's own-size box


def fetch_book(symbol, timeout=20):
    try:
        request = urllib.request.Request(DEPTH_URL.format(symbol=symbol), headers=HEADERS)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            book = json.load(response)
    except (OSError, ValueError) as error:
        raise FetchError(f"{symbol}: {error}")
    if not book.get("bids") or not book.get("asks"):
        raise FetchError(f"{symbol}: empty order book")
    return book


def average_fill(levels, usd):
    """Average price for trading `usd` worth against these book levels, or None if too thin."""
    left, qty = usd, 0.0
    for price, amount in levels:
        price, amount = float(price), float(amount)
        take = min(left, price * amount)
        qty += take / price
        left -= take
        if left <= 1e-9:
            return usd / qty
    return None


def round_trip(book, usd, fee=TAKER_FEE):
    bid, ask = float(book["bids"][0][0]), float(book["asks"][0][0])
    mid = (bid + ask) / 2
    buy, sell = average_fill(book["asks"], usd), average_fill(book["bids"], usd)
    if buy is None or sell is None:
        return None
    market = (buy - sell) / mid
    total = market + 2 * fee
    return {"size": usd, "market": market, "fees": 2 * fee, "total": total, "loss": usd * total}


def analyse_book(book, fee=TAKER_FEE):
    bid, ask = float(book["bids"][0][0]), float(book["asks"][0][0])
    mid = (bid + ask) / 2
    curve = [round_trip(book, float(s), fee) for s in CURVE]
    return {
        "mid": mid,
        "spread": (ask - bid) / mid,
        "sizes": [round_trip(book, s, fee) for s in SIZES],
        "curve": {"size": [round(float(s), 2) for s in CURVE],
                  "total": [None if c is None else round(c["total"], 7) for c in curve]},
    }


def run(output_path, reader=fetch_book, log=lambda m: print(m, file=sys.stderr)):
    pairs = {}
    for symbol, name in PAIRS.items():
        try:
            pairs[symbol] = {"name": name, **analyse_book(reader(symbol))}
            log(f"ok    {symbol}")
        except FetchError as error:
            log(f"skip  {symbol}: {error}")
    if not pairs:
        raise SystemExit("no order book could be read; keeping the previous file")
    report = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
              "source": "Binance spot order book", "fee_per_side": TAKER_FEE, "pairs": pairs}
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(report, indent=1))
    log(f"wrote {output_path}")
    return report
