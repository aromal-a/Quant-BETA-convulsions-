import argparse

from . import ledger, oilchain, paperbot, pipeline, research, tradingcost, upstox

DATA = "docs/data/quant_beam.json"
RESEARCH = "docs/data/research.json"
WALLET = "docs/data/paper_wallet.json"
OIL = "docs/data/oil_chain.json"
COST = "docs/data/trading_cost.json"


def main():
    parser = argparse.ArgumentParser(prog="python -m quant_beam", description="Quant-beam tools.")
    parser.add_argument("--out", default=DATA, help="where to write the analysis JSON")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("analyse", help="re-read markets and rebuild the analysis (default)")
    commands.add_parser("research", help="test trading rules on 10 years of history")
    commands.add_parser("oil", help="oil & transport value chain: margins, leaks and the ensemble")
    account = commands.add_parser("account", help="read-only Upstox account view (needs UPSTOX_ACCESS_TOKEN)")
    account.add_argument("--json", action="store_true", help="print the raw summary as JSON")
    book = commands.add_parser("ledger", help="compile YOUR broker trade history (CSV) into win/loss numbers")
    book.add_argument("csv", help="trade book exported from your broker")
    book.add_argument("--cost", type=float, default=0.0, help="cost per side as a fraction, e.g. 0.001")
    commands.add_parser("boot", help="bold one-screen bulletin of the latest saved data (instant, offline)")
    commands.add_parser("cost", help="trading cost slice: round-trip loss on the live Binance order book")
    bot = commands.add_parser("bot", help="paper QuantBot (pretend money only)")
    bot.add_argument("action", choices=["run", "status", "cancel", "cancel-signals", "resume", "watch", "radar"])
    bot.add_argument("switch", nargs="?", choices=["on", "off"], help="for 'radar': show or hide it")
    args = parser.parse_args()

    if args.command == "research":
        research.run(RESEARCH)
    elif args.command == "oil":
        oilchain.run(OIL)
    elif args.command == "account":
        from .accountview import show_account
        show_account(json_out=args.json)
    elif args.command == "ledger":
        from .accountview import show_ledger
        show_ledger(args.csv, args.cost)
    elif args.command == "boot":
        from .boot import bulletin
        print(bulletin())
    elif args.command == "cost":
        tradingcost.run(COST)
    elif args.command == "bot":
        if args.action == "run":
            print(paperbot.summary(paperbot.run(WALLET, RESEARCH)))
        elif args.action == "status":
            print(paperbot.summary(paperbot.load_state(WALLET)))
        elif args.action == "cancel":
            print(paperbot.summary(paperbot.cancel(WALLET)))
        elif args.action == "cancel-signals":
            print(paperbot.summary(paperbot.cancel_signals(WALLET)))
        elif args.action == "radar":
            if not args.switch:
                parser.error("say 'bot radar on' or 'bot radar off'")
            print(paperbot.summary(paperbot.set_radar(WALLET, args.switch == "on")))
        elif args.action == "resume":
            print(paperbot.summary(paperbot.resume(WALLET)))
        else:
            from .watch import watch
            watch(WALLET, RESEARCH)
    else:
        pipeline.run(args.out)


if __name__ == "__main__":
    main()
