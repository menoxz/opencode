"""Read-only functional test: resolve by role/name, wait_for, bounded screenshot, eval_state.

Picks whatever top-level window actually exists, so it is independent of which apps are
open. Deliberately performs NO click/fill/key input, so it never moves the operator's
mouse or types into their windows. Run with the venv python.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Optional

from pywinauto import Desktop

from computer_use import uia


def pick_window() -> Optional[Any]:
    for w in Desktop(backend="uia").windows():
        info = w.element_info
        name = (uia._get(info, "name", "") or "").strip()
        if name:
            return info
    return None


def main() -> int:
    target = pick_window()
    if target is None:
        print("SKIP: no named top-level window available")
        return 0

    tname = uia._get(target, "name", "")
    trole = uia._get(target, "control_type", "") or ""
    print("TARGET:", json.dumps({"role": trole, "name": tname}, ensure_ascii=False))

    # 1. resolve by name alone
    by_name = uia.resolve(name=tname)
    print("RESOLVE_BY_NAME_OK:", uia._node(by_name, 0, None)["name"] == tname)

    # 2. resolve by role+name
    if trole:
        by_pair = uia.resolve(role=trole, name=tname)
        print("RESOLVE_BY_ROLE_NAME_OK:", uia._node(by_pair, 0, None)["name"] == tname)

    # 3. wait_for: present case
    present = uia.wait_for(role=trole or None, name=tname, timeout=3, state="exists")
    print("WAIT_PRESENT:", json.dumps({"met": present["met"], "state": present["state"]}))
    if not present["met"]:
        print("FAIL wait_for present")
        return 1

    # 4. wait_for: absent case must time out with met=false, not raise
    absent = uia.wait_for(name="zzz-no-such-window-xyz", timeout=1, state="exists")
    print("WAIT_ABSENT:", json.dumps({"met": absent["met"], "state": absent["state"]}))
    if absent["met"]:
        print("FAIL wait_for absent should not match")
        return 1

    # 5. bounded screenshot (inline path, bounded size)
    shot = uia.screenshot(max_side=320, inline=True)
    print("SHOT:", json.dumps({k: shot[k] for k in ("width", "height", "bytes", "format")}))
    if shot["bytes"] <= 0 or max(shot["width"], shot["height"]) > 320:
        print("FAIL screenshot bounds")
        return 1

    # 6. eval_state diff shape
    diff = uia.eval_state(scope="foreground")
    print("EVAL_COUNTS:", json.dumps(diff["counts"]))
    if set(diff["counts"]) != {"added", "removed", "changed"}:
        print("FAIL eval_state shape")
        return 1

    print("FUNCTIONAL_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
