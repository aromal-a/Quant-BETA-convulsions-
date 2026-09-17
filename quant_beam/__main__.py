import argparse

from . import paperbot, pipeline, research

DATA = "docs/data/quant_beam.json"
RESEARCH = "docs/data/research.json"
WALLET = "docs/data/paper_wallet.json"


def main():
    parser = argparse.ArgumentParser(prog="python -m quant_beam", description="Quant-beam tools.")
    parser.add_argument("--out", default=DATA, help="where to write the analysis JSON")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("analyse", help="re-read markets and rebuild the analysis (default)")
    commands.add_parser("research", help="test trading rules on 10 years of history")
    bot = commands.add_parser("bot", help="paper QuantBot (pretend money only)")
    bot.add_argument("action", choices=["run", "status", "cancel", "resume", "watch"])
    args = parser.parse_args()

    if args.command == "research":
        research.run(RESEARCH)
    elif args.command == "bot":
        if args.action == "run":
            print(paperbot.summary(paperbot.run(WALLET, RESEARCH)))
        elif args.action == "status":
            print(paperbot.summary(paperbot.load_state(WALLET)))
        elif args.action == "cancel":
            print(paperbot.summary(paperbot.cancel(WALLET)))
        elif args.action == "resume":
            print(paperbot.summary(paperbot.resume(WALLET)))
        else:
            from .watch import watch
            watch(WALLET, RESEARCH)
    else:
        pipeline.run(args.out)


if __name__ == "__main__":
    main()
