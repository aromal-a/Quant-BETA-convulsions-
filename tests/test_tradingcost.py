import math

from quant_beam import tradingcost

BOOK = {
    "bids": [["99", "1"], ["98", "10"]],
    "asks": [["101", "1"], ["102", "10"]],
}


def test_small_trade_pays_spread_and_fees_only():
    trip = tradingcost.round_trip(BOOK, 50, fee=0.001)
    assert math.isclose(trip["market"], (101 - 99) / 100)
    assert math.isclose(trip["total"], 0.02 + 0.002)
    assert math.isclose(trip["loss"], 50 * 0.022)


def test_big_trade_walks_the_book_and_costs_more():
    small = tradingcost.round_trip(BOOK, 50, fee=0.0)
    big = tradingcost.round_trip(BOOK, 500, fee=0.0)
    buy = 500 / (1 + (500 - 101) / 102)
    sell = 500 / (1 + (500 - 99) / 98)
    assert math.isclose(big["market"], (buy - sell) / 100)
    assert big["market"] > small["market"]


def test_too_thin_book_returns_none():
    assert tradingcost.round_trip(BOOK, 10_000) is None


def test_run_writes_report(tmp_path):
    out = tmp_path / "cost.json"
    report = tradingcost.run(out, reader=lambda s: BOOK, log=lambda _: None)
    assert out.exists() and set(report["pairs"]) == set(tradingcost.PAIRS)
    btc = report["pairs"]["BTCUSDT"]
    assert math.isclose(btc["mid"], 100) and btc["sizes"][0]["size"] == 100
    assert len(btc["curve"]["size"]) == len(btc["curve"]["total"])
