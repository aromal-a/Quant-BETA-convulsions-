"""Compile your own trade history into win/loss numbers.

Feed it a CSV exported from your broker (Upstox: Reports -> Trade book / Tradewise
P&L; most brokers export something similar). Buys and sells are matched oldest-first
(FIFO) per symbol, so each completed round trip becomes one closed trade.

It records what YOU did. It never places trades and never judges them.
"""

import csv
import math
from collections import defaultdict, deque

import numpy as np

# Accepted column names, lower-cased, in order of preference.
COLUMNS = {
    "date": ["date", "trade_date", "order_date", "timestamp", "time", "order_timestamp"],
    "symbol": ["symbol", "tradingsymbol", "trading_symbol", "scrip", "instrument", "name"],
    "side": ["side", "transaction_type", "trade_type", "type", "buy/sell", "action"],
    "quantity": ["quantity", "qty", "traded_qty", "filled_qty"],
    "price": ["price", "average_price", "trade_price", "avg_price", "rate"],
}


def pick(header):
    found = {}
    lower = {name.strip().lower(): name for name in header}
    for field, options in COLUMNS.items():
        for option in options:
            if option in lower:
                found[field] = lower[option]
                break
    missing = set(COLUMNS) - set(found)
    if missing:
        raise ValueError(f"the CSV is missing column(s) for: {', '.join(sorted(missing))}")
    return found


def read_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("the CSV has no header row")
        columns = pick(reader.fieldnames)
        rows = []
        for raw in reader:
            side = str(raw[columns["side"]]).strip().upper()
            try:
                quantity = abs(float(str(raw[columns["quantity"]]).replace(",", "")))
                price = float(str(raw[columns["price"]]).replace(",", ""))
            except (TypeError, ValueError):
                continue
            if not quantity or not price:
                continue
            rows.append({"date": str(raw[columns["date"]]).strip()[:10],
                         "symbol": str(raw[columns["symbol"]]).strip(),
                         "side": "BUY" if side.startswith("B") else "SELL",
                         "quantity": quantity, "price": price})
    rows.sort(key=lambda r: r["date"])
    return rows


def match_fifo(rows, cost=0.0):
    """Pair each sell with the oldest unsold buy. Returns closed trades and what is still open."""
    lots = defaultdict(deque)
    closed = []
    for row in rows:
        if row["side"] == "BUY":
            lots[row["symbol"]].append(dict(row))
            continue
        left = row["quantity"]
        while left > 1e-9 and lots[row["symbol"]]:
            lot = lots[row["symbol"]][0]
            take = min(left, lot["quantity"])
            gross = (row["price"] - lot["price"]) * take
            fees = cost * take * (row["price"] + lot["price"])
            closed.append({"symbol": row["symbol"], "quantity": take,
                           "buy_date": lot["date"], "buy_price": lot["price"],
                           "sell_date": row["date"], "sell_price": row["price"],
                           "pnl": gross - fees, "return": (row["price"] / lot["price"] - 1) - 2 * cost})
            lot["quantity"] -= take
            left -= take
            if lot["quantity"] <= 1e-9:
                lots[row["symbol"]].popleft()
    open_lots = [lot for symbol in lots for lot in lots[symbol]]
    return closed, open_lots


def stats(closed):
    if not closed:
        return {"trades": 0}
    returns = np.array([t["return"] for t in closed])
    pnl = np.array([t["pnl"] for t in closed])
    wins, losses = returns[returns > 0], returns[returns <= 0]
    holding = []
    for trade in closed:
        try:
            from datetime import date
            b = date.fromisoformat(trade["buy_date"]); s = date.fromisoformat(trade["sell_date"])
            holding.append((s - b).days)
        except ValueError:
            pass
    return {
        "trades": len(closed),
        "win_rate": float(np.mean(returns > 0)),
        "loss_rate": float(np.mean(returns <= 0)),
        "avg_win": float(wins.mean()) if wins.size else None,
        "avg_loss": float(losses.mean()) if losses.size else None,
        "avg_trade": float(returns.mean()),
        "best": float(returns.max()),
        "worst": float(returns.min()),
        "total_pnl": float(pnl.sum()),
        "profit_factor": float(pnl[pnl > 0].sum() / -pnl[pnl <= 0].sum()) if (pnl <= 0).any() and pnl[pnl <= 0].sum() < 0 else None,
        "median_days_held": float(np.median(holding)) if holding else None,
        "symbols": sorted({t["symbol"] for t in closed}),
    }


def coin_flip_p_value(trades, win_rate):
    """Chance of this many wins or more if each trade were a coin flip."""
    if not trades:
        return None
    wins = round(win_rate * trades)
    z = (wins - trades / 2) / math.sqrt(trades / 4)
    return 0.5 * math.erfc(z / math.sqrt(2))


def report(path, cost=0.0):
    rows = read_rows(path)
    closed, open_lots = match_fifo(rows, cost)
    summary = stats(closed)
    if summary["trades"]:
        summary["coin_flip_p_value"] = coin_flip_p_value(summary["trades"], summary["win_rate"])
    return {"rows": len(rows), "closed": closed, "open_lots": open_lots, "stats": summary}
