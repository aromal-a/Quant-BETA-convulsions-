"""Oil and transport value chain: who is winning on margins, and does the price agree?

Segments follow the physical chain from the oil well to the car and the truck:
producers -> rigs & oilfield services -> pipelines -> integrated majors ->
refiners -> car makers -> transport. Big car-and-transport countries (US, India,
plus global ADRs) are tagged so they can be compared.

For each company the ensemble combines, as cross-sectional z-scores:
* margin score  -> operating margin vs SEGMENT peers, and its change vs a year ago,
                   plus revenue growth,
* price score   -> 6-month price trend and calm (ground-state purity), minus tail risk.

"Aligned" means price and margins point the same way. "Diverging" flags a gap,
e.g. price rising while margins leak. This describes the present; it was NOT
back-tested (only about five quarters of margins are available), and it is not
a recommendation.
"""

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np

from . import fluctuations, fundamentals, quantum
from .fetch import FetchError, fetch_closes

SEGMENTS = {
    "producers": {
        "name": "Oil producers (upstream)",
        "companies": {"COP": ("ConocoPhillips", "US"), "EOG": ("EOG Resources", "US"),
                      "OXY": ("Occidental", "US"), "ONGC.NS": ("ONGC", "IN")},
    },
    "rigs": {
        "name": "Rigs & oilfield services",
        "companies": {"SLB": ("SLB", "US"), "HAL": ("Halliburton", "US"),
                      "BKR": ("Baker Hughes", "US"), "RIG": ("Transocean", "US")},
    },
    "pipelines": {
        "name": "Pipelines (midstream)",
        "companies": {"KMI": ("Kinder Morgan", "US"), "WMB": ("Williams", "US"), "ET": ("Energy Transfer", "US")},
    },
    "integrated": {
        "name": "Integrated majors",
        "companies": {"XOM": ("ExxonMobil", "US"), "CVX": ("Chevron", "US"), "SHEL": ("Shell", "GB"),
                      "BP": ("BP", "GB"), "RELIANCE.NS": ("Reliance Industries", "IN")},
    },
    "refiners": {
        "name": "Refiners & fuel retail",
        "companies": {"VLO": ("Valero", "US"), "MPC": ("Marathon Petroleum", "US"), "PSX": ("Phillips 66", "US"),
                      "BPCL.NS": ("BPCL", "IN"), "IOC.NS": ("Indian Oil", "IN"), "HINDPETRO.NS": ("HPCL", "IN")},
    },
    "cars": {
        "name": "Car makers",
        "companies": {"TM": ("Toyota", "JP"), "GM": ("General Motors", "US"), "F": ("Ford", "US"),
                      "TSLA": ("Tesla", "US"), "MARUTI.NS": ("Maruti Suzuki", "IN"),
                      "M&M.NS": ("Mahindra & Mahindra", "IN"), "TMPV.NS": ("Tata Motors PV", "IN")},
    },
    "transport": {
        "name": "Airlines, freight & logistics",
        "companies": {"DAL": ("Delta Air Lines", "US"), "UAL": ("United Airlines", "US"), "UPS": ("UPS", "US"),
                      "FDX": ("FedEx", "US"), "INDIGO.NS": ("IndiGo", "IN"), "CONCOR.NS": ("Container Corp of India", "IN")},
    },
}

BENCHMARKS = {"CL=F": "WTI crude", "BZ=F": "Brent crude", "RB=F": "Gasoline (RBOB)", "HO=F": "Diesel / heating oil"}
GALLONS_PER_BARREL = 42
WEIGHTS = {
    "margin": {"operating_margin_vs_segment": 0.4, "operating_margin_change": 0.4, "revenue_growth": 0.2},
    "price": {"trend_6m": 0.6, "calm": 0.25, "tail_risk": -0.15},
}


