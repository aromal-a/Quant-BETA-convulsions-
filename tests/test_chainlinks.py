import json
import math

from quant_beam import chainlinks

DAY = 86400
START = 1_750_000_000 // DAY * DAY


def candle(i, o, c, v=100.0):
    return {"t": START + i * DAY, "o": o, "h": max(o, c) + 1, "l": min(o, c) - 1, "c": c, "v": v}


def flat(n=80, price=100.0, volume=100.0):
    return [candle(i, price, price, volume) for i in range(n)]


def test_sell_block_needs_a_down_candle_and_heavy_volume():
    bars = flat()
    bars[-1] = candle(79, 100.0, 97.0, 300.0)   # down on 3x volume  -> sell block
    bars[-2] = candle(78, 100.0, 103.0, 300.0)  # up on 3x volume    -> not a sell block
    bars[-3] = candle(77, 100.0, 97.0, 120.0)   # down on 1.2x       -> not a sell block
    flags = chainlinks.sell_block_flags(bars)
    assert flags[-1] is True and flags[-2] is False and flags[-3] is False
    assert math.isclose(chainlinks.relative_volumes(bars)[-3], 1.2)


def test_median_candle_is_the_median_across_rebased_links():
    a = [candle(i, 10.0, 10.0, 50.0) for i in range(80)]
    b = [candle(i, 200.0, 200.0, 9000.0) for i in range(80)]
    c = [candle(i, 3.0, 3.0, 7.0) for i in range(80)]
    a[-1] = candle(79, 10.0, 11.0, 100.0)     # +10% on 2x volume
    b[-1] = candle(79, 200.0, 204.0, 9000.0)  # +2%  on 1x volume
    c[-1] = candle(79, 3.0, 2.85, 21.0)       # -5%  on 3x volume: a sell block
    merged = chainlinks.median_candles({"A": a, "B": b, "C": c})
    last = merged[-1]
    assert math.isclose(last["c"], 102.0) and math.isclose(last["o"], 100.0)
    assert math.isclose(last["volume"], 2.0)
    assert last["links"] == 3 and last["sell_links"] == 1
    assert last["h"] >= max(last["o"], last["c"]) and last["l"] <= min(last["o"], last["c"])


def test_median_hit_is_pending_only_when_the_newest_bar_crosses():
    closes = [100.0 - 0.1 * i for i in range(40)]   # drifting down, always below its median
    bars = [{"date": f"d{i}", "o": c, "h": c, "l": c, "c": c} for i, c in enumerate(closes)]
    assert chainlinks.median_hits(bars)["pending"] is None
    bars.append({"date": "cross", "o": 96.0, "h": 110.0, "l": 96.0, "c": 110.0})
    pending = chainlinks.median_hits(bars)["pending"]
    assert pending["direction"] == "from_below" and pending["date"] == "cross"
    assert pending["p_up"] is None  # too few past hits to quote a probability


def test_follow_through_rate_counts_past_hits():
    closes = []
    for _ in range(14):                      # 14 identical waves: dip below, cross up, keep rising
        closes += [100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
                   100, 100, 100, 100, 100, 100, 100, 100, 100, 99,
                   101, 102, 103, 104, 105, 106]
    bars = [{"date": str(i), "o": c, "h": c, "l": c, "c": float(c)} for i, c in enumerate(closes)]
    stats = chainlinks.median_hits(bars, window=20, horizon=5)["stats"]["from_below"]
    assert stats["count"] >= 10 and stats["up"] == stats["count"] and stats["p_up"] == 1.0


def test_perforation_weights_and_missing_parts():
    full = chainlinks.perforation(0.5, 0.25, 0.71)
    assert math.isclose(full["score"], 0.5 * 0.5 + 0.3 * 0.25 + 0.2 * 0.71)
    assert full["label"] == "partly perforated"
    no_margins = chainlinks.perforation(0.5, None, 1.0)
    assert math.isclose(no_margins["score"], (0.5 * 0.5 + 0.2 * 1.0) / 0.7)
    assert chainlinks.perforation(None, None, None)["label"] == "unknown"
    assert chainlinks.perforation(0.0, 0.0, 0.0)["label"] == "holding"


def test_markets_joined_is_one_for_identical_moves_and_clipped_at_zero():
    wave = [100.0 + 5 * math.sin(i / 3) for i in range(81)]
    up = [candle(i, wave[i], wave[i + 1]) for i in range(80)]
    mirror = [candle(i, 200.0 - wave[i], 200.0 - wave[i + 1]) for i in range(80)]
    assert math.isclose(chainlinks.markets_joined({"A": up, "B": up}), 1.0)
    assert chainlinks.markets_joined({"A": up, "B": mirror}) == 0.0


def test_run_writes_a_report_and_skips_links_that_fail(tmp_path):
    heavy = flat()
    heavy[-1] = candle(79, 100.0, 96.0, 400.0)

    def reader(symbol):
        if symbol == "BAD":
            raise chainlinks.FetchError("BAD: nothing")
        return heavy if symbol == "X" else flat()

    chains = {"demo": {"name": "Demo", "links": {"X": ("Ex", "US"), "Y": ("Why", "IN"), "BAD": ("Bad", "JP")}}}
    out = tmp_path / "chain_links.json"
    chainlinks.run(out, chains=chains, candle_reader=reader, leak_reader=lambda s: s == "X", log=lambda m: None)
    chain = json.loads(out.read_text())["chains"]["demo"]
    assert chain["link_count"] == 2 and chain["sell_links"] == 1
    assert math.isclose(chain["median_volume"], 2.5)
    assert chain["perforation"]["parts"]["sell_volume"] == 0.5
    assert chain["perforation"]["parts"]["margin_leaks"] == 0.5
    assert all(candle["links"] == 2 for candle in chain["candles"])


def test_every_oil_segment_is_also_a_chain():
    chains = chainlinks.all_chains()
    assert "mcdonalds" in chains and "refiners" in chains
    assert "MPC" in chains["refiners"]["links"]
