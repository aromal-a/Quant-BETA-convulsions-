"""Chain links: one median candlestick for a whole chain, and how perforated that chain is.

A chain is a set of links that trade separately but belong together: the listed
operators of one company around the world (McDonald's: MCD, 2702.T, ARCO,
WESTLIFE.NS) or the companies of one value-chain segment from oilchain.py.

* median candle -> every link is rebased to 100 and its volume divided by its own
                   median volume, so exchanges and currencies can be compared; each
                   candle is then the median open, high, low, close and volume
                   across the links.
* sell block    -> a down candle on more than SELL_VOLUME x the link's usual volume.
* perforation   -> one 0..1 score from three parts: the share of links with a recent
                   sell block, the share of links whose margin is leaking, and how
                   closely the links' prices move as one ("markets joined").
* median hit    -> the median candle's close crossing its own trailing median. The
                   app asks the user for an up/down call at that moment and shows
                   how often past hits in the same direction were followed by a
                   higher close.

At the median the beam itself is 50/50 by definition, so the number shown with the
prompt is the past follow-through rate, not the beam. It is a count of what
happened before; it was NOT back-tested with costs, and it is not a recommendation.
"""

import datetime as dt
import json
import math
import statistics
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from . import fundamentals
from .fetch import HEADERS, FetchError
from .oilchain import SEGMENTS

CANDLE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval={interval}"

COMPANY_CHAINS = {
    "mcdonalds": {
        "name": "McDonald's",
        "links": {"MCD": ("McDonald's Corp", "US"), "2702.T": ("McDonald's Japan", "JP"),
                  "ARCO": ("Arcos Dorados", "LATAM"), "WESTLIFE.NS": ("Westlife Foodworld", "IN")},
    },
}

VOLUME_WINDOW = 60     # bars used for a link's usual volume
SELL_VOLUME = 1.5      # a sell block trades more than this multiple of usual volume
SELL_LOOKBACK = 5      # bars checked for a recent sell block
MEDIAN_WINDOW = 20     # bars in the trailing median that price "hits"
HIT_HORIZON = 5        # bars after a hit used to score follow-through
MIN_HITS = 10          # fewer past hits than this and no probability is shown
JOIN_WINDOW = 60       # bars of returns used for "markets joined"
WEIGHTS = {"sell_volume": 0.5, "margin_leaks": 0.3, "markets_joined": 0.2}


def all_chains():
    """Company chains plus every oilchain segment, in one shape."""
    chains = {code: dict(chain) for code, chain in COMPANY_CHAINS.items()}
    for code, segment in SEGMENTS.items():
        chains[code] = {"name": segment["name"], "links": segment["companies"]}
    return chains


def fetch_candles(symbol, history="1y", interval="1d", retries=3, timeout=20):
    """Return candles for one symbol, oldest first: dicts of t, o, h, l, c, v."""
    url = CANDLE_URL.format(symbol=urllib.parse.quote(symbol), range=history, interval=interval)
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            return parse_candles(payload, symbol)
        except (OSError, ValueError, FetchError) as error:
            last_error = error
            time.sleep(2 ** attempt)
    raise FetchError(f"{symbol}: {last_error}")


def parse_candles(payload, symbol):
    chart = payload.get("chart") or {}
    if chart.get("error"):
        raise FetchError(f"{symbol}: {chart['error']}")
    results = chart.get("result") or []
    if not results:
        raise FetchError(f"{symbol}: empty result")
    result = results[0]
    stamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    columns = [quote.get(key) or [] for key in ("open", "high", "low", "close", "volume")]
    candles = []
    for t, o, h, l, c, v in zip(stamps, *columns):
        if None in (o, h, l, c, v) or min(o, h, l, c) <= 0:
            continue
        candles.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})
    if len(candles) < 30:
        raise FetchError(f"{symbol}: only {len(candles)} usable candles")
    return candles


def day(stamp):
    return dt.datetime.fromtimestamp(stamp, dt.timezone.utc).date()


