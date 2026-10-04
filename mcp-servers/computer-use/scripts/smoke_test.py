"""Smoke test: tool registration + a live UIA snapshot.

Run with the venv python:  .venv\\Scripts\\python.exe scripts\\smoke_test.py
Exits non-zero on failure.
"""

from __future__ import annotations

import json
import sys

from computer_use import uia
from computer_use.main import mcp


def main() -> int:
    tools = sorted(mcp._tool_manager._tools.keys())
    print("REGISTERED_TOOLS:", json.dumps(tools))

    expected = {
        "computer_snapshot",
        "computer_click",
        "computer_fill",
        "computer_press_key",
        "computer_scroll",
        "computer_wait_for",
        "computer_screenshot",
        "computer_eval_state",
    }
    missing = expected - set(tools)
    if missing:
        print("FAIL missing tools:", sorted(missing))
        return 1

    snap = uia.snapshot(scope="foreground")
    print("SNAPSHOT_COUNT:", snap["count"], "TRUNCATED:", snap["truncated"])
    if snap["count"] <= 0:
        print("FAIL empty snapshot")
        return 1

    sample = json.dumps(snap["nodes"][:5], ensure_ascii=False)
    print("SAMPLE_NODES:", sample)

    diff = uia.eval_state(scope="foreground")
    print("EVAL_COUNTS:", json.dumps(diff["counts"]))

    print("SMOKE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
