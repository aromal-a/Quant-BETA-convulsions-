"""Paper QuantBot: trades PRETEND money on real daily prices.

It never connects to a broker and never places real orders.

Each run it walks through any new daily bars for every market and, bar by bar:
1. fills yesterday's signals at today's close (same timing as the backtest),
2. exits open positions on stop-loss, take-profit or holding time,
3. checks the rules that PASSED out-of-sample research and queues new entries,
4. applies the guard: if a wallet falls `MAX_DRAWDOWN` below its peak, the bot
   closes everything and halts itself before losses grow.

Money is split evenly across the markets that share a wallet, so liquidity is
spread out instead of piled into one trade.
"""

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np

from . import alphavantage, backtest, signals
from .fetch import FetchError, fetch_closes
from .markets import COUNTRIES, CRYPTO

START_CASH = {"INR": 1_000_000.0, "USD": 10_000.0}
MAX_DRAWDOWN = 0.10
HISTORY = "2y"


def universe():
    """(symbol, group code, wallet currency, asset type) for every tradable market."""
    for code, country in COUNTRIES.items():
        for symbol in country["symbols"]:
            yield symbol, code, country["currency"], "stock"
    for symbol in CRYPTO["symbols"]:
        if symbol != "USDT-USD":
            yield symbol, "CRYPTO", CRYPTO["currency"], "crypto"


