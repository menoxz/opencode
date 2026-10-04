# computer-use-mcp

A Windows **computer-use** MCP server built on UI Automation (UIA). It gives an agent a
*structured* view of the desktop instead of pixels, and deterministic control primitives
that target elements by stable identity rather than screen coordinates.

## Why

Screenshot-only control forces the agent to guess targets from pixels. UIA gives an
accessibility tree with roles, names and automation ids, so a snapshot yields directly
addressable elements. Actions then resolve a target by `uid` (from the snapshot) or by
`role` + `name`, and state changes are observed with an explicit wait or a diff — no
blind sleeps, no coordinate drift.

## Tools

| Tool | Purpose |
| --- | --- |
| `computer_snapshot` | Structured UIA tree of the foreground window (default) or whole desktop; assigns stable `uid`s and stores the baseline. **Call first.** |
| `computer_click` | Click by `uid` or `role`/`name`; left/right/middle, single or double. |
| `computer_fill` | Set the text of an input by `uid` or `role`/`name` (`set_edit_text` → `set_text` → focused `type_keys`). |
| `computer_press_key` | Send a key or chord (`{ENTER}`, `^c`, `{TAB}`…), optionally focusing a `uid`. |
| `computer_scroll` | Scroll an element (`scroll` → wheel fallback at element centre). |
| `computer_wait_for` | Block until an element is `exists`/`visible`/`enabled`/`absent` — condition on state, not time. |
| `computer_screenshot` | Bounded JPEG of the screen or one element. Path + dimensions always returned; `inline=true` embeds base64 only under `max_inline_bytes`. |
| `computer_eval_state` | Diff the live tree against the last snapshot: added / removed / changed. |

Every tool returns JSON `{ok: true, ...}`, or `{ok: false, error}` — never a raw
traceback (errors are mapped to `UiaError` and serialized).

## Identifiers

`uid` is a 12-hex-char digest of the element's UIA runtime id (unique and stable while
the element lives), falling back to a structural fingerprint of
`process_id + class_name + name + automation_id + handle`. uids are valid for the session
that produced them; `eval_state` reuses them to diff.

## Install and run

```powershell
cd mcp-servers\computer-use
uv venv .venv
uv pip install --python .venv\Scripts\python.exe -e .
```

Register with OpenCode (`~/.config/opencodev2/opencode.jsonc`), under `mcp`:

```jsonc
"computer-use": {
  "type": "local",
  "command": ["C:\\jeanluc\\opencode-fork\\mcp-servers\\computer-use\\.venv\\Scripts\\python.exe", "-m", "computer_use.main"],
  "environment": { "PYTHONIOENCODING": "utf-8" },
  "enabled": true
}
```

Tools appear as `computer-use_computer_snapshot`, etc.

## Notes

- Windows-only (UI Automation). Depends on `pywinauto`, `comtypes`, `pywin32`, `Pillow`.
- The server keeps per-session state (last snapshot, uid map) in memory; restarting it
  clears that state.
- Code changes require a server restart to take effect.
