"""Interactive paper-bot console.

    Enter  run the bot now (re-read prices, act on new bars)
    Esc    cancel: close every pretend position and halt the bot
    r      resume after a cancel or a guard halt
    q      quit
"""

import select
import sys
import termios
import tty

from . import paperbot

KEYS = "[Enter] run now   [Esc] cancel all & halt   [r] resume   [q] quit"


def read_key():
    char = sys.stdin.read(1)
    if char == "\x1b":
        # swallow the rest of arrow-key sequences so they are not read as Esc
        while select.select([sys.stdin], [], [], 0.02)[0]:
            sys.stdin.read(1)
            return None
    return char


def watch(state_path, research_path):
    if not sys.stdin.isatty():
        raise SystemExit("watch needs an interactive terminal")
    print(paperbot.summary(paperbot.load_state(state_path)))
    print(KEYS)
    settings = termios.tcgetattr(sys.stdin)
    try:
        tty.setcbreak(sys.stdin.fileno())
        while True:
            key = read_key()
            if key in ("\n", "\r"):
                print("\nrunning…")
                state = paperbot.run(state_path, research_path)
            elif key == "\x1b":
                print("\ncancelling every pretend position…")
                state = paperbot.cancel(state_path)
            elif key == "r":
                state = paperbot.resume(state_path)
            elif key == "q":
                return
            else:
                continue
            print(paperbot.summary(state))
            print(KEYS)
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, settings)
