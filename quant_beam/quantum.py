"""Quantum-state view of market fluctuations.

The standardized return distribution p(z) is treated as |psi(z)|^2 and the
amplitude psi = sqrt(p) is expanded in quantum harmonic oscillator
eigenstates phi_n. The oscillator is scaled so that |phi_0|^2 is exactly the
standard normal curve, so:

* population of state 0  -> how "normal" the market is,
* odd states             -> lopsided (skewed) moves,
* higher even states     -> fat tails and calm-then-crash behaviour.

This is a descriptive lens on past data, not a prediction.
"""

import math

import numpy as np

GRID = np.linspace(-12.0, 12.0, 2401)
DZ = float(GRID[1] - GRID[0])
N_STATES = 16


def hermite_functions(x, n_states=N_STATES):
    """phi_n(x) with integral phi_n^2 dx = 1 and phi_0^2 = N(0, 1)."""
    y = np.asarray(x, dtype=float) / math.sqrt(2.0)
    h = np.zeros((n_states, y.size))
    h[0] = math.pi ** -0.25 * np.exp(-y * y / 2.0)
    if n_states > 1:
        h[1] = math.sqrt(2.0) * y * h[0]
    for n in range(2, n_states):
        h[n] = math.sqrt(2.0 / n) * y * h[n - 1] - math.sqrt((n - 1) / n) * h[n - 2]
    return h * 2.0 ** -0.25


def integrate(values, dx=DZ):
    """Trapezoid-rule curve integration on the uniform grid."""
    v = np.asarray(values, dtype=float)
    return float(dx * (v.sum() - 0.5 * (v[..., 0] + v[..., -1])))


def kde_density(z, grid=GRID):
    """Gaussian kernel density of z with Silverman's bandwidth, normalized."""
    z = np.asarray(z, dtype=float)
    spread = min(np.std(z, ddof=1), (np.percentile(z, 75) - np.percentile(z, 25)) / 1.34)
    bandwidth = 0.9 * spread * len(z) ** -0.2
    diffs = (grid[:, None] - z[None, :]) / bandwidth
    density = np.exp(-0.5 * diffs ** 2).sum(axis=1)
    density /= integrate(density)
    return density


def expand(density, n_states=N_STATES, grid=GRID):
    phis = hermite_functions(grid, n_states)
    amplitude = np.sqrt(np.clip(density, 0.0, None))
    coefficients = np.array([integrate(amplitude * phi) for phi in phis])
    return coefficients, phis


def reconstruct(coefficients, phis):
    psi = coefficients @ phis
    density = psi ** 2
    return density / integrate(density)


def tail_probability(density, k, grid=GRID):
    """P(|Z| > k) by integrating a density curve outside [-k, k]."""
    inside = np.abs(grid) <= k + 1e-9
    return max(0.0, integrate(density) - integrate(density[inside]))


def state_summary(coefficients):
    populations = coefficients ** 2
    captured = float(populations.sum())
    populations = populations / captured
    levels = np.arange(len(populations))
    return {
        "coefficients": coefficients.tolist(),
        "populations": populations.tolist(),
        "captured_norm": captured,
        "ground_state_purity": float(populations[0]),
        "mean_energy": float(np.sum(populations * (levels + 0.5))),
        "odd_share": float(populations[1::2].sum()),
        "excited_even_share": float(populations[2::2].sum()),
    }
