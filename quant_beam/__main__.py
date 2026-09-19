import argparse

from . import oilchain, paperbot, pipeline, research

DATA = "docs/data/quant_beam.json"
RESEARCH = "docs/data/research.json"
WALLET = "docs/data/paper_wallet.json"
OIL = "docs/data/oil_chain.json"


def main():
    parser = argparse.ArgumentParser(prog="python -m quant_beam", description="Quant-beam tools.")
    parser.add_argument("--out", default=DATA, help="where to write the analysis JSON")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("analyse", help="re-read markets and rebuild the analysis (default)")
    commands.add_parser("research", help="test trading rules on 10 years of history")
    commands.add_parser("oil", help="oil & transport value chain: margins, leaks and the ensemble")
    bot = commands.add_parser("bot", help="paper QuantBot (pretend money only)")
    bot.add_argument("action", choices=["run", "status", "cancel", "cancel-signals", "resume", "watch"])
    args = parser.parse_args()

    if args.command == "research":
        research.run(RESEARCH)
    elif args.command == "oil":
        oilchain.run(OIL)
    elif args.command == "bot":
        if args.action == "run":
            print(paperbot.summary(paperbot.run(WALLET, RESEARCH)))
        elif args.action == "status":
            print(paperbot.summary(paperbot.load_state(WALLET)))
        elif args.action == "cancel":
            print(paperbot.summary(paperbot.cancel(WALLET)))
        elif args.action == "cancel-signals":
            print(paperbot.summary(paperbot.cancel_signals(WALLET)))
        elif args.action == "resume":
            print(paperbot.summary(paperbot.resume(WALLET)))
        else:
            from .watch import watch
            watch(WALLET, RESEARCH)
    else:
        pipeline.run(args.out)


if __name__ == "__main__":
    main()
