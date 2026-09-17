"""Trading signals built only from past data (no look-ahead).

z_t is today's natural-log return divided by the volatility of the previous
`window` days, so |z| = k means "a k-sigma move by the recent standard".
Purity is the quantum ground-state purity of the previous `purity_window`
days: high purity = calm, bell-curve-like market; low = fat-tailed.
"""

import numpy as np

from . import quantum

VOL_WINDOW = 60
PURITY_WINDOW = 120
PURITY_STEP = 5


def trailing_z(closes, window=VOL_WINDOW):
    """Return (z, sigma) arrays aligned with closes; NaN until enough history."""
    prices = np.asarray(closes, dtype=float)
    returns = np.full(prices.size, np.nan)
    returns[1:] = np.diff(np.log(prices))
    sigma = np.full(prices.size, np.nan)
    for t in range(window + 1, prices.size):
        sigma[t] = np.std(returns[t - window:t], ddof=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        z = returns / sigma
    return z, sigma


def trailing_purity(closes, window=PURITY_WINDOW, step=PURITY_STEP):
    """Ground-state purity of the previous `window` returns, refreshed every `step` days."""
    prices = np.asarray(closes, dtype=float)
    returns = np.diff(np.log(prices))
    purity = np.full(prices.size, np.nan)
    current = np.nan
    for t in range(window + 1, prices.size):
        if (t - window - 1) % step == 0:
            past = returns[t - 1 - window:t - 1]
            spread = np.std(past, ddof=1)
            if spread > 0:
                z = (past - past.mean()) / spread
                coefficients, _ = quantum.expand(quantum.kde_density(z))
                current = quantum.state_summary(coefficients)["ground_state_purity"]
        purity[t] = current
    return purity


class Rule:
    """One tradable idea: when to enter a long position, and how to exit it."""

    KINDS = {
        "dip_buy": "Buy after a fall of k sigma or more (bet on a bounce).",
        "momentum": "Buy after a rise of k sigma or more (bet it keeps going).",
        "calm_dip_buy": "Dip buy, but only while the market is in a calm, high-purity state.",
    }

    def __init__(self, kind, k, hold, stop, take=None, min_purity=0.97):
        if kind not in self.KINDS:
            raise ValueError(f"unknown rule kind {kind}")
        self.kind, self.k, self.hold, self.stop = kind, float(k), int(hold), float(stop)
        self.take = None if take is None else float(take)
        self.min_purity = float(min_purity)

    @property
    def needs_purity(self):
        return self.kind == "calm_dip_buy"

    def fires(self, z, purity=None):
        if z is None or np.isnan(z):
            return False
        if self.kind == "momentum":
            return z >= self.k
        if z > -self.k:
            return False
        if self.kind == "calm_dip_buy":
            return purity is not None and not np.isnan(purity) and purity >= self.min_purity
        return True

    def to_dict(self):
        return {"kind": self.kind, "k": self.k, "hold": self.hold, "stop": self.stop,
                "take": self.take, "min_purity": self.min_purity if self.needs_purity else None}

    @classmethod
    def from_dict(cls, data):
        return cls(data["kind"], data["k"], data["hold"], data["stop"], data.get("take"),
                   data.get("min_purity") or 0.97)

    def label(self):
        sign = "+" if self.kind == "momentum" else "−"
        extra = f", purity ≥ {self.min_purity:.2f}" if self.needs_purity else ""
        return f"{self.kind}: z ≤ {sign}{self.k:g}σ{extra}; hold {self.hold}d, stop {self.stop:g}σ".replace("≤ +", "≥ +")
