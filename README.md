# ø Quant-beam

**Quantum-state analysis of market fluctuations, end to end.**

Quant-beam re-reads market prices on a schedule, measures their normal fluctuations,
works out the *cold-probability error* (how badly the normal bell curve misjudges big
moves), describes the returns as quantum harmonic-oscillator states, scores every model
with loss functions, and shows it all on a pulsing web page. A **paper QuantBot** then
tests which fluctuations were worth trading and trades them with pretend money.

> This is an analysis and learning tool. It describes past price behaviour. It is **not
> financial advice** and it does **not** predict prices.

---

## What it covers

| Group | Markets | Currency |
|---|---|---|
| **India** (local country) | NIFTY 50, SENSEX, Reliance, TCS, Infosys | INR |
| **United States** (big indexes) | S&P 500, Nasdaq Composite, Apple, NVIDIA, Tesla | USD |
| **Crypto** (kept separate) | Bitcoin, Ethereum, Solana, Tether (USDT) | USD |

The web page opens on **your own country** (detected from your time zone, and you can switch).
Your choice is remembered. Crypto always has its own section, and Tether is tracked against
its 1.00 USD peg.

To add a country or symbol, edit [`quant_beam/markets.py`](quant_beam/markets.py).

---

## How it works (end to end)

```
 Yahoo Finance ──► fetch.py ──► fluctuations.py ──► quantum.py ──► losses.py ──► pipeline.py ──► docs/data/quant_beam.json ──► docs/index.html
  (re-read)        daily       returns, normal     oscillator      NLL, KL,       groups by        (written by the server job)        (pulsing page)
                   closes      fit, tail errors    states          tail loss      country/crypto
```

All of the maths runs **server-side** in GitHub Actions
([`.github/workflows/quant-beam.yml`](.github/workflows/quant-beam.yml)) every 3 hours. The job runs the tests,
re-reads every market, and commits the new data file. The web page is static and just
draws what the server produced. If a market can't be re-read, its previous result is kept
and marked **stale**.

### 1. Normal fluctuations — `fluctuations.py`
- Daily log returns: `r_t = ln(P_t / P_{t-1})`
- Fit a normal curve with mean μ and standard deviation σ, then standardize: `z = (r − μ) / σ`
- Yearly volatility `σ·√252` for stocks (`√365` for crypto), plus 20-day rolling volatility
- Share of days inside ±1σ, ±2σ, ±3σ, ±4σ, plus skew and excess kurtosis

### 2. Cold-probability error
For each move size k = 1…4σ:

```
error(k)      = P_observed(|z| > k) − P_model(|z| > k)
multiplier(k) = P_observed(|z| > k) / P_model(|z| > k)
```

A 3σ multiplier of ×4.5 means moves that big happened 4.5 times more often than the normal
curve said they would.

### 3. Quantum states — `quantum.py`
The standardized return curve p(z) is treated as a quantum probability |ψ(z)|². The amplitude
ψ = √p is expanded in harmonic-oscillator eigenstates φₙ (Hermite functions):

```
ψ(z) ≈ Σ cₙ φₙ(z),   cₙ = ∫ ψ(z) φₙ(z) dz,   n = 0 … 15
```

The oscillator is scaled so that **|φ₀|² is exactly the normal curve**. That gives a
physical reading of the market:

| Quantity | Meaning |
|---|---|
| **Ground-state purity** `|c₀|²` | How normal the market is (100% = a perfect bell curve) |
| **Odd states** (n = 1, 3, 5 …) | Lopsided moves (skew) |
| **Higher even states** (n = 2, 4 …) | Fat tails: calm periods broken by sudden big moves |
| **Mean energy** `Σ |cₙ|² (n + ½)` | Overall excitation; 0.5 = perfectly normal |

The empirical curve comes from a Gaussian kernel density estimate. The **pulsating beam** on
the page is this superposition evolving in time, `ψ(z,t) = Σ cₙ φₙ(z) e^{−i(n+½)t}`.

### 4. Curve integration
Tail probabilities are computed by **trapezoid-rule integration** of each density curve on a
fine grid (z from −12 to 12, step 0.01). The integrator is tested against the exact normal tail
`erfc(k/√2)` to within 10⁻⁴.

### 5. Loss functions — `losses.py`
Each curve (normal vs quantum) is scored. Lower is better.

| Loss | Formula |
|---|---|
| Negative log-likelihood | `−mean(ln p(zᵢ))` |
| KL divergence | `∫ p_emp ln(p_emp / p_model) dz` |
| Tail loss | mean of `error(k)²` over k = 1…4 |

The normal curve's NLL is almost the same for every market (≈ 1.418), because returns are
standardized first. The losses are **in-sample**: the quantum curve is fitted to the same data it
is scored on, so it naturally fits better. Read the losses as "how non-normal was the past",
not as forecasting skill.

---

## Quick start (anyone who clones this repo)

```bash
git clone https://github.com/aromal-a/Quant-BETA-convulsions-.git
```

```bash
cd Quant-BETA-convulsions- && ./setup.sh
```

