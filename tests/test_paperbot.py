import json
import math

import numpy as np

from quant_beam import backtest, paperbot, signals


def spike_prices(n=200, spike_at=150, jump=0.15, drift=0.0):
    rng = np.random.default_rng(7)
    r = 0.01 * rng.standard_normal(n) + drift
    r[spike_at] = jump
    return (100 * np.exp(np.cumsum(r))).tolist()


def test_signal_fills_next_close_and_time_exit():
    closes = spike_prices()
    z, sigma = signals.trailing_z(closes)
    rule = signals.Rule("momentum", k=3, hold=5, stop=50)
    trades = backtest.simulate(closes, z, sigma, rule, cost=0.0)
    first = trades[0]
    assert first["signal"] == 150 and first["entry"] == 151 and first["exit"] == 156
    assert math.isclose(first["gross"], math.log(closes[156] / closes[151]))


def test_stop_loss_exits_early_and_costs_reduce_return():
    closes = spike_prices()
    closes[153] = closes[151] * 0.5
    z, sigma = signals.trailing_z(closes)
    rule = signals.Rule("momentum", k=3, hold=10, stop=1.5)
    trade = backtest.simulate(closes, z, sigma, rule, cost=0.001)[0]
    assert trade["reason"] == "stop" and trade["exit"] == 153
    assert trade["net"] < trade["gross"]


def test_trailing_z_ignores_the_future():
    closes = spike_prices()
    z1, _ = signals.trailing_z(closes)
    changed = closes[:120] + [c * 3 for c in closes[120:]]
    z2, _ = signals.trailing_z(changed)
    assert np.allclose(z1[:120], z2[:120], equal_nan=True)


def test_metrics():
    stats = backtest.metrics([{"net": 0.02, "reason": "time"}, {"net": -0.01, "reason": "stop"}])
    assert stats["trades"] == 2 and stats["win_rate"] == 0.5
    assert math.isclose(stats["expectancy"], 0.005) and math.isclose(stats["max_drawdown"], 0.01)


def write_research(path, group="US"):
    rule = signals.Rule("momentum", k=3, hold=3, stop=50).to_dict()
    path.write_text(json.dumps({"groups": {group: {"rules": [{"rule": rule, "passed": True}]}}}))


def test_paper_bot_enters_exits_cancels_and_halts(tmp_path):
    research, wallet = tmp_path / "research.json", tmp_path / "wallet.json"
    write_research(research)
    closes = spike_prices(n=200, spike_at=190)
    stamps = [86400 * i for i in range(200)]
    upto = {"n": 185}

    def reader(symbol):
        n = upto["n"]
        return stamps[:n], closes[:n]

    quiet = lambda _: None
    state = paperbot.run(wallet, research, reader=reader, log=quiet, today="2100-01-01")
    assert state["positions"] == [] and set(state["last_seen"].values()) == {stamps[184]}

    upto["n"] = 192  # spike at 190 -> signal, filled at 191
    state = paperbot.run(wallet, research, reader=reader, log=quiet, today="2100-01-01")
    held = [p["symbol"] for p in state["positions"]]
    assert held and all(s in dict((u[0], u[1]) for u in paperbot.universe() if u[1] == "US") for s in held)
    assert state["wallets"]["USD"]["cash"] < paperbot.START_CASH["USD"]

    upto["n"] = 196  # held 3+ bars -> time exit
    state = paperbot.run(wallet, research, reader=reader, log=quiet, today="2100-01-01")
    us_trades = [t for t in state["trades"] if t["group"] == "US"]
    assert us_trades and all(t["reason"] == "time" for t in us_trades)

    upto["n"] = 200
    state = paperbot.cancel(wallet, reader=reader, log=quiet)
    assert state["halted"] and state["positions"] == [] and state["pending"] == []
    state = paperbot.resume(wallet, log=quiet)
    assert not state["halted"]


def test_guard_halts_on_drawdown():
    state = paperbot.new_state()
    state["positions"].append({"symbol": "AAPL", "group": "US", "currency": "USD", "rule": {}, "entry_date": "x",
                               "entry_price": 100.0, "qty": 50.0, "invested": 5000.0, "risk_sigma": 0.01, "bars_held": 0})
    state["wallets"]["USD"]["cash"] = 5000.0
    state["last_price"]["AAPL"] = 70.0  # wallet 8,500 vs peak 10,000 -> 15% drawdown
    paperbot.guard(state, lambda _: None)
    assert state["halted"] and state["positions"] == []


def test_bot_ignores_todays_unfinished_bar():
    stamps = [0, 86400, 2 * 86400]
    kept, closes = paperbot.completed_days(stamps, [1.0, 2.0, 3.0], paperbot.day(2 * 86400))
    assert kept == [0, 86400] and closes == [1.0, 2.0]
