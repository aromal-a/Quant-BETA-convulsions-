#!/usr/bin/env bash
# One-line installer for Quant-beam (macOS, Linux, Windows via WSL).
#
#   curl -fsSL https://raw.githubusercontent.com/aromal-a/Quant-BETA-convulsions-/main/install.sh | bash
#
# Installing from your own fork:
#   curl -fsSL https://raw.githubusercontent.com/<you>/Quant-BETA-convulsions-/main/install.sh | REPO=<you>/Quant-BETA-convulsions- bash
#
# Options (environment variables):
#   REPO     owner/name to clone          (default: aromal-a/Quant-BETA-convulsions-)
#   BRANCH   branch to check out          (default: main)
#   DIR      where to install             (default: ~/quant-beam)
#   PYTHON   python interpreter to use    (default: python3)
set -euo pipefail

REPO="${REPO:-aromal-a/Quant-BETA-convulsions-}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-$HOME/quant-beam}"
PYTHON="${PYTHON:-python3}"

say()  { printf '\033[1;35mø\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is not installed. Install it from https://git-scm.com and run this again."
command -v "$PYTHON" >/dev/null 2>&1 || fail "python3 was not found. Install Python 3.9 or newer and run this again."
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' \
  || fail "Python 3.9 or newer is needed (found $("$PYTHON" -V 2>&1))."

if [ -d "$DIR/.git" ]; then
  say "Updating existing install in $DIR"
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH"
  git -C "$DIR" pull --quiet --ff-only origin "$BRANCH"
else
  say "Cloning $REPO ($BRANCH) into $DIR"
  git clone --quiet --branch "$BRANCH" "https://github.com/$REPO.git" "$DIR"
fi

cd "$DIR"
chmod +x setup.sh
PYTHON="$PYTHON" ./setup.sh

cat <<EOF

$(say "Installed in $DIR")
  cd $DIR && source .venv/bin/activate
  quant-beam boot          # one-screen bulletin
  quant-beam analyse       # re-read markets
  python3 -m http.server 8000 --directory docs   # web page at http://localhost:8000

Optional keys (keep them in your shell, never in the repo):
  export ALPHAVANTAGE_API_KEY=...
  export UPSTOX_ACCESS_TOKEN=...   # read-only, expires daily
EOF
