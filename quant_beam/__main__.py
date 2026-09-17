import argparse

from .pipeline import run


def main():
    parser = argparse.ArgumentParser(description="Re-read markets and rebuild the Quant-beam data file.")
    parser.add_argument("--out", default="docs/data/quant_beam.json", help="where to write the JSON")
    args = parser.parse_args()
    run(args.out)


if __name__ == "__main__":
    main()
