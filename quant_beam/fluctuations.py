"""Normal-fluctuation analysis: log returns, the fitted normal curve, and the
"cold-probability error" -- how far the normal curve misjudges big moves."""

import math

import numpy as np

SIGMA_LEVELS = (1, 2, 3, 4)


def log_returns(closes):
    prices = np.asarray(closes, dtype=float)
    return np.diff(np.log(prices))


def normal_two_sided_tail(k):
    """P(|Z| > k) for a standard normal, exact."""
    return math.erfc(k / math.sqrt(2))


def fit_normal(returns):
    mu = float(np.mean(returns))
    sigma = float(np.std(returns, ddof=1))
    if not sigma > 0:
        raise ValueError("returns have zero spread")
    return mu, sigma


def moments(z):
    return {
        "skew": float(np.mean(z ** 3)),
        "excess_kurtosis": float(np.mean(z ** 4) - 3.0),
    }


def rolling_volatility(returns, window=20):
    r = np.asarray(returns, dtype=float)
    if len(r) < window:
        return []
    windows = np.lib.stride_tricks.sliding_window_view(r, window)
    return np.std(windows, axis=1, ddof=1).tolist()


def cold_probability_errors(z, integrate_tail):
    """Compare observed tail frequencies with model tail probabilities.

    `integrate_tail(k)` returns a model's P(|Z| > k); the error is observed
    minus predicted, and the multiplier is observed / predicted.
    """
    rows = []
    for k in SIGMA_LEVELS:
        observed = float(np.mean(np.abs(z) > k))
        predicted = float(integrate_tail(k))
        rows.append({
            "sigma": k,
            "observed": observed,
            "predicted": predicted,
            "error": observed - predicted,
            "multiplier": observed / predicted if predicted > 0 else None,
        })
    return rows


def analyse(closes, periods_per_year):
    returns = log_returns(closes)
    mu, sigma = fit_normal(returns)
    z = (returns - mu) / sigma
    vol = rolling_volatility(returns)
    return {
        "returns": returns,
        "z": z,
        "mu": mu,
        "sigma": sigma,
        "annual_volatility": sigma * math.sqrt(periods_per_year),
        "last_return": float(returns[-1]),
        "last_z": float(z[-1]),
        "band_share": {
            str(k): float(np.mean(np.abs(z) <= k)) for k in SIGMA_LEVELS
        },
        "rolling_volatility_20": vol,
        **moments(z),
    }
