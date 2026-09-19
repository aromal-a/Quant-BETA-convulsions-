import math

import numpy as np

from quant_beam import fluctuations, losses, quantum
from quant_beam.fetch import parse_chart
from quant_beam.pipeline import run


def test_hermite_functions_are_orthonormal_and_ground_state_is_normal():
    phis = quantum.hermite_functions(quantum.GRID, 12)
    gram = np.array([[quantum.integrate(a * b) for b in phis] for a in phis])
    assert np.allclose(gram, np.eye(12), atol=1e-6)
    normal = np.exp(-quantum.GRID ** 2 / 2) / math.sqrt(2 * math.pi)
    assert np.allclose(phis[0] ** 2, normal, atol=1e-12)


def test_trapezoid_tail_matches_exact_normal_tail():
    normal = np.exp(-quantum.GRID ** 2 / 2) / math.sqrt(2 * math.pi)
    for k in (1, 2, 3):
        assert abs(quantum.tail_probability(normal, k) - fluctuations.normal_two_sided_tail(k)) < 1e-4


def test_normal_market_sits_in_ground_state():
    z = np.random.default_rng(1).standard_normal(20000)
    coefficients, _ = quantum.expand(quantum.kde_density(z))
    summary = quantum.state_summary(coefficients)
    assert summary["ground_state_purity"] > 0.98


def test_fat_tailed_market_is_excited_and_normal_curve_underestimates_crashes():
    z = np.random.default_rng(2).standard_t(3, 20000)
    z = (z - z.mean()) / z.std(ddof=1)
    empirical = quantum.kde_density(z)
    coefficients, phis = quantum.expand(empirical)
    summary = quantum.state_summary(coefficients)
    assert summary["ground_state_purity"] < 0.97
    rows = fluctuations.cold_probability_errors(z, fluctuations.normal_two_sided_tail)
    three_sigma = next(r for r in rows if r["sigma"] == 3)
    assert three_sigma["multiplier"] > 1.5

    normal = np.exp(-quantum.GRID ** 2 / 2) / math.sqrt(2 * math.pi)
    reconstructed = quantum.reconstruct(coefficients, phis)
    assert losses.kl_divergence(empirical, reconstructed) < losses.kl_divergence(empirical, normal)


def test_parse_chart_drops_missing_prices():
    payload = {"chart": {"result": [{
        "timestamp": list(range(40)),
        "indicators": {"quote": [{"close": [None if i == 5 else 100.0 + i for i in range(40)]}]},
    }]}}
    stamps, closes = parse_chart(payload, "X")
    assert len(stamps) == len(closes) == 39


def test_pipeline_end_to_end_with_fake_reader(tmp_path):
    rng = np.random.default_rng(3)

    def reader(symbol):
        prices = 100 * np.exp(np.cumsum(0.01 * rng.standard_normal(400)))
        return list(range(400)), prices.tolist()

    out = tmp_path / "data.json"
    result = run(out, reader=reader, log=lambda _: None)
    assert out.exists()
    assert {"IN", "US"} <= set(result["countries"])
    btc = result["crypto"]["markets"][0]
    assert btc["symbol"] == "BTC-USD"
    assert len(btc["curves"]["z"]) == len(btc["curves"]["quantum"])
    assert "peg" in result["crypto"]["markets"][-1]


def test_boot_bulletin_reads_saved_data():
    from quant_beam.boot import bulletin
    text = bulletin()
    assert "Quant-beam" in text and "Paper wallets" in text
