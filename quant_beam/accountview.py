"""Printing for the read-only account view and the trade-history compiler."""

import json

from . import ledger, paperbot, upstox
from .boot import bold, dim, green, red, yellow


def money(value, currency="₹"):
    return "–" if value is None else f"{currency}{value:,.2f}"


def signed(value):
    if value is None:
        return "–"
    text = f"{value * 100:+.2f}%"
    return green(text) if value >= 0 else red(text)


def show_account(json_out=False, fetch=upstox.get):
    if not upstox.available():
        print(yellow("UPSTOX_ACCESS_TOKEN is not set in this terminal."))
        print("Create an app at https://account.upstox.com/developer/apps, generate a daily access token,")
        print('then run:  export UPSTOX_ACCESS_TOKEN="...your token..."')
        print(dim("Never put the token in a file in this repo: the repo is public."))
        return
    summary = upstox.summarise(upstox.snapshot(fetch))
    if json_out:
        print(json.dumps(summary, indent=1))
        return

    print(bold("Upstox account") + dim("  ·  read-only: this tool cannot place, change or cancel orders"))
    print(f"  cash available: {bold(money(summary['cash']))}")
    print(f"  holdings value: {bold(money(summary['holdings_value']))}  "
          f"open profit/loss {money(summary['holdings_pnl'])}")
    for holding in sorted(summary["holdings"], key=lambda h: -(h["value"] or 0)):
        print(f"    {holding['symbol'] or '?':<18} {holding['quantity']:>8,.0f} @ {holding['average_price']:>10,.2f}"
              f"  now {holding['last_price']:>10,.2f}  {signed(holding['return'])}")
    if summary["positions"]:
        print(f"  intraday positions profit/loss: {money(summary['positions_pnl'])}")
        for position in summary["positions"]:
            print(f"    {position['symbol'] or '?':<18} {position['quantity']:>8}  {money(position['pnl'])}")
    trades = summary.get("trades_today") or []
    print(f"  trades today: {len(trades)}")
    for trade in trades:
        print(f"    {trade['time'] or '':<20} {trade['side']:<4} {trade['symbol'] or '?':<18} "
              f"{trade['quantity']} @ {trade['price']}")
    for section, error in summary["errors"].items():
        print(yellow(f"  {section}: {error}"))


def show_ledger(path, cost=0.0):
    try:
        result = ledger.report(path, cost)
    except (OSError, ValueError) as error:
        print(red(f"Could not read {path}: {error}"))
        return
    stats = result["stats"]
    print(bold("Your trade history") + dim(f"  ·  {result['rows']} rows from {path}"))
    if not stats["trades"]:
        print(yellow("  No completed round trips found (every buy is still open?)."))
    else:
        held = stats["median_days_held"]
        line = f"  closed trades: {bold(str(stats['trades']))} across {len(stats['symbols'])} symbols"
        if held is not None:
            line += f"  ·  median held {held:.0f} days"
        print(line)
        win = f"{stats['win_rate'] * 100:.1f}%"
        print(f"  win rate {bold(win)}   loss rate {stats['loss_rate'] * 100:.1f}%")
        print(f"  average trade {signed(stats['avg_trade'])}   average win {signed(stats['avg_win'])}"
              f"   average loss {signed(stats['avg_loss'])}")
        print(f"  best {signed(stats['best'])}   worst {signed(stats['worst'])}   total {money(stats['total_pnl'])}")
        if stats.get("profit_factor"):
            print(f"  profit factor {stats['profit_factor']:.2f}" + dim("  (money won / money lost)"))
        p_value = stats.get("coin_flip_p_value")
        if p_value is not None:
            verdict = "could easily be luck" if p_value > 0.05 else "unlikely to be luck alone"
            print(f"  chance of a win rate this high by luck: {p_value:.2f} " + dim(f"({verdict})"))
    if result["open_lots"]:
        print(f"  still open: {len(result['open_lots'])} lot(s)")

    wallet = paperbot.load_state("docs/data/paper_wallet.json")
    paper = wallet.get("trades") or []
    if paper:
        wins = sum(1 for t in paper if t["pnl"] > 0)
        print(bold("\nPaper bot, for comparison") + f"  {len(paper)} trades, win rate {wins / len(paper) * 100:.0f}%")
    else:
        print(dim("\nPaper bot has no closed pretend trades yet, so there is nothing to compare against."))
