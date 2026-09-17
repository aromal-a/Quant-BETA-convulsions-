"""End-to-end run: re-read prices, analyse, score, write JSON for the page."""

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

from . import alphavantage, fluctuations, losses, quantum
from .fetch import FetchError, fetch_closes
from .markets import COUNTRIES, CRYPTO, PEGGED

GRID_STEP = 10  # send every 10th grid point (dz = 0.1) to keep the JSON small
PRICE_POINTS = 180


def analyse_symbol(symbol, name, currency, periods_per_year, timestamps, closes):
    base = fluctuations.analyse(closes, periods_per_year)
    z = base["z"]

    normal = np.exp(-quantum.GRID ** 2 / 2.0) / np.sqrt(2.0 * np.pi)
    empirical = quantum.kde_density(z)
    coefficients, phis = quantum.expand(empirical)
    reconstructed = quantum.reconstruct(coefficients, phis)

    normal_errors = fluctuations.cold_probability_errors(z, fluctuations.normal_two_sided_tail)
    quantum_errors = fluctuations.cold_probability_errors(
        z, lambda k: quantum.tail_probability(reconstructed, k)
    )

    record = {
        "symbol": symbol,
        "name": name,
        "currency": currency,
        "last_price": closes[-1],
        "last_date": dt.datetime.fromtimestamp(timestamps[-1], dt.timezone.utc).date().isoformat(),
        "observations": int(len(z)),
        "mu": base["mu"],
        "sigma": base["sigma"],
        "annual_volatility": base["annual_volatility"],
        "last_return": base["last_return"],
        "last_z": base["last_z"],
        "skew": base["skew"],
        "excess_kurtosis": base["excess_kurtosis"],
        "band_share": base["band_share"],
        "cold_probability_error": {"normal": normal_errors, "quantum": quantum_errors},
        "loss": {
            "normal": losses.score(empirical, normal, z, normal_errors),
            "quantum": losses.score(empirical, reconstructed, z, quantum_errors),
        },
        "quantum": quantum.state_summary(coefficients),
        "curves": {
            "z": quantum.GRID[::GRID_STEP].round(3).tolist(),
            "empirical": empirical[::GRID_STEP].round(6).tolist(),
            "normal": normal[::GRID_STEP].round(6).tolist(),
            "quantum": reconstructed[::GRID_STEP].round(6).tolist(),
        },
        "prices": {
            "t": timestamps[-PRICE_POINTS:],
            "close": [round(c, 6) for c in closes[-PRICE_POINTS:]],
        },
        "rolling_volatility_20": [round(v, 6) for v in base["rolling_volatility_20"][-PRICE_POINTS:]],
    }
    if symbol in PEGGED:
        target = PEGGED[symbol]
        record["peg"] = {"target": target, "deviation": closes[-1] - target}
    return record


def run_group(group, reader, previous, log):
    records = []
    for symbol, name in group["symbols"].items():
        try:
            timestamps, closes = reader(symbol)
            records.append(analyse_symbol(
                symbol, name, group["currency"], group["periods_per_year"], timestamps, closes
            ))
            log(f"ok    {symbol}")
        except (FetchError, ValueError) as error:
            stale = previous.get(symbol)
            if stale:
                records.append({**stale, "stale": True})
                log(f"stale {symbol}: {error}")
            else:
                log(f"skip  {symbol}: {error}")
    return records


def previous_records(path):
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}
    found = {}
    for country in data.get("countries", {}).values():
        found.update({r["symbol"]: r for r in country.get("markets", [])})
    found.update({r["symbol"]: r for r in data.get("crypto", {}).get("markets", [])})
    return found


def run(output_path, reader=None, log=lambda msg: print(msg, file=sys.stderr)):
    reader = reader or alphavantage.with_fallback(fetch_closes)
    previous = previous_records(output_path)
    result = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "countries": {},
        "crypto": {},
    }
    for code, country in COUNTRIES.items():
        result["countries"][code] = {
            "name": country["name"],
            "currency": country["currency"],
            "timezone": country["timezone"],
            "markets": run_group(country, reader, previous, log),
        }
    result["crypto"] = {
        "name": CRYPTO["name"],
        "currency": CRYPTO["currency"],
        "markets": run_group(CRYPTO, reader, previous, log),
    }

    fresh = sum(
        1 for group in [*result["countries"].values(), result["crypto"]]
        for record in group["markets"] if not record.get("stale")
    )
    if fresh == 0:
        raise SystemExit("no market could be re-read; keeping the previous data file")

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, separators=(",", ":")))
    log(f"wrote {path} ({fresh} fresh markets)")
    return result