`setup.sh` needs Python 3.9 or newer. It creates `.venv`, installs everything, runs the tests and
shows the boot bulletin. After that:

```bash
source .venv/bin/activate
```

| Command | What it does |
|---|---|
| `quant-beam boot` | Bold one-screen bulletin of the latest data (instant, offline) |
| `quant-beam analyse` | Re-read markets and rebuild the quantum analysis |
| `quant-beam research` | Test the trading rules on 10 years of history |
| `quant-beam bot run` / `status` / `watch` | Paper QuantBot (pretend money) |
| `quant-beam oil` | Oil, lithium & transport value chain |
| `quant-beam cost` | Trading cost from the live Binance order book |

To see the web page:

```bash
python3 -m http.server 8000 --directory docs
```

Then open http://localhost:8000. Every change to this repo is listed in [CHANGELOG.md](CHANGELOG.md).

## Data sources and terms

Prices and company figures come from Yahoo Finance, and the trading cost comes from Binance's public API.
Both restrict republishing their raw data, so this public repo publishes **derived results only**
(volatility, margins, quantum states, test results and each market's latest price), not raw price history.
Check each provider's terms before any commercial use.

## Web page

The page lives in [`docs/`](docs/). To publish it with GitHub Pages: **Settings → Pages →
Deploy from a branch → `main` / `/docs`**.

---

## Paper QuantBot (pretend money only)

The paper bot trades **pretend money** on real daily prices: ₹10,00,000 for India and
$10,000 shared by the US and crypto markets. It never connects to a broker, never logs in
anywhere, and never places a real order.

### Step 1 — Research: which fluctuations were worth trading? (`research.py`)
Three rule types are tested on 10 years of daily history, each with 32 settings
(move size k = 1.5–3σ, holding 1–10 days, stop-loss 1.5σ or 3σ):

| Rule | Idea |
|---|---|
| `dip_buy` | Buy after a fall of kσ or more (bet on a bounce) |
| `momentum` | Buy after a rise of kσ or more (bet it keeps going) |
| `calm_dip_buy` | Dip buy, but only while the market's quantum ground-state purity is high (calm) |

Here σ is the volatility of the previous 60 days, so every signal uses only past data.
For each group (India, US, crypto, and the US oil chain without car makers or pipelines), the settings are **picked** on the older 60% of the history.
They are then **tested** on the newer 40% the bot never saw. A rule passes only if, in that test and
after costs (0.1% per side for stocks, 0.2% for crypto):

1. it made at least 20 trades,
2. its average trade made money, and
3. its win rate beat simply buying on a random day and holding just as long, and
4. its average trade beat the average of holding just as long from random start days.

Each result also gets an **evidence** grade from a t-test. Many settings were tried, so a
"weak" result can easily be luck.

**Latest results (test period Sept 2022 – Sept 2026):** only 1 of 12 rules passed. It's India
`momentum` (z ≥ +3σ, hold 10 days): 35 trades, 54% wins against 51% for random days, and weak
evidence (p ≈ 0.23). No US, crypto or oil-chain rule passed. The best oil-chain rule did no better than
holding for the same 10 days from random start days. Simply buying and holding usually beat every rule.

### Step 2 — The bot (`paperbot.py`)
Every run it:
- ignores today's unfinished bar, fills yesterday's signals at the next close, and exits trades on
  stop-loss or holding time,
- uses **only rules that passed research** (if none passed, it stays in cash),
- **spreads money evenly** across the markets that share a wallet,
- **guards against losses:** if a wallet falls 10% below its peak, it closes everything and halts.

```bash
quant-beam research
```

```bash
quant-beam bot run
```

```bash
quant-beam bot watch
```

In `watch` mode: **Enter** runs the bot now, **c** cancels today's queued signals (open
positions stay), **Esc** closes every pretend position and halts, **r** resumes, and **q** quits.
The same actions work as commands: `bot status`, `bot cancel-signals`, `bot cancel`, `bot resume`.

`bot status` shows **how the money is split** in each wallet: cash and each open position as a
share of the wallet, and the most any one market can get (the wallet divided evenly across its
markets). It also shows a **signal radar**: today's move in σ for each market and how far it is
from firing a rule. Big moves are rare, so days or weeks without a signal are normal.
Hide or show the radar with `bot radar off` / `bot radar on`. This only changes what is shown; the
bot still watches for signals.

**Which APIs does it use?** No broker API. The bot only reads public prices (the Yahoo Finance
chart API, with Alpha Vantage as an optional backup) and keeps its pretend wallet in
`docs/data/paper_wallet.json`.

### Optional: Alpha Vantage backup source
If Yahoo Finance fails for a stock, Quant-beam can fall back to Alpha Vantage. Add your key
as a secret. **Never put it in a file in this public repo.**

- Locally: `export ALPHAVANTAGE_API_KEY=...` in your own terminal.
- On GitHub: **Settings → Secrets and variables → Actions → New repository secret**,
  named `ALPHAVANTAGE_API_KEY`.

> Past results do not guarantee future results. This is a research and learning tool, not
> financial advice, and nothing here is a recommendation to buy or sell anything.

## Trading cost slice

