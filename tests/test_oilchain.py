import math

import numpy as np

from quant_beam import fundamentals, oilchain


def quarter(date, revenue, gross, operating, net=None):
    return {"date": date, "revenue": revenue, "gross": gross, "operating": operating, "net": net}


def test_margin_report_splits_leak_into_squeeze_and_cost_growth():
    quarters = [
        quarter("2025-06-30", 100.0, 40.0, 20.0),
        quarter("2025-09-30", 100.0, 40.0, 20.0),
        quarter("2026-06-30", 100.0, 38.0, 12.0),  # gross -2pp, operating -8pp -> 6pp of cost growth
    ]
    report = fundamentals.margin_report(quarters)
    assert report["compare_quarter"] == "2025-06-30"
    leak = report["leak"]
    assert math.isclose(leak["operating_margin_drop"], -0.08)
    assert math.isclose(leak["from_gross_squeeze"], -0.02)
    assert math.isclose(leak["from_cost_growth"], -0.06)
    assert leak["main_cause"] == "cost growth"


def test_no_leak_when_margin_holds_and_no_year_ago_quarter():
    steady = [quarter("2025-06-30", 100.0, 40.0, 20.0), quarter("2026-06-30", 120.0, 48.0, 24.0)]
    report = fundamentals.margin_report(steady)
    assert report["leak"] is None and math.isclose(report["revenue_growth"], 0.2)
    assert fundamentals.margin_report(steady[1:])["change"] is None


def test_parse_quarters_merges_fields_by_date():
    payload = {"timeseries": {"result": [
        {"meta": {"type": ["quarterlyTotalRevenue"]}, "quarterlyTotalRevenue": [
            {"asOfDate": "2026-06-30", "reportedValue": {"raw": 10.0}}, None]},
        {"meta": {"type": ["quarterlyOperatingIncome"]}, "quarterlyOperatingIncome": [
            {"asOfDate": "2026-06-30", "reportedValue": {"raw": 2.0}}]},
    ]}}
    assert fundamentals.parse_quarters(payload, "X") == [{"date": "2026-06-30", "revenue": 10.0, "operating": 2.0}]


def test_crack_spread_converts_gallons_to_barrels():
    spread = oilchain.crack_spread({"CL=F": [80.0], "RB=F": [2.5], "HO=F": [3.0]})
    assert math.isclose(spread[0], (2 * 105 + 126 - 240) / 3)


def test_oil_beta_recovers_known_sensitivity():
    rng = np.random.default_rng(4)
    oil_r = 0.02 * rng.standard_normal(400)
    stock_r = 0.5 * oil_r + 0.001 * rng.standard_normal(400)
    stamps = [86400 * i for i in range(401)]
    oil = (80 * np.exp(np.concatenate([[0], np.cumsum(oil_r)]))).tolist()
    stock = (50 * np.exp(np.concatenate([[0], np.cumsum(stock_r)]))).tolist()
    beta, corr = oilchain.oil_beta(stamps, stock, stamps, oil)
    assert abs(beta - 0.5) < 0.05 and corr > 0.95


def test_alignment_labels():
    assert oilchain.alignment(1.0, 1.0) == "aligned: strong"
    assert oilchain.alignment(-1.0, -1.0) == "aligned: weak"
    assert oilchain.alignment(1.0, -1.0) == "diverging: margins ahead of price"
    assert oilchain.alignment(-1.0, 1.0) == "diverging: price ahead of margins"
    assert oilchain.alignment(0.1, -0.1) == "neutral"


def test_ensemble_compares_margins_within_segment():
    def row(symbol, segment, margin):
        return {"symbol": symbol, "segment": segment,
                "margins": {"margins": {"operating": margin}, "change": {"operating": 0.0}, "revenue_growth": 0.1},
                "price": {"trend_6m": 0.0, "purity": 0.98, "tail_multiplier_3sigma": 4.0}}
    rows = [row("R1", "refiners", 0.05), row("R2", "refiners", 0.03), row("R3", "refiners", 0.04),
            row("P1", "pipelines", 0.40), row("P2", "pipelines", 0.30), row("P3", "pipelines", 0.35)]
    scored = {r["symbol"]: r["scores"]["parts"]["operating_margin_vs_segment"] for r in oilchain.ensemble(rows)}
    # the best refiner scores as well as the best pipeline despite a much lower raw margin
    assert math.isclose(scored["R1"], scored["P1"]) and scored["R1"] > 0 > scored["R2"]
