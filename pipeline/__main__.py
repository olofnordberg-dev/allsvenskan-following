"""python -m pipeline [download|build|export|run]   (run = all three, in order)"""
import sys

from . import build, download, export

STEPS = {"download": download.main, "build": build.main, "export": export.main}


def main() -> None:
    step = sys.argv[1] if len(sys.argv) > 1 else "run"
    if step == "run":
        for fn in STEPS.values():
            fn()
    elif step in STEPS:
        STEPS[step]()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