def day(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat()


def completed_days(stamps, closes, today):
    """Drop today's bar: its close can still change, and trading on it would peek ahead."""
    keep = sum(1 for ts in stamps if day(ts) < today)
    return stamps[:keep], closes[:keep]


def new_state():
    return {
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "halted": False,
        "halt_reason": None,
        "wallets": {c: {"start": v, "cash": v, "peak": v} for c, v in START_CASH.items()},
        "positions": [],
        "pending": [],
        "trades": [],
        "last_seen": {},
        "last_price": {},
        "equity_history": [],
    }


def load_state(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return new_state()


def save_state(state, path):
    state["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(state, indent=1))


def passed_rules(research_path):
    try:
        report = json.loads(Path(research_path).read_text())
    except (OSError, ValueError):
        return {}
    return {code: [signals.Rule.from_dict(r["rule"]) for r in group["rules"] if r["passed"]]
            for code, group in report.get("groups", {}).items()}


def equity(state, currency):
    wallet = state["wallets"][currency]
    held = sum(p["qty"] * state["last_price"].get(p["symbol"], p["entry_price"])
               for p in state["positions"] if p["currency"] == currency)
    return wallet["cash"] + held


def slot_size(state, currency):
    slots = sum(1 for _, _, c, _ in universe() if c == currency)
    return equity(state, currency) / slots


def close_position(state, position, price, ts, reason, cost):
    proceeds = position["qty"] * price * (1 - cost)
    state["wallets"][position["currency"]]["cash"] += proceeds
    pnl = proceeds - position["invested"]
    state["positions"].remove(position)
    state["trades"].append({
        **{k: position[k] for k in ("symbol", "group", "currency", "rule", "entry_date", "entry_price", "qty")},
        "exit_date": day(ts), "exit_price": price, "reason": reason,
        "pnl": pnl, "return": pnl / position["invested"],
    })


def step_market(state, symbol, group, currency, asset, stamps, closes, rules, log):
    cost = backtest.COST[asset]
    z, sigma = signals.trailing_z(closes)
    purity = signals.trailing_purity(closes) if any(r.needs_purity for r in rules) else None
    last = state["last_seen"].get(symbol)
    first_run = last is None
    new_bars = [len(stamps) - 1] if first_run else [i for i, t in enumerate(stamps) if t > last]

    for i in new_bars:
        price, ts = closes[i], stamps[i]
        state["last_price"][symbol] = price

        position = next((p for p in state["positions"] if p["symbol"] == symbol), None)
        if position:
            position["bars_held"] += 1
            move = math.log(price / position["entry_price"])
            rule = signals.Rule.from_dict(position["rule"])
            reason = None
            if move <= -rule.stop * position["risk_sigma"]:
                reason = "stop"
            elif rule.take is not None and move >= rule.take * position["risk_sigma"]:
                reason = "take"
            elif position["bars_held"] >= rule.hold:
                reason = "time"
            if reason:
                close_position(state, position, price, ts, reason, cost)
                log(f"exit  {symbol} {reason} at {price:.4f}")

        for pending in [p for p in state["pending"] if p["symbol"] == symbol]:
            state["pending"].remove(pending)
            if state["halted"] or any(p["symbol"] == symbol for p in state["positions"]):
                continue
            wallet = state["wallets"][currency]
            budget = min(slot_size(state, currency), wallet["cash"])
            if budget <= 0:
                continue
            qty = budget * (1 - cost) / price
            wallet["cash"] -= budget
            state["positions"].append({
                "symbol": symbol, "group": group, "currency": currency, "rule": pending["rule"],
                "entry_date": day(ts), "entry_price": price, "qty": qty, "invested": budget,
                "risk_sigma": pending["risk_sigma"], "bars_held": 0,
                "stop_price": price * math.exp(-pending["rule"]["stop"] * pending["risk_sigma"]),
            })
            log(f"enter {symbol} at {price:.4f} ({signals.Rule.from_dict(pending['rule']).label()})")

        busy = any(p["symbol"] == symbol for p in state["positions"] + state["pending"])
        if not state["halted"] and not busy:
            for rule in rules:
                if rule.fires(z[i], None if purity is None else purity[i]) and not np.isnan(sigma[i]):
                    state["pending"].append({"symbol": symbol, "rule": rule.to_dict(),
                                             "signal_date": day(ts), "risk_sigma": float(sigma[i])})
                    log(f"signal {symbol} z={z[i]:.2f}: {rule.label()}")
                    break

    if stamps:
        state["last_seen"][symbol] = stamps[-1]


def guard(state, log):
    """Halt and flatten everything if any wallet drops too far below its peak."""
    for currency, wallet in state["wallets"].items():
        value = equity(state, currency)
        wallet["peak"] = max(wallet.get("peak", wallet["start"]), value)
        drawdown = 1 - value / wallet["peak"]
        if drawdown >= MAX_DRAWDOWN and not state["halted"]:
            cancel_all(state, f"guard: {currency} wallet fell {drawdown:.1%} below its peak", log)


def cancel_all(state, reason, log):
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    assets = {s: a for s, _, _, a in universe()}
    for position in list(state["positions"]):
        price = state["last_price"].get(position["symbol"], position["entry_price"])
        close_position(state, position, price, now, "cancel", backtest.COST[assets[position["symbol"]]])
    state["pending"] = []
    state["halted"] = True
    state["halt_reason"] = reason
    log(f"halted: {reason}")


def record_equity(state):
    state["equity_history"].append({
        "date": dt.date.today().isoformat(),
        **{c: round(equity(state, c), 2) for c in state["wallets"]},
    })
    state["equity_history"] = state["equity_history"][-400:]


def run(state_path, research_path, reader=None, log=lambda m: print(m, file=sys.stderr), today=None):
    reader = reader or alphavantage.with_fallback(lambda s: fetch_closes(s, history=HISTORY))
    state = load_state(state_path)
    rules = passed_rules(research_path)
    state["active_rules"] = {code: [r.label() for r in rs] for code, rs in rules.items()}
    today = today or dt.datetime.now(dt.timezone.utc).date().isoformat()
    for symbol, group, currency, asset in universe():
        try:
            stamps, closes = reader(symbol)
        except (FetchError, ValueError) as error:
            log(f"skip  {symbol}: {error}")
            continue
        stamps, closes = completed_days(stamps, closes, today)
        step_market(state, symbol, group, currency, asset, stamps, closes, rules.get(group, []), log)
    guard(state, log)
    record_equity(state)
    save_state(state, state_path)
    return state


def cancel(state_path, reader=None, log=lambda m: print(m, file=sys.stderr)):
    """Close every pretend position at the latest price and halt the bot."""
    reader = reader or (lambda s: fetch_closes(s, history="5d"))
    state = load_state(state_path)
    for position in state["positions"]:
        try:
            _, closes = reader(position["symbol"])
            state["last_price"][position["symbol"]] = closes[-1]
        except (FetchError, ValueError) as error:
            log(f"using last known price for {position['symbol']}: {error}")
    cancel_all(state, "cancelled by user", log)
    record_equity(state)
    save_state(state, state_path)
    return state


def resume(state_path, log=lambda m: print(m, file=sys.stderr)):
    state = load_state(state_path)
    state["halted"], state["halt_reason"] = False, None
    for currency, wallet in state["wallets"].items():
        wallet["peak"] = equity(state, currency)
    save_state(state, state_path)
    log("bot resumed")
    return state


def summary(state):
    lines = []
    status = f"HALTED ({state['halt_reason']})" if state["halted"] else "running"
    lines.append(f"Paper QuantBot · {status} · pretend money only")
    for currency, wallet in state["wallets"].items():
        value = equity(state, currency)
        lines.append(f"  {currency} wallet: {value:,.2f}  ({value / wallet['start'] - 1:+.2%} since start, cash {wallet['cash']:,.2f})")
    lines.append(f"  open positions: {len(state['positions'])}, queued signals: {len(state['pending'])}")
    for p in state["positions"]:
        last = state["last_price"].get(p["symbol"], p["entry_price"])
        lines.append(f"    {p['symbol']:12} since {p['entry_date']}  {last / p['entry_price'] - 1:+.2%}")
    closed = state["trades"]
    if closed:
        wins = sum(t["pnl"] > 0 for t in closed)
        lines.append(f"  closed trades: {len(closed)}, win rate {wins / len(closed):.0%}")
    return "\n".join(lines)
