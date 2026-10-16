# Tool output in the `run` scrollback

`opencode run` writes tool calls into the terminal scrollback, one entry per
phase. For `bash` that used to cost two things it should not: the whole command,
and no verdict. Both are fixed in
`packages/opencode/src/cli/cmd/run/` (`tool.ts`, `scrollback.shared.ts`).

## What was wrong

1. **The command was printed verbatim.** `scrollBashStart` wrote
   `# <description>` then `$ <command>` with no bound. Measured case: a
   PowerShell script carrying a Python heredoc, 40 lines long, for a one-line
   result — the instruction took the place of the subject.
2. **A failing command was invisible.** `TOOL_RULES.bash.view.final` was
   `false`, so `toolEntryBody` returned no body for the final entry and
   `scrollBashFinal` — which already knew how to write `bash completed (exit N)`
   — never rendered. `entryFailed` read only `state.status`, and that stays
   `completed` when a command exits non-zero: `exit 1` displayed exactly like a
   success.
3. **One tone for four roles.** The tool `start` entry is `theme.textMuted` and
   the body `theme.text` (`entryLook`), so title, command and output were told
   apart only by which phase happened to write them, never by importance.

## The rule set

- **No unbounded entry.** A multi-line command is written as its first line plus
  the hidden count: `$ $py = @" · +39 lines`. One-line commands are untouched,
  and the `$` prefix stays. Only whole lines are dropped — characters are never
  truncated, because eliding a path or an argument hides the target instead of
  the volume.
- **The result outranks the instruction.** The command keeps the dim `start`
  tone; the output keeps the brighter body tone; the status is brighter still on
  a failure.
- **The status is written last, and only on failure.** The exit code does not
  exist yet when the header is written, so it cannot live there. Success adds no
  line at all — what is rare does not show at rest — and `view.final = true` for
  `bash` is what lets the single failing line through.
- **The status says `✗ exit 1 · 2.4s`**, coloured from the same source as the
  text (`toolExitCode`, read by `entryFailed`), so the two can never disagree.
  `state.status` is not consulted: it is `completed` either way.
- **The exit code is read where the shell writes it** (`metadata.exit`, then the
  frame's `exitCode`/`exit_code`), and only for the `bash` tool: another tool
  carrying an `exit` field is not a shell failure.

## The other output mode

`opencode run` without `--interactive` does not use the scrollback: it prints
through `run.ts`, and a bash block takes its title from `runBash`. The command
was unbounded there too — measured on 2026-10-16 by redirecting the output of a
real run, which is the path every pipe, CI job and captured log takes. The same
`boundedCommand` helper now feeds that title.

One gap is deliberate and stays open: that printer writes no exit line, so a
non-zero exit still reads as a plain block. Its stdout is also consumed as data
by scripts, which is why the verdict was not bolted onto the output there.

## Measured frame

The same 40-line script with a non-zero exit, rendered by the production
renderer (`RunScrollbackStream` on the real OpenTUI surface, width 80):

```text
# Retry input mask measurement with retries
$ $py = @" · +39 lines

Set-Location: not found
✗ exit 1 · 2.4s
```

Five rows instead of the 45 the transcript used to carry, no script body, and
the verdict on the page.

## Verification

From `packages/opencode`:

```text
bun test --timeout 60000 test/cli/run/entry.body.test.ts \
  test/cli/run/scrollback.shared.test.ts test/cli/run/scrollback.surface.test.ts
bun run typecheck
```

The tests cover the bounding rule, the silent success, the failure line and the
failure tone, and one of them renders the frame above through the real renderer.
No mocks are involved.

Host limitation, measured on 2026-10-16: `test/cli/run/run-process.test.ts`
fails 3 of its 4 cases on this machine — the spawned `bun run src/index.ts run`
subprocess never returns and the harness synthesises `exit -1` after ~31 s. The
same three fail at HEAD with the change stashed, so the end-to-end subprocess
path cannot serve as proof here; the renderer-level checks above are the
available evidence.
