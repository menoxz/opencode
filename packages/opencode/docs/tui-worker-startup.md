# TUI worker startup under Bun 1.4.0

## Symptom and cause

On Windows, 2.2.6 opened a blank terminal although OpenTUI rendered its debug console. `OPENCODE_FAST_BOOT=1` exposed the home screen by bypassing SyncProvider readiness, but did not fix lost requests.

Bun 1.4.0 can deliver messages while a Worker's imports are suspended at top-level await, before `Rpc.listen` installs `onmessage`. Initial RPC requests are lost and SyncProvider waits indefinitely. A runtime comparison reproduced the loss on 1.4.0 but not 1.3.14. The Worker's `open` event does not guarantee application readiness.

## Fix and checks

Since 2.2.7, the worker emits `worker.ready` after `Rpc.listen`. The parent subscribes immediately after constructing its RPC client and waits before sending requests. Startup errors or a 30-second readiness timeout terminate the worker and propagate an error.

From `packages/opencode`:

```text
bun test test/cli/tui/worker-ready.test.ts
bun test test/cli/tui --timeout 30000
bun typecheck
```

The regression uses real Workers with asynchronous imports. Removing its readiness wait produces `first RPC was lost`; with the wait all four cases pass. The TUI suite passed 185 tests, with one skipped, on 2026-09-14.

## Visual acceptance

Launch the installed binary in Windows Terminal without FAST_BOOT or diagnostic overlays. Verify the home screen, open/close the command palette, and type into the prompt without submitting. `--version`, ANSI setup bytes, or a live PID are not visual acceptance.

Verified 2.2.7 on 2026-09-14 with real captures:

- Black screen before fix: `window_125535-716929.png`.
- Normal home screen after fix: `window_140256-384649.png`.
- Keyboard input visible after fix: `window_140503-447843.png`.

Captures are local artifacts under `~/desktop-mcp-screenshots/2026-09-14/`, not committed. This diagnosis is distinct from the older sustained `bun:ffi` polling crash. It verifies startup and UI input, not long-session stability or model responses.