def crack_spread(prices):
    """3-2-1 crack spread in $/barrel: a refinery's rough gross margin per barrel of crude.

    Gasoline and diesel futures are quoted per gallon, crude per barrel.
    """
    crude = np.asarray(prices["CL=F"])
    gasoline = np.asarray(prices["RB=F"]) * GALLONS_PER_BARREL
    diesel = np.asarray(prices["HO=F"]) * GALLONS_PER_BARREL
    return (2 * gasoline + diesel - 3 * crude) / 3


def aligned_series(series):
    """Align several (stamps, closes) series on their shared days (by UTC date)."""
    by_day = [{dt.datetime.fromtimestamp(t, dt.timezone.utc).date(): c for t, c in zip(*s)} for s in series]
    days = sorted(set.intersection(*(set(d) for d in by_day)))
    return days, [[d[day] for day in days] for d in by_day]


def oil_beta(stamps, closes, oil_stamps, oil_closes, days=252):
    """Sensitivity of daily returns to WTI returns over the last year, and the correlation."""
    _, (stock, oil) = aligned_series([(stamps, closes), (oil_stamps, oil_closes)])
    stock, oil = np.diff(np.log(stock))[-days:], np.diff(np.log(oil))[-days:]
    keep = np.isfinite(stock) & np.isfinite(oil)
    stock, oil = stock[keep], oil[keep]
    if stock.size < 60 or np.var(oil) == 0:
        return None, None
    beta = float(np.cov(stock, oil)[0, 1] / np.var(oil, ddof=1))
    return beta, float(np.corrcoef(stock, oil)[0, 1])


def price_profile(closes):
    closes = np.asarray(closes, dtype=float)
    base = fluctuations.analyse(closes[-253:], 252)
    coefficients, _ = quantum.expand(quantum.kde_density(base["z"]))
    tail = next(r for r in fluctuations.cold_probability_errors(base["z"], fluctuations.normal_two_sided_tail)
                if r["sigma"] == 3)
    return {
        "return_1y": float(closes[-1] / closes[-253] - 1) if closes.size > 253 else None,
        "trend_6m": float(math.log(closes[-1] / closes[-127])) if closes.size > 127 else None,
        "annual_volatility": base["annual_volatility"],
        "purity": quantum.state_summary(coefficients)["ground_state_purity"],
        "tail_multiplier_3sigma": tail["multiplier"],
    }


def zscores(values):
    """Cross-sectional z-scores; missing values get 0 (neutral)."""
    arr = np.array([np.nan if v is None else v for v in values], dtype=float)
    ok = np.isfinite(arr)
    if ok.sum() < 3 or np.nanstd(arr[ok]) == 0:
        return [0.0] * len(values)
    # clip so one extreme company cannot dominate the ensemble
    z = np.clip((arr - np.nanmedian(arr)) / np.nanstd(arr), -3, 3)
    return [float(v) if np.isfinite(v) else 0.0 for v in z]


def ensemble(rows):
    """Add margin score, price score, total score and an alignment label to each row."""
    by_segment = {}
    for i, row in enumerate(rows):
        by_segment.setdefault(row["segment"], []).append(i)
    vs_segment = [0.0] * len(rows)
    for members in by_segment.values():
        scores = zscores([(rows[i]["margins"].get("margins") or {}).get("operating") for i in members])
        for i, score in zip(members, scores):
            vs_segment[i] = score

    features = {
        "operating_margin_vs_segment": vs_segment,
        "operating_margin_change": zscores([((r["margins"].get("change") or {}).get("operating")) for r in rows]),
        "revenue_growth": zscores([r["margins"].get("revenue_growth") for r in rows]),
        "trend_6m": zscores([r["price"].get("trend_6m") for r in rows]),
        "calm": zscores([r["price"].get("purity") for r in rows]),
        "tail_risk": zscores([r["price"].get("tail_multiplier_3sigma") for r in rows]),
    }
    for i, row in enumerate(rows):
        parts = {name: features[name][i] for name in features}
        margin = sum(w * parts[n] for n, w in WEIGHTS["margin"].items())
        price = sum(w * parts[n] for n, w in WEIGHTS["price"].items())
        row["scores"] = {"parts": parts, "margin": margin, "price": price, "ensemble": 0.5 * (margin + price)}
        row["alignment"] = alignment(margin, price)
    return rows