def usual_volume(candles, index, window=VOLUME_WINDOW):
    """Median volume of the bars before `index` (never the bar itself)."""
    past = [c["v"] for c in candles[max(0, index - window):index] if c["v"] > 0]
    return statistics.median(past) if len(past) >= 5 else None


def relative_volumes(candles, window=VOLUME_WINDOW):
    """Each bar's volume as a multiple of the link's usual volume; None while warming up."""
    out = []
    for i, candle in enumerate(candles):
        usual = usual_volume(candles, i, window)
        out.append(candle["v"] / usual if usual else None)
    return out


def sell_block_flags(candles, threshold=SELL_VOLUME, window=VOLUME_WINDOW):
    """True for each down candle that traded more than `threshold` x usual volume."""
    rel = relative_volumes(candles, window)
    return [r is not None and c["c"] < c["o"] and r > threshold for c, r in zip(candles, rel)]


def median_candles(links, threshold=SELL_VOLUME, window=VOLUME_WINDOW):
    """Collapse {symbol: candles} into one series of median candles.

    A day is kept when at least half the links (and at least two) traded on it.
    """
    per_day = {}
    for symbol, candles in links.items():
        base = candles[0]["c"]
        rel = relative_volumes(candles, window)
        sells = sell_block_flags(candles, threshold, window)
        for candle, r, sell in zip(candles, rel, sells):
            per_day.setdefault(day(candle["t"]), []).append({
                "o": candle["o"] / base * 100, "h": candle["h"] / base * 100,
                "l": candle["l"] / base * 100, "c": candle["c"] / base * 100,
                "rel": r, "sell": sell})
    need = max(2, math.ceil(len(links) / 2)) if len(links) > 1 else 1
    out = []
    for date in sorted(per_day):
        bars = per_day[date]
        if len(bars) < need:
            continue
        rels = [b["rel"] for b in bars if b["rel"] is not None]
        out.append({
            "date": date.isoformat(),
            "o": statistics.median(b["o"] for b in bars), "h": statistics.median(b["h"] for b in bars),
            "l": statistics.median(b["l"] for b in bars), "c": statistics.median(b["c"] for b in bars),
            "volume": statistics.median(rels) if rels else None,
            "links": len(bars), "sell_links": sum(1 for b in bars if b["sell"])})
    return out


def trailing_median(values, window=MEDIAN_WINDOW):
    return [statistics.median(values[max(0, i - window + 1):i + 1]) for i in range(len(values))]


def median_hits(candles, window=MEDIAN_WINDOW, horizon=HIT_HORIZON, min_hits=MIN_HITS):
    """Find closes crossing their trailing median and score what followed.

    `pending` is set when the newest bar is itself a hit: that is the moment the
    app puts the up/down question to the user.
    """
    closes = [c["c"] for c in candles]
    medians = trailing_median(closes, window)
    hits = []
    for i in range(window, len(closes)):
        before, now = closes[i - 1] - medians[i - 1], closes[i] - medians[i]
        if before == 0 or now == 0 or (before > 0) == (now > 0):
            continue
        hits.append({"index": i, "date": candles[i].get("date"), "median": medians[i],
                     "direction": "from_below" if now > 0 else "from_above"})
    stats = {}
    for direction in ("from_below", "from_above"):
        scored = [h for h in hits if h["direction"] == direction and h["index"] + horizon < len(closes)]
        up = sum(1 for h in scored if closes[h["index"] + horizon] > closes[h["index"]])
        stats[direction] = {"count": len(scored), "up": up,
                            "p_up": up / len(scored) if len(scored) >= min_hits else None}
    pending = None
    if hits and hits[-1]["index"] == len(closes) - 1:
        last = hits[-1]
        pending = {"date": last["date"], "direction": last["direction"], "median": last["median"],
                   "close": closes[-1], "horizon": horizon, **stats[last["direction"]]}
    return {"window": window, "horizon": horizon, "hits": hits, "stats": stats, "pending": pending}


def log_returns(candles):
    return {day(b["t"]): math.log(b["c"] / a["c"]) for a, b in zip(candles, candles[1:])}


