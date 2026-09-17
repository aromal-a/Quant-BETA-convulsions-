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

## Run it yourself

```bash
pip install -r requirements.txt pytest
```

```bash
python -m pytest -q tests
```

```bash
python -m quant_beam --out docs/data/quant_beam.json
```

```bash
python -m http.server 8000 --directory docs
```

Then open http://localhost:8000.

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
For each group (India, US, crypto), the settings are **picked** on the older 60% of the history.
They are then **tested** on the newer 40% the bot never saw. A rule passes only if, in that test and
after costs (0.1% per side for stocks, 0.2% for crypto):

1. it made at least 20 trades,
2. its average trade made money, and
3. its win rate beat simply buying on a random day and holding just as long.

Each result also gets an **evidence** grade from a t-test. Many settings were tried, so a
"weak" result can easily be luck.

**First results (test period Sept 2022 – Sept 2026):** only 1 of 9 rules passed. That rule is India
`momentum` (z ≥ +3σ, hold 10 days): 35 trades, 54% wins against 51% for random days, and
its evidence is weak (p ≈ 0.23). No US or crypto rule passed. In crypto, every rule lost
money in the test period. Simply buying and holding usually did better than every rule.

### Step 2 — The bot (`paperbot.py`)
Every run it:
- ignores today's unfinished bar, fills yesterday's signals at the next close, and exits trades on
  stop-loss or holding time,
- uses **only rules that passed research** (if none passed, it stays in cash),
- **spreads money evenly** across the markets that share a wallet,
- **guards against losses:** if a wallet falls 10% below its peak, it closes everything and halts.

```bash
python -m quant_beam research
```

```bash
python -m quant_beam bot run
```

```bash
python -m quant_beam bot watch
```

In `watch` mode: **Enter** runs the bot now, **Esc** cancels every pretend position and halts,
**r** resumes, and **q** quits. `bot status`, `bot cancel` and `bot resume` also work as commands.

### Optional: Alpha Vantage backup source
If Yahoo Finance fails for a stock, Quant-beam can fall back to Alpha Vantage. Add your key
as a secret. **Never put it in a file in this public repo.**

- Locally: `export ALPHAVANTAGE_API_KEY=...` in your own terminal.
- On GitHub: **Settings → Secrets and variables → Actions → New repository secret**,
  named `ALPHAVANTAGE_API_KEY`.

> Past results do not guarantee future results. This is a research and learning tool, not
> financial advice, and nothing here is a recommendation to buy or sell anything.

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