def alignment(margin, price, band=0.25):
    if abs(margin) < band and abs(price) < band:
        return "neutral"
    if margin >= band and price <= -band:
        return "diverging: margins ahead of price"
    if price >= band and margin <= -band:
        return "diverging: price ahead of margins"
    if margin > 0 and price > 0:
        return "aligned: strong"
    if margin < 0 and price < 0:
        return "aligned: weak"
    return "mixed"


def segment_summary(rows):
    summary = {}
    for code, segment in SEGMENTS.items():
        members = [r for r in rows if r["segment"] == code]
        pick = lambda f: [v for v in (f(r) for r in members) if v is not None]
        median = lambda vals: float(np.median(vals)) if vals else None
        summary[code] = {
            "name": segment["name"],
            "companies": len(members),
            "median_operating_margin": median(pick(lambda r: (r["margins"].get("margins") or {}).get("operating"))),
            "median_operating_margin_change": median(pick(lambda r: (r["margins"].get("change") or {}).get("operating"))),
            "median_revenue_growth": median(pick(lambda r: r["margins"].get("revenue_growth"))),
            "median_return_1y": median(pick(lambda r: r["price"].get("return_1y"))),
            "median_oil_beta": median(pick(lambda r: r.get("oil_beta"))),
            "leaking": [r["symbol"] for r in members if r["margins"].get("leak")],
            "median_ensemble": median(pick(lambda r: r["scores"]["ensemble"])),
        }
    return summary


def run(output_path, price_reader=None, quarter_reader=fundamentals.fetch_quarters,
        log=lambda m: print(m, file=sys.stderr)):
    price_reader = price_reader or (lambda s: fetch_closes(s, history="2y"))
    bench = {}
    for symbol, name in BENCHMARKS.items():
        try:
            bench[symbol] = price_reader(symbol)
        except (FetchError, ValueError) as error:
            log(f"skip  {symbol}: {error}")

    benchmarks = {}
    for symbol, (stamps, closes) in bench.items():
        benchmarks[symbol] = {"name": BENCHMARKS[symbol], "last": closes[-1],
                              "return_1y": closes[-1] / closes[-253] - 1 if len(closes) > 253 else None}
    crack = None
    if all(s in bench for s in ("CL=F", "RB=F", "HO=F")):
        days, aligned = aligned_series([bench["CL=F"], bench["RB=F"], bench["HO=F"]])
        spread = crack_spread(dict(zip(("CL=F", "RB=F", "HO=F"), aligned)))
        crack = {"last": float(spread[-1]), "avg_1y": float(np.mean(spread[-252:])),
                 "dates": [d.isoformat() for d in days[-180:]], "values": [round(float(v), 2) for v in spread[-180:]]}

    rows = []
    for code, segment in SEGMENTS.items():
        for symbol, (name, country) in segment["companies"].items():
            try:
                stamps, closes = price_reader(symbol)
                quarters = quarter_reader(symbol)
            except (FetchError, ValueError) as error:
                log(f"skip  {symbol}: {error}")
                continue
            beta, corr = oil_beta(stamps, closes, *bench["CL=F"]) if "CL=F" in bench else (None, None)
            rows.append({"symbol": symbol, "name": name, "country": country, "segment": code,
                         "segment_name": segment["name"], "last_price": closes[-1],
                         "price": price_profile(closes), "margins": fundamentals.margin_report(quarters),
                         "oil_beta": beta, "oil_correlation": corr})
            log(f"ok    {symbol}")

    ensemble(rows)
    rows.sort(key=lambda r: r["scores"]["ensemble"], reverse=True)
    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "weights": WEIGHTS,
        "benchmarks": benchmarks,
        "crack_spread_321": crack,
        "segments": segment_summary(rows),
        "companies": rows,
    }
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(report, indent=1))
    log(f"wrote {output_path} ({len(rows)} companies)")
    return report
