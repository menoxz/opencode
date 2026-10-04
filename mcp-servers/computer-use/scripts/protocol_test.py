"""Protocol smoke test over real stdio: spawn the server, tools/list, then tools/call snapshot.

Run with the venv python.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time


def rpc(proc, msg):
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    if not line:
        raise SystemExit("no response from server (stderr: " + proc.stderr.read() + ")")
    return json.loads(line)


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, "-m", "computer_use.main"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert proc.stdin is not None and proc.stdout is not None and proc.stderr is not None
    try:
        init = rpc(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                          "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                     "clientInfo": {"name": "smoke", "version": "0"}}})
        if "result" not in init:
            print("INIT_FAIL", init)
            return 1
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        proc.stdin.flush()

        tools = rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        names = sorted(t["name"] for t in tools["result"]["tools"])
        print("PROTOCOL_TOOLS:", json.dumps(names))
        if len(names) != 8:
            print("FAIL expected 8 tools")
            return 1

        call = rpc(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                          "params": {"name": "computer_snapshot", "arguments": {"scope": "foreground"}}})
        text = call["result"]["content"][0]["text"]
        payload = json.loads(text)
        print("CALL_OK:", payload["ok"], "COUNT:", payload["count"])
        if not payload["ok"] or payload["count"] <= 0:
            print("FAIL snapshot call")
            return 1

        print("PROTOCOL_OK")
        return 0
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
