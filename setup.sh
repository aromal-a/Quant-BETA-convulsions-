#!/usr/bin/env bash
# One-step setup for anyone who clones this repo (macOS or Linux).
# Creates .venv, installs Quant-beam with its tests, runs the tests, and shows the boot bulletin.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "python3 was not found. Install Python 3.9 or newer, then run ./setup.sh again." >&2
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Creating .venv ..."
  "$PYTHON" -m venv .venv
fi

.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -e ".[test]"

echo "Running tests ..."
.venv/bin/python -m pytest -q tests

echo
.venv/bin/quant-beam boot
echo
echo "Ready. Start with:  source .venv/bin/activate  then  quant-beam --help"
