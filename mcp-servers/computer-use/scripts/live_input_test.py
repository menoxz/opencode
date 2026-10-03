"""Live input test: drive click/fill/press_key/scroll/wait_for/eval_state on a controlled
WinForms window we own, so the operator's windows are never touched.

Launches scripts/winforms_target.ps1, finds its window through UI Automation, fills the
InputBox, clicks Submit, waits for the label to change, and diffs. Exits non-zero on
failure and always closes the target process.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time

from computer_use import uia

TITLE = "ComputerUseTestTarget"


def find_target() -> dict:
    for _ in range(40):
        node = uia._find(role="Window", name=TITLE)
        if node:
            return node
        time.sleep(0.25)
    raise SystemExit("target window did not appear")


def main() -> int:
    proc = subprocess.Popen(
        ["pwsh", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/winforms_target.ps1"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        win = find_target()
        print("TARGET_UID:", win["uid"])

        # Bring the target to the foreground so the foreground snapshot scopes to it,
        # then take the baseline snapshot for eval_state.
        uia._wrapper(uia.resolve(role="Window", name=TITLE)).set_focus()
        time.sleep(0.4)
        snap = uia.snapshot(scope="foreground")
        print("BASELINE_NODES:", snap["count"])

        # 1. fill the InputBox by uid taken from the baseline snapshot
        box = next(n for n in snap["nodes"] if n["automation_id"] == "InputBox")
        res = uia.fill(value="hello", uid=box["uid"])
        print("FILL_OK:", res.get("method"), "value=", res.get("value"))
        if res.get("value") != "hello":
            print("FAIL fill")
            return 1

        # 2. click Submit by role+name
        clicked = uia.click(role="Button", name="Submit")
        print("CLICK_OK:", clicked["clicked"]["name"])
        if clicked["clicked"]["name"] != "Submit":
            print("FAIL click")
            return 1

        # 3. wait_for the label to reflect the filled value (condition on state)
        waited = uia.wait_for(name="submitted:hello", timeout=3, state="exists")
        if not waited["met"]:
            # This machine is shared with another session, so a click can lose the race
            # for the foreground. Re-focus the target and retry once before failing.
            uia._wrapper(uia.resolve(role="Window", name=TITLE)).set_focus()
            time.sleep(0.3)
            uia.click(role="Button", name="Submit")
            waited = uia.wait_for(name="submitted:hello", timeout=5, state="exists")
        print("WAIT_LABEL_OK:", json.dumps({"met": waited["met"]}))
        if not waited["met"]:
            dbg = uia.snapshot(scope="foreground")
            print("DIAG:", json.dumps(
                [{"role": n["role"], "name": n["name"], "aid": n["automation_id"]}
                 for n in dbg["nodes"] if n["automation_id"] in ("InputBox", "ResultLabel", "SubmitButton")],
                ensure_ascii=False,
            ))
            print("FAIL wait_for label")
            return 1

        # 4. eval_state diff must show the label change
        diff = uia.eval_state(scope="foreground")
        print("EVAL_CHANGED:", diff["counts"]["changed"], "ADDED:", diff["counts"]["added"])
        if diff["counts"]["changed"] + diff["counts"]["added"] <= 0:
            print("FAIL eval_state saw no change")
            return 1

        # 5. press_key (Tab) executes on the target
        uia.press_key("{TAB}", uid=box["uid"])
        print("KEY_OK")

        # 6. scroll the listbox by automation_id
        sc = uia.scroll(direction="down", amount=2, automation_id="ListBox")
        print("SCROLL_OK:", sc.get("method", "scroll"))

        print("LIVE_INPUT_OK")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
