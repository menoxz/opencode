# inspect_batch in the terminal UI

Both the standard session route and the internal `session.v2.messages` plugin
route use `InspectBatchTree`. The standard route still respects its existing
hide-completed-tool-details setting. No tool execution or scheduling changes.

The heading is a single line: the action count plus a `▸`/`▾` chevron. The
children and the note stay behind it and are drawn only after a click on the
heading, so a batch costs one row in the transcript until the reader asks for
the detail. A second click folds it back. The state is local to the component,
so two batches in the same transcript fold independently. The heading is only
clickable when there is something to reveal (at least one row, or a note);
hovering it brightens the title instead of adding another control. Nothing
auto-expands while a batch runs: the reader, not the run, decides.

The batch heading shows the action count. Each child uses one line: tool first,
target and optional read range/grep include, then a trailing status icon.
Technical IDs and empty dependency notices are hidden. Actual dependencies use
the same line as parameters, following the individual-tool `[key=value]` style:
`read src/main.ts [offset=10, limit=20] · after grep #1 ✓`.
No parameter or dependency adds a second line. Actual dependencies use
tool names with one-based row numbers to distinguish repeated tools.
`after read #1, grep #2` means both dependencies must succeed, not that all nodes run in
parallel. Input order is preserved; branches are a flat batch tree, not a
fabricated execution timeline.

The tool currently publishes final results in JSON `output.results`; metadata
contains aggregates and truncated IDs, not live child progress. Results join by
unique ID **and** action type. Pending/awaiting children show `…`; success/empty
show `✓` (empty also says `empty`), errors `✗`, skipped `−`, and unavailable
results `?`. Success/error use theme colors, never color alone. Parent failure does not
imply that every child failed. Child success, empty, error and skipped are shown
only from reported results. Errors show only a sanitized, bounded first line
under the affected action, never full traces. No child content or JSON is dumped.

At most 16 children are rendered, with a hidden-count notice for invalid larger
inputs. Targets are middle-elided (retaining filenames); dependency display
shows at most four row references plus an omitted count. Controls and ANSI sequences are
removed. The status icon sits immediately after the argument (one space), not in
a far-right column, so short rows have no empty gap; a trailing flex spacer
absorbs the remaining width. Child rows truncate on narrow terminals with space
reserved for the status icon, so it remains visible. Parsed input strings are
capped at 128 KiB, result JSON at 2,000,000 characters; larger or truncated JSON
falls back to input-derived rows and metadata truncation flags. Batch error
text is single-line and capped at 120 characters.

## Verification

From `packages/opencode`:

```text
bun test test/cli/tui/inspect-batch-tree.test.tsx
bun typecheck
```

Tests exercise the production helper and real OpenTUI component without mocks,
including reactive updates and narrow-terminal character-frame capture. These
are headless terminal render checks.

For a live frame (real session, real mouse click), `script/tui-shot.ts` runs the
dev TUI inside a PTY, replays its ANSI stream through a minimal terminal
emulator and prints text frames:

```text
bun script/tui-shot.ts --session <id> --db <db> --cwd packages/opencode \
  --click inspect_batch --click inspect_batch
```

The anchored click sends a real SGR mouse event, so the two frames show the
folded line, the expanded actions, then the folded line again. No running
application must be restarted, and no browser or screenshot tool is involved.
