"""Boot bulletin: a short, bold terminal summary of everything Quant-beam last saw.

It only reads the saved data files in docs/data, so it is instant and works
offline. Run the other commands (analyse, bot run, oil, cost) to refresh them.
"""

import json
import os
import sys
from pathlib import Path

from . import paperbot

# Next to the package, so the bulletin works from any folder (e.g. when a terminal opens).
DATA = Path(__file__).resolve().parent.parent / "docs" / "data"


def style(code):
    use = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
    return (lambda text: f"\033[{code}m{text}\033[0m") if use else (lambda text: text)


bold, dim, green, red, yellow = style("1"), style("2"), style("32"), style("31"), style("33")


def load(name):
    try:
        return json.loads((DATA / name).read_text())
    except (OSError, ValueError):
        return None


def signed(value, digits=1):
    text = f"{value * 100:+.{digits}f}%"
    return green(text) if value >= 0 else red(text)


def bulletin():
    lines = [bold("ø Quant-beam") + dim("  ·  pretend money only, not financial advice")]

    wallet = load("paper_wallet.json")
    if wallet:
        status = red(f"HALTED: {wallet['halt_reason']}") if wallet["halted"] else green("running")
        lines.append(bold("\nPaper wallets") + f"  {status}" + dim(f"  (last run {wallet.get('updated_at', '–')})"))
        for currency, split in paperbot.allocation(wallet).items():
            start = wallet["wallets"][currency]["start"]
            held = ", ".join(f"{h['symbol']} {h['share']:.0%}" for h in split["positions"]) or "no positions"
            lines.append(f"  {bold(currency)} {split['equity']:,.2f}  {signed(split['equity'] / start - 1, 2)}"
                         f"  cash {split['cash_share']:.0%} · {held}")
        closest = [r for r in wallet.get("radar", []) if r.get("nearest_rule")]
        if closest:
            nearest = min(closest, key=lambda r: r["nearest_rule"]["gap_sigma"])
            lines.append(f"  closest signal: {bold(nearest['symbol'])} is {nearest['nearest_rule']['gap_sigma']:.2f}σ away")

    research = load("research.json")
    if research:
        passed = [f"{g['name']}: {r['label']}" for g in research["groups"].values() for r in g["rules"] if r["passed"]]
        lines.append(bold("\nResearch") + dim(f"  ({research['generated_at'][:10]})"))
        lines.append("  rules that passed: " + (bold("; ".join(passed)) if passed else yellow("none")))

    oil = load("oil_chain.json")
    if oil:
        crack = oil.get("crack_spread_321")
        leaks = [s for seg in oil["segments"].values() for s in seg["leaking"]]
        top = [c["symbol"] for c in oil["companies"][:3]]
        lines.append(bold("\nOil chain") + dim(f"  ({oil['generated_at'][:10]})"))
        if crack:
            margin = f"${crack['last']:.2f}/bbl"
            lines.append(f"  refining margin {bold(margin)} vs 1y avg ${crack['avg_1y']:.2f}")
        lines.append(f"  top ensemble: {bold(', '.join(top))} · margin leaks: {yellow(str(len(leaks)))}")

    cost = load("trading_cost.json")
    if cost:
        btc = cost["pairs"].get("BTCUSDT")
        if btc:
            trip = next((s for s in btc["sizes"] if s and s["size"] == 1000), None)
            if trip:
                loss = f"${trip['loss']:.2f}"
                lines.append(bold("\nTrading cost") + f"  $1,000 Bitcoin round trip loses {bold(loss)}")

    if len(lines) == 1:
        lines.append(yellow("No data yet. Run: quant-beam analyse, quant-beam bot run"))
    return "\n".join(lines)
