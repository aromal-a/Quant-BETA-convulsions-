import math

import pytest

from quant_beam import ledger, upstox

SNAPSHOT = {
    "funds": {"data": {"equity": {"available_margin": 25000.0}}},
    "holdings": {"data": [
        {"tradingsymbol": "RELIANCE", "quantity": 10, "average_price": 1200.0, "last_price": 1250.0},
        {"tradingsymbol": "INFY", "quantity": 5, "average_price": 1500.0, "last_price": 1400.0},
    ]},
    "positions": {"data": [{"tradingsymbol": "NIFTY-FUT", "quantity": 1, "pnl": -250.0}]},
    "trades_today": {"error": "market closed"},
}


def test_summarise_totals_and_errors():
    out = upstox.summarise(SNAPSHOT)
    assert out["cash"] == 25000.0
    assert math.isclose(out["holdings_value"], 10 * 1250 + 5 * 1400)
    assert math.isclose(out["holdings_pnl"], 10 * 50 + 5 * -100)
    assert math.isclose(out["holdings"][0]["return"], 1250 / 1200 - 1)
    assert out["positions_pnl"] == -250.0
    assert "trades_today" in out["errors"]


def test_snapshot_records_each_section_error():
    def angry(path):
        raise upstox.UpstoxError("HTTP 401")
    snap = upstox.snapshot(angry)
    assert set(snap) == set(upstox.ENDPOINTS)
    assert all("error" in section for section in snap.values())


def test_module_contains_no_order_endpoints():
    source = open(upstox.__file__).read().lower()
    for forbidden in ("place-order", "cancel-order", "modify-order", "urlopen(request, data"):
        assert forbidden not in source
    assert '"post"' not in source and "method=" not in source


def write_csv(tmp_path, rows, header="date,symbol,side,quantity,price"):
    path = tmp_path / "trades.csv"
    path.write_text(header + "\n" + "\n".join(rows))
    return path


def test_fifo_matching_and_stats(tmp_path):
    path = write_csv(tmp_path, [
        "2026-01-05,RELIANCE,BUY,10,1000",
        "2026-01-09,RELIANCE,BUY,10,1100",
        "2026-01-20,RELIANCE,SELL,15,1200",   # closes the 10 @1000 and 5 @1100
        "2026-02-02,INFY,BUY,5,1500",
        "2026-02-10,INFY,SELL,5,1400",        # a loss
    ])
    result = ledger.report(path)
    closed, stats = result["closed"], result["stats"]
    assert [round(t["return"], 4) for t in closed] == [0.2, round(1200 / 1100 - 1, 4), round(1400 / 1500 - 1, 4)]
    assert stats["trades"] == 3 and math.isclose(stats["win_rate"], 2 / 3)
    assert math.isclose(stats["total_pnl"], 10 * 200 + 5 * 100 + 5 * -100)
    assert result["open_lots"][0]["quantity"] == 5  # 5 of the second RELIANCE lot remain
    assert stats["median_days_held"] == 11  # 15, 11 and 8 days


def test_costs_reduce_every_trade(tmp_path):
    path = write_csv(tmp_path, ["2026-01-05,X,BUY,1,100", "2026-01-06,X,SELL,1,110"])
    free = ledger.report(path)["closed"][0]["return"]
    charged = ledger.report(path, cost=0.001)["closed"][0]["return"]
    assert math.isclose(free - charged, 0.002)


def test_broker_column_names_are_accepted(tmp_path):
    path = write_csv(tmp_path, ["2026-01-05,X,B,1,100", "2026-01-06,X,S,1,110"],
                     header="trade_date,tradingsymbol,transaction_type,qty,average_price")
    assert ledger.report(path)["stats"]["trades"] == 1


def test_missing_columns_explain_what_is_needed(tmp_path):
    path = write_csv(tmp_path, ["2026-01-05,X"], header="date,symbol")
    with pytest.raises(ValueError, match="price"):
        ledger.report(path)


def test_coin_flip_p_value():
    assert ledger.coin_flip_p_value(100, 0.5) == pytest.approx(0.5, abs=0.01)
    assert ledger.coin_flip_p_value(100, 0.7) < 0.001
