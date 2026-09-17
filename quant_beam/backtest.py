"""Paper backtest of one rule on one market, using daily closes.

Realism choices (all make results *worse*, on purpose):
* a signal seen at today's close is filled at the NEXT day's close,
* stop-loss is only checked on closes, so losses can overshoot the stop,
* every entry and exit pays a cost (fees + slippage).
"""

import math

import numpy as np

COST = {"stock": 0.001, "crypto": 0.002}  # per side, as a fraction of price


def simulate(closes, z, sigma, rule, cost, start=0, end=None, purity=None):
    """Run `rule` over bars [start, end). Returns a list of closed trades."""
    prices = np.asarray(closes, dtype=float)
    end = prices.size if end is None else end
    trades = []
    t = max(start, 1)
    while t < end - 1:
        p = None if purity is None else purity[t]
        if not rule.fires(z[t], p) or np.isnan(sigma[t]):
            t += 1
            continue
        entry_i = t + 1
        entry = prices[entry_i]
        risk = sigma[t]
        exit_i, reason = None, "time"
        for j in range(entry_i + 1, min(entry_i + rule.hold, end - 1) + 1):
            move = math.log(prices[j] / entry)
            if move <= -rule.stop * risk:
                exit_i, reason = j, "stop"
                break
            if rule.take is not None and move >= rule.take * risk:
                exit_i, reason = j, "take"
                break
        if exit_i is None:
            exit_i = min(entry_i + rule.hold, end - 1)
            if exit_i == entry_i:
                break
        gross = math.log(prices[exit_i] / entry)
        net = gross + 2 * math.log(1 - cost)
        trades.append({"signal": t, "entry": entry_i, "exit": exit_i, "reason": reason,
                       "gross": gross, "net": net})
        t = exit_i + 1
    return trades


def baseline_win_rate(closes, hold, cost, start, end):
    """Win rate of entering on EVERY day and holding `hold` days (the no-skill bar)."""
    prices = np.asarray(closes[start:end], dtype=float)
    if prices.size <= hold + 1:
        return None
    moves = np.log(prices[hold:] / prices[:-hold]) + 2 * math.log(1 - cost)
    return float(np.mean(moves > 0))


def metrics(trades):
    if not trades:
        return {"trades": 0, "win_rate": None, "avg_win": None, "avg_loss": None,
                "expectancy": None, "profit_factor": None, "total_log_return": 0.0,
                "max_drawdown": 0.0, "stops": 0, "t_stat": None, "p_value": None}
    net = np.array([t["net"] for t in trades])
    wins, losses = net[net > 0], net[net <= 0]
    equity = np.concatenate([[0.0], np.cumsum(net)])
    drawdown = float(np.max(np.maximum.accumulate(equity) - equity))
    return {
        "trades": int(net.size),
        "win_rate": float(np.mean(net > 0)),
        "avg_win": float(wins.mean()) if wins.size else None,
        "avg_loss": float(losses.mean()) if losses.size else None,
        "expectancy": float(net.mean()),
        "profit_factor": float(wins.sum() / -losses.sum()) if losses.size and losses.sum() < 0 else None,
        "total_log_return": float(net.sum()),
        "max_drawdown": drawdown,
        "stops": int(sum(t["reason"] == "stop" for t in trades)),
        **significance(net),
    }


def significance(net):
    """t-statistic of the mean trade and a one-sided p-value (normal approximation).

    p = chance of seeing an average this good if the rule had no real edge.
    Many settings were tried, so treat p above ~0.01 as weak evidence.
    """
    if net.size < 2 or np.std(net, ddof=1) == 0:
        return {"t_stat": None, "p_value": None}
    t_stat = float(net.mean() / (np.std(net, ddof=1) / math.sqrt(net.size)))
    return {"t_stat": t_stat, "p_value": 0.5 * math.erfc(t_stat / math.sqrt(2))}
