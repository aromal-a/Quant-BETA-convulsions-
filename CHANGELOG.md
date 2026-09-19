# Changelog

Every change made to this repo by Claude (on behalf of aromal-a), newest first.
Original files — `WALLSTREET.k`, `Convoluted.net`, `StatSelections.c`, `øphi.html`,
`CODE_OF_CONDUCT.md` and the original README notes — have **never been changed**.

Everything here is analysis and **pretend-money** paper trading. Nothing connects to a
broker, bank, UPI or wallet, and nothing places real orders.

## 0.6.0 — 2026-09-19 · Lithium & battery chain
- New segments: lithium miners (Albemarle, SQM, Sigma Lithium, Ganfeng) and battery makers (CATL,
  LG Energy Solution, Samsung SDI, Amara Raja, Exide). BYD is added to car makers.
- Lithium beta: each company's sensitivity to the lithium & battery ETF (LIT), next to oil beta.
- Lithium Americas is listed but skipped, because it has no revenue yet.

## 0.5.1 — 2026-09-19 · Raw price history no longer published
- The public data files no longer include raw daily price series, because Yahoo Finance's terms allow
  personal use only. The page's price chart is replaced by the 20-day volatility chart. Derived results
  (volatility, margins, quantum states, test results) and each market's latest price remain.
- Older commits in the git history still contain the earlier price files.

## 0.5.0 — 2026-09-19 · Setup, boot bulletin, oil chain in research
- **One-step setup:** `./setup.sh` creates `.venv`, installs Quant-beam, runs the tests and shows the
  bulletin. `pyproject.toml` makes it installable with `pip install -e .` and adds the
  `quant-beam` command.
- **Boot bulletin:** `quant-beam boot` prints a bold one-screen summary of the saved data
  (wallets, closest signal, rules that passed, oil chain, trading cost). It's instant and works offline.
- **Oil chain research:** the US oil chain (producers, rigs, majors, refiners, transport; no car makers
  or pipelines) is tested like the other groups. Result: no rule passed.
- **Stricter test:** a rule must now also beat the *average return* of holding just as long from
  random start days, not only the random win rate.
- **Market time:** bot dates are recorded in each market's own time zone (US and oil chain in New York
  time, India in India time, crypto in UTC).
- **Paper bot:** trades the oil chain too, if a rule ever passes. The USD wallet is now split 24 ways.
- This changelog.

## 0.4.0 — 2026-09-19 · Dot map, trading cost, radar switch
- Dot map of the oil chain on the web page (margin score vs price score).
- Trading cost slice: round-trip loss on the live Binance order book (`quant-beam cost`), with a
  box on the page for your own trade size.
- `bot radar on/off` to show or hide the signal radar.

## 0.3.0 — 2026-09-19 · Oil & transport value chain, money split
- `quant-beam oil`: margins, margin leaks, oil beta, 3-2-1 crack spread and an ensemble score for
  35 companies (US, India, UK, Japan).
- Paper bot: shows how each wallet's money is split, a signal radar, and `bot cancel-signals`.

## 0.2.0 — 2026-09-17 · Paper QuantBot and research
- 10-year research: dip-buy, momentum and calm dip-buy rules. Settings are picked on the older 60% of
  history and tested on the newer 40%, after costs.
- Paper bot with pretend wallets (₹10,00,000 and $10,000), stop-losses, a 10% drawdown guard and a
  watch console (Enter / c / Esc / r / q).
- Optional Alpha Vantage backup price source, read only from an environment secret.

## 0.1.0 — 2026-09-17 · Quant-beam
- Normal-fluctuation analysis, cold-probability error, quantum-state (harmonic-oscillator) expansion,
  loss functions and curve integration for India, US and crypto markets.
- Pulsing web page in `docs/`.
- README rewritten in English, with the original notes kept unchanged at the bottom.

## Not yet on GitHub
- `.github/workflows/quant-beam.yml` (automatic runs every 3 hours plus weekly research) is ready but
  waiting: GitHub needs the `workflow` permission (`gh auth refresh -h github.com -s workflow`).
- The existing `C/C++ CI` workflow (added before Quant-beam) fails on every push, because there is no C
  project to build. It has been left untouched.