`quant-beam cost` reads the live Binance order book for Bitcoin, Ethereum and Solana. It
works out how much **one round trip** (buy, then sell straight back) loses at sizes from $100 to
$5 million. The loss has three parts:

- **the buy/sell gap:** you buy at the higher price and sell at the lower one,
- **price impact:** a big order eats through the book and moves the price against itself,
- **fees:** Binance's standard 0.1% per side, so 0.2% per round trip, before any discounts.

Up to about $100,000, fees are nearly the whole cost. For multi-million orders, price impact takes
over, especially on thinner markets like Solana. The web page has a box for your own trade size and
number of round trips. Ten round trips a day costs about 2%, roughly Bitcoin's whole normal daily
move, which is why frequent small trades rarely pay.

## Oil, lithium & transport value chain

`quant-beam oil` follows two chains, from the oil well and from the lithium mine, to the car and
the truck. It covers 44 companies in the US, India, China, Korea, Chile, Canada, the UK and Japan:

| Segment | Examples |
|---|---|
| Oil producers | ConocoPhillips, EOG, Occidental, ONGC |
| Rigs & oilfield services | SLB, Halliburton, Baker Hughes, Transocean |
| Pipelines | Kinder Morgan, Williams, Energy Transfer |
| Integrated majors | ExxonMobil, Chevron, Shell, BP, Reliance |
| Refiners & fuel retail | Valero, Marathon, Phillips 66, BPCL, Indian Oil, HPCL |
| Lithium miners | Albemarle, SQM, Sigma Lithium, Ganfeng Lithium |
| Battery makers | CATL, LG Energy Solution, Samsung SDI, Amara Raja, Exide |
| Car makers | Toyota, GM, Ford, Tesla, BYD, Maruti Suzuki, Mahindra, Tata Motors PV |
| Airlines, freight & logistics | Delta, United, UPS, FedEx, IndiGo, Container Corp of India |

For each company it reports:
- **Margins:** gross, operating and net margin in the latest quarter, compared with the same quarter a
  year earlier (from quarterly filings via Yahoo Finance's fundamentals feed).
- **Margin leaks:** operating margin down 2 points or more. Each leak is split into a *gross-margin squeeze*
  (selling price vs input cost) and *cost growth* (operating costs rising faster than revenue).
- **Oil and lithium sensitivity:** the share's beta and correlation to WTI crude, and to the lithium &
  battery ETF (LIT), over the last year.
- **The refining margin:** the 3-2-1 crack spread, what a refinery earns turning 3 barrels of crude into 2
  of gasoline and 1 of diesel.
- **Ensemble:** a margin score (operating margin ranked **within its segment**, its change and revenue
  growth) and a price score (6-month trend and calm quantum state, minus tail risk), averaged. When the two
  point the same way the company is **aligned**. When they disagree it is flagged as **diverging**, e.g.
  "price ahead of margins".

Only about five quarters of margins are available, so the ensemble is a **description of now**. It
has not been back-tested and it is not a recommendation.

---

## Original Quantico notes

The notes below are the original ideas this project started from, kept unchanged. The code
also leaves `WALLSTREET.k`, `Convoluted.net`, `StatSelections.c` and `øphi.html` untouched.

```text
This is in pile collection to the Quantico : Based on Solve rate of algorithmic window trading : 'The fast-approval' :  Process trade is back through Vc :'Firms'
Approved by concatenation SQL : approved: <Prequel: 'Rise' , 'Fall' , 'Come-back'>



Mr: <EA-AGENTS : Simulator : non-k > k-log : <H:temp/ Guide-plate>

Boiler:list {[platecode.tech-c]} Infirm : <telemetry :'guides' , Frame.Syn[ACK.get]>
get*attr(ibutes, no-nodes) : <Track:telefarm : <Base : Sentry>>
@T-[Hat-frames] : R-risen[alt-dam]
Hat-[AG,HQ-GI]
[Fauntlet: Lomd-Tord :'fort-tran : 'DBC'Alt-V']
Handlet : <Malt_v[sat-vet : salt_sea]>

Malt-Licket : Tolt-Vlan(0)-ombnack -cc
Watnack : KIKI ? 

Ib-lesk : <Lisk-Bram : ratviconch>
Ognua":-obadesik 'sea-form : Panda-[-algorim]

Th:<Tambnom :<Omb:num>seivdong>BOSHNA
<IB-peta:'desk' , ask-dam : 'alcore-orom' , me-rum[rad + m ]
asqQuellang : >>OLLANG:LC : V_c : LCC: -LLB :LC-[rom]

<Kell-gesh : DOCK_VRAM : Me-pair : IAM >[NO-target : Ic-cc:(I-bip) 🎛️,passportcontrol]
Asker-li : <Docker-v : VG ptank: (.)duemeshtra saharshi>

,Naiker-c , Kaiser -.> Nei-dhet - [tether]
,Kind:args($: 'Virtual-dock', Offload , Pv)
R:rs.p[arckell]

No_dram : Tp-ip-net : <IC:BP>[TK:art$👣]

m-ye : <creek : Kive-j , mreek>
```
