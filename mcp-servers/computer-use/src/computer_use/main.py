"""FastMCP server exposing Windows computer-use primitives over stdio.

Tools (names are hyphenated by the MCP protocol):
  computer_snapshot   -- structured UIA tree of the foreground window or whole desktop
  computer_click      -- click an element by uid or role/name
  computer_fill       -- set the text of an input by uid or role/name
  computer_press_key  -- send a key or key chord
  computer_scroll     -- scroll an element (or its centre) by wheel
  computer_wait_for   -- block until an element exists/visible/enabled/absent
  computer_screenshot -- bounded JPEG screenshot of the screen or one element
  computer_eval_state -- diff the live tree against the last snapshot
"""

from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

from . import uia

mcp = FastMCP(
    "computer-use",
    instructions=(
        "Windows desktop control via UI Automation. Call computer_snapshot first to get "
        "stable uids, then act with computer_click/computer_fill/computer_press_key/"
        "computer_scroll using a uid or a role+name pair. Use computer_wait_for to wait on "
        "state instead of sleeping, and computer_eval_state to confirm what changed."
    ),
)


def _ok(payload: dict[str, Any]) -> str:
    body = {"ok": True}
    body.update(payload)
    return json.dumps(body, ensure_ascii=False, default=str)


def _err(exc: Exception) -> str:
    return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)


@mcp.tool(description="Capture a structured UI Automation tree of the foreground window (default) or the whole desktop. Returns nodes with stable uids, role, name, automation_id, rect, enabled and visible. Stores the snapshot as the session baseline for eval_state. This is the entry point: call it before acting.")
def computer_snapshot(scope: str = "foreground", max_depth: int = 12, max_nodes: int = 250) -> str:
    try:
        return _ok(uia.snapshot(scope=scope, max_depth=max_depth, max_nodes=max_nodes))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Click an element by uid (from a snapshot) or by role and/or name. button: left|right|middle; double: click twice.")
def computer_click(uid: str | None = None, role: str | None = None, name: str | None = None, button: str = "left", double: bool = False) -> str:
    try:
        return _ok(uia.click(uid=uid, role=role, name=name, button=button, double=double))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Set the text of an input element located by uid or role/name.")
def computer_fill(value: str, uid: str | None = None, role: str | None = None, name: str | None = None) -> str:
    try:
        return _ok(uia.fill(value=value, uid=uid, role=role, name=name))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Send a key or key chord (pywinauto syntax, e.g. '{ENTER}', '^c', '{TAB}'). Optionally focus an element by uid first.")
def computer_press_key(keys: str, uid: str | None = None) -> str:
    try:
        return _ok(uia.press_key(keys=keys, uid=uid))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Scroll an element located by uid or role/name. direction: up|down|left|right|pgup|pgdn; amount: wheel notches.")
def computer_scroll(direction: str = "down", amount: int = 3, uid: str | None = None, role: str | None = None, name: str | None = None) -> str:
    try:
        return _ok(uia.scroll(direction=direction, amount=amount, uid=uid, role=role, name=name))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Wait until an element matching role and/or name reaches a state: exists|visible|enabled|absent. Returns met=true as soon as the condition holds, otherwise met=false at timeout. Blocks on state instead of a fixed sleep.")
def computer_wait_for(role: str | None = None, name: str | None = None, timeout: float = 5.0, state: str = "exists") -> str:
    try:
        return _ok(uia.wait_for(role=role, name=name, timeout=timeout, state=state))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Capture a screenshot of the whole screen or of one element (by uid) as a JPEG. The file path and dimensions are always returned; set inline=true to embed base64 only when the size stays under max_inline_bytes. Bounded, optional, off the default path.")
def computer_screenshot(uid: str | None = None, save_path: str | None = None, max_side: int = 1400, quality: int = 75, inline: bool = False, max_inline_bytes: int = 200_000) -> str:
    try:
        return _ok(uia.screenshot(uid=uid, save_path=save_path, max_side=max_side, quality=quality, inline=inline, max_inline_bytes=max_inline_bytes))
    except Exception as exc:
        return _err(exc)


@mcp.tool(description="Diff the live UI tree against the last snapshot: elements added, removed, and changed (name/enabled/visible/rect/role). Use it after an action to confirm the effect instead of guessing.")
def computer_eval_state(scope: str = "foreground", max_depth: int = 12) -> str:
    try:
        return _ok(uia.eval_state(scope=scope, max_depth=max_depth))
    except Exception as exc:
        return _err(exc)


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
