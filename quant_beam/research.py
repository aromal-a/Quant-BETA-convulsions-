"""Research: which fluctuation rules actually worked, tested honestly.

For each market group (each country, and crypto) the history is split in time:
* the first 60% (in-sample) is used to PICK the best settings of each rule,
* the last 40% (out-of-sample) is used ONLY to TEST them, like the future.

A rule "passes" only if, out-of-sample and after costs, it made money on
average, beat both the win rate AND the average return of holding just as long
from random days, and traded often enough to mean something. Only passing rules are given to the paper bot.
"""

import datetime as dt
import itertools
import json
import math
import sys
from pathlib import Path

import numpy as np

from . import backtest, oilchain, signals
from .fetch import FetchError, fetch_closes
from .markets import COUNTRIES, CRYPTO

HISTORY = "10y"
SPLIT = 0.6
MIN_TRADES_IN = 30
MIN_TRADES_OUT = 20
GRID = {
    "kind": list(signals.Rule.KINDS),
    "k": [1.5, 2.0, 2.5, 3.0],
    "hold": [1, 3, 5, 10],
    "stop": [1.5, 3.0],
}


def groups():
    for code, country in COUNTRIES.items():
        yield code, country["name"], "stock", country["symbols"]
    yield "CRYPTO", CRYPTO["name"], "crypto", {s: n for s, n in CRYPTO["symbols"].items() if s != "USDT-USD"}
    yield "OIL", "US oil chain (no car makers or pipelines)", "stock", oilchain.us_tradable()


def prepare(symbol, reader):
    stamps, closes = reader(symbol)
    z, sigma = signals.trailing_z(closes)
    return {"symbol": symbol, "stamps": stamps, "closes": closes, "z": z, "sigma": sigma,
            "purity": signals.trailing_purity(closes), "split": int(len(closes) * SPLIT)}


def pooled(markets, rule, cost, part):
    trades = []
    for m in markets:
        start, end = (0, m["split"]) if part == "in" else (m["split"], len(m["closes"]))
        trades += backtest.simulate(m["closes"], m["z"], m["sigma"], rule, cost, start, end,
                                    m["purity"] if rule.needs_purity else None)
    return trades


def baseline(markets, hold, cost):
    rates = [backtest.baseline_win_rate(m["closes"], hold, cost, m["split"], len(m["closes"])) for m in markets]
    rates = [r for r in rates if r is not None]
    return float(np.mean(rates)) if rates else None


def random_hold_average(markets, hold, cost):
    values = [backtest.baseline_avg_return(m["closes"], hold, cost, m["split"], len(m["closes"])) for m in markets]
    values = [v for v in values if v is not None]
    return float(np.mean(values)) if values else None


def buy_and_hold(markets, cost):
    moves = [math.log(m["closes"][-1] / m["closes"][m["split"]]) + 2 * math.log(1 - cost) for m in markets]
    return float(np.mean(moves))


def evidence(p_value):
    if p_value is None:
        return "none"
    if p_value < 0.01:
        return "strong"
    if p_value < 0.05:
        return "moderate"
    return "weak"


def research_group(markets, cost):
    best = {}
    for kind, k, hold, stop in itertools.product(*GRID.values()):
        rule = signals.Rule(kind, k, hold, stop)
        stats = backtest.metrics(pooled(markets, rule, cost, "in"))
        if stats["trades"] < MIN_TRADES_IN:
            continue
        if kind not in best or stats["expectancy"] > best[kind][1]["expectancy"]:
            best[kind] = (rule, stats)

    results = []
    for kind, (rule, in_stats) in best.items():
        out_stats = backtest.metrics(pooled(markets, rule, cost, "out"))
        base = baseline(markets, rule.hold, cost)
        random_avg = random_hold_average(markets, rule.hold, cost)
        checks = {
            "enough_trades": out_stats["trades"] >= MIN_TRADES_OUT,
            "profitable_after_costs": (out_stats["expectancy"] or 0) > 0,
            "beats_random_entry_win_rate": base is not None and (out_stats["win_rate"] or 0) > base,
            "beats_random_hold_average": random_avg is not None and (out_stats["expectancy"] or 0) > random_avg,
        }
        results.append({
            "rule": rule.to_dict(),
            "label": rule.label(),
            "description": signals.Rule.KINDS[kind],
            "in_sample": in_stats,
            "out_of_sample": out_stats,
            "random_entry_win_rate": base,
            "random_hold_average": random_avg,
            "checks": checks,
            "passed": all(checks.values()),
            "evidence": evidence(out_stats["p_value"]),
        })
    results.sort(key=lambda r: (r["passed"], r["out_of_sample"]["expectancy"] or -1), reverse=True)
    return results


def run(output_path, reader=None, log=lambda msg: print(msg, file=sys.stderr)):
    reader = reader or (lambda s: fetch_closes(s, history=HISTORY))
    report = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
              "method": {"split": SPLIT, "grid": GRID, "costs": backtest.COST,
                         "min_trades_in": MIN_TRADES_IN, "min_trades_out": MIN_TRADES_OUT},
              "groups": {}}
    for code, name, asset, symbols in groups():
        markets = []
        for symbol in symbols:
            try:
                markets.append(prepare(symbol, reader))
                log(f"ok    {symbol} ({len(markets[-1]['closes'])} days)")
            except (FetchError, ValueError) as error:
                log(f"skip  {symbol}: {error}")
        if not markets:
            continue
        cost = backtest.COST[asset]
        split_day = min(m["stamps"][m["split"]] for m in markets)
        report["groups"][code] = {
            "name": name,
            "asset": asset,
            "symbols": [m["symbol"] for m in markets],
            "test_period_start": dt.datetime.fromtimestamp(split_day, dt.timezone.utc).date().isoformat(),
            "buy_and_hold_log_return": buy_and_hold(markets, cost),
            "rules": research_group(markets, cost),
        }
        passed = sum(r["passed"] for r in report["groups"][code]["rules"])
        log(f"group {code}: {passed} rule(s) passed out-of-sample")

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=1))
    log(f"wrote {path}")
    return report
