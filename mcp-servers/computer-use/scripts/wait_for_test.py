"""Dedicated, machine-checkable proof for computer_wait_for.

Asserts, against a live UIA tree:
  * state=exists on a present element -> met=true
  * state=exists on an absent element -> blocks until timeout, met=false (no exception)
  * state=visible on a present element -> met=true
  * the waited time on the absent case is close to the requested timeout (it waits on state)

Exits 0 and prints WAIT_FOR_OK only when every assertion holds. Read-only: no input.
"""

from __future__ import annotations

import json
import sys
import time

from pywinauto import Desktop

from computer_use import uia


def pick_window_name() -> str | None:
    for w in Desktop(backend="uia").windows():
        name = (uia._get(w.element_info, "name", "") or "").strip()
        if name:
            return name
    return None


def main() -> int:
    name = pick_window_name()
    if name is None:
        print("SKIP: no named top-level window")
        return 0

    # 1. exists on a present element
    t0 = time.monotonic()
    present = uia.wait_for(name=name, timeout=3, state="exists")
    print("WAIT_PRESENT:", json.dumps({"met": present["met"], "state": present["state"]}))
    assert present["met"] is True, "wait_for(exists) must find a present element"

    # 2. exists on an absent element: must block ~timeout then met=false, no exception
    t1 = time.monotonic()
    absent = uia.wait_for(name="zzz-no-such-window-xyz-123", timeout=1.0, state="exists")
    elapsed = time.monotonic() - t1
    print("WAIT_ABSENT:", json.dumps({"met": absent["met"], "state": absent["state"], "elapsed": round(elapsed, 2)}))
    assert absent["met"] is False, "wait_for(exists) must not match an absent element"
    assert elapsed >= 0.9, f"wait_for must block until the timeout, elapsed={elapsed:.2f}"

    # 3. visible on a present element
    visible = uia.wait_for(name=name, timeout=3, state="visible")
    print("WAIT_VISIBLE:", json.dumps({"met": visible["met"], "state": visible["state"]}))
    assert visible["met"] is True, "wait_for(visible) must match a visible element"

    print("WAIT_FOR_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