def correlation(xs, ys):
    n = len(xs)
    if n < 10:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def markets_joined(links, window=JOIN_WINDOW):
    """Mean pairwise correlation of the links' daily returns, clipped to 0..1; None if unknown."""
    returns = {symbol: log_returns(candles) for symbol, candles in links.items()}
    symbols = sorted(returns)
    values = []
    for i, a in enumerate(symbols):
        for b in symbols[i + 1:]:
            shared = sorted(set(returns[a]) & set(returns[b]))[-window:]
            corr = correlation([returns[a][d] for d in shared], [returns[b][d] for d in shared])
            if corr is not None:
                values.append(corr)
    if not values:
        return None
    return min(1.0, max(0.0, sum(values) / len(values)))


def perforation(sell_share, leak_share, joined, weights=WEIGHTS):
    """Weighted 0..1 score; a part that is unknown (None) drops out and the rest are re-weighted."""
    parts = {"sell_volume": sell_share, "margin_leaks": leak_share, "markets_joined": joined}
    known = {key: value for key, value in parts.items() if value is not None}
    total = sum(weights[key] for key in known)
    if not known or total == 0:
        return {"score": None, "label": "unknown", "parts": parts}
    score = sum(weights[key] * value for key, value in known.items()) / total
    label = "holding" if score < 0.25 else "partly perforated" if score < 0.6 else "perforated"
    return {"score": score, "label": label, "parts": parts}


def analyse_chain(name, link_names, candles_by_symbol, leaks=None, lookback=SELL_LOOKBACK):
    """Build the report for one chain from candles already in hand.

    `leaks` maps symbol -> True / False / None (None = margins unknown).
    """
    leaks = leaks or {}
    rows = []
    for symbol, candles in candles_by_symbol.items():
        rel = relative_volumes(candles)
        sells = sell_block_flags(candles)
        label, country = link_names.get(symbol, (symbol, None))
        rows.append({"symbol": symbol, "name": label, "country": country, "last_price": candles[-1]["c"],
                     "relative_volume": rel[-1], "sell_blocks": sum(sells[-lookback:]),
                     "sell_pressure": any(sells[-lookback:]), "leaking": leaks.get(symbol)})
    candles = median_candles(candles_by_symbol)
    known_leaks = [row["leaking"] for row in rows if row["leaking"] is not None]
    volumes = [row["relative_volume"] for row in rows if row["relative_volume"] is not None]
    score = perforation(
        sum(1 for row in rows if row["sell_pressure"]) / len(rows) if rows else None,
        sum(known_leaks) / len(known_leaks) if known_leaks else None,
        markets_joined(candles_by_symbol) if len(candles_by_symbol) > 1 else None)
    return {"name": name, "links": rows, "link_count": len(rows),
            "sell_links": sum(1 for row in rows if row["sell_pressure"]),
            "median_volume": statistics.median(volumes) if volumes else None,
            "perforation": score, "candles": candles[-120:], "median_hit": median_hits(candles)}


def fetch_leak(symbol, quarter_reader=fundamentals.fetch_quarters):
    try:
        report = fundamentals.margin_report(quarter_reader(symbol))
    except (FetchError, ValueError, KeyError, IndexError, TypeError):
        return None
    return report.get("leak") is not None


def run(output_path, chains=None, candle_reader=fetch_candles, leak_reader=fetch_leak,
        log=lambda m: print(m, file=sys.stderr)):
    chains = chains or all_chains()
    report = {"generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
              "weights": WEIGHTS, "chains": {}}
    for code, chain in chains.items():
        candles, leaks = {}, {}
        for symbol in chain["links"]:
            try:
                candles[symbol] = candle_reader(symbol)
            except (FetchError, ValueError) as error:
                log(f"skip  {symbol}: {error}")
                continue
            leaks[symbol] = leak_reader(symbol)
            log(f"ok    {symbol}")
        if candles:
            report["chains"][code] = analyse_chain(chain["name"], chain["links"], candles, leaks)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=1))
    return report
