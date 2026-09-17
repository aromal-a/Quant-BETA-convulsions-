"""Loss functions that score how well each curve explains the real returns.

Lower is better for every loss. "normal" is the fitted bell curve,
"quantum" is the oscillator-state reconstruction.
"""

import numpy as np

from .quantum import GRID, integrate

FLOOR = 1e-12


def density_at(density, z, grid=GRID):
    return np.maximum(np.interp(z, grid, density, left=0.0, right=0.0), FLOOR)


def negative_log_likelihood(density, z):
    """Average -log p(z) over the observed standardized returns."""
    return float(-np.mean(np.log(density_at(density, z))))


def kl_divergence(empirical, model):
    """KL(empirical || model), integrated over the grid."""
    p = np.maximum(empirical, FLOOR)
    q = np.maximum(model, FLOOR)
    return integrate(p * np.log(p / q))


def tail_loss(error_rows):
    """Mean squared cold-probability error across the sigma levels."""
    return float(np.mean([row["error"] ** 2 for row in error_rows]))


def score(empirical, model, z, error_rows):
    return {
        "negative_log_likelihood": negative_log_likelihood(model, z),
        "kl_divergence": kl_divergence(empirical, model),
        "tail_loss": tail_loss(error_rows),
    }
