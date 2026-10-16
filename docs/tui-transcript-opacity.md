# The session transcript's opacity ladder

Four changes in the interactive TUI (`src/cli/cmd/tui/`), all in the standard session
route (`routes/session/index.tsx`): what the reader needs stays loud, everything the agent
merely reports recedes, and two blocks that were missing get a line of their own.

## Two levels, taken from the theme's own text

`resolveTheme` now derives `textLow`: the theme's `text` colour at half opacity (the alpha
is quantised to 128/255 by `RGBA.fromValues`). The hue stays the theme's, so the step holds
in light, dark and custom themes — a fixed grey would not.

- **loud** (`text`): the agent's prose, and the command of a bash call.
- **low** (`textLow`): what the agent reports — bash output, generic tool output, written
  and patched file content, diff context, and the batch heading.
- Reasoning sits at `textLow` too: it is reported content, and its `+`/`-` glyph already
  carries the open/closed state, so `thinkingOpacity` no longer applies there. Inline tool
  labels are already `textMuted` once complete.

`generateSyntax`, `generateSubtleSyntax` and `selectedForeground` take the pre-ladder shape
(`ResolvedThemeBase`), because the run surface reuses them with its own theme object.

## A bash block costs one line for the command, five for the output

The command was printed verbatim, so a 40-line script took 40 rows of frame, while only the
output was bounded (10 lines). The command is now its first line plus `· +N lines`, the
output is capped at 5, and the same click reveals both. Characters are never truncated:
eliding a path would hide the target instead of the volume.

## `Explore · N read · M grep · K glob`

`inspect_batch` accepts only `read`, `grep` and `glob` actions, so the heading names what
the batch **is** rather than the tool that ran it. Unknown types are counted separately as
`invalid`, never folded into a read. When the action list has not arrived yet, the planned
count is still shown (`Explore · 3 actions`).

## `core · instructions · N sources`

The instruction carrier is a synthetic, ignored part attached to the user message, carrying
`metadata.injection = "instructions"` and `metadata.sources` — the files injected at every
step. The transcript hid it, so the Logs panel was the only place to see it. It now has its
own line under the user's message, at the low level, with a spinner while the session is
busy (the agent re-reads those instructions every step), and the source paths behind the
click. Nothing is inferred from the part's text: only declared sources are shown.

## Measured frame

`script/tui-shot.ts` on a real session (dev source, isolated database) renders:

```text
core · instructions · 2 sources ▸
+ Thought: 2.9s

# Runs here-string script ending with exit 1
$ $texte = @' · +34 lines
Phrase resultat utile : le bloc here-string compte 30 lignes.
Set-Location:
Line |
  34 |  Set-Location -LiteralPath ".\dossier-absent"
…
Click to expand
```

## Second pass (2026-10-16): what the reader asked for next

- **The bash command is one row.** It is truncated to the transcript width while collapsed
  (`wrapMode="none"` + `truncate`) and wraps again once expanded, so the instruction costs
  one row at rest and stays fully readable on demand.
- **The bash output keeps its tail.** `collapseToolOutputTail` keeps the last five lines and
  marks the cut with a leading `…`: the verdict, the error and the totals live at the end,
  not at the beginning.
- **Every tool call stays on one line.** `InlineTool` truncates its label now; the batch rows
  already did.
- **The batch heading reads `✱ Explore 2 read 1 grep 2 glob`**: an icon leads, the dots
  between the counters are gone (the one after the title stays — it separates the label from
  the counts), and every row leads with `→`. No per-child state glyph any more: success is
  silent, a failed child turns its row red (`row.failed`, the same field the tests assert),
  and a running child keeps its spinner in the leading slot.
- **`§ core/instructions · N sources`**: the injected-instructions line is named after the
  flag it carries and gets an icon like the other entries. Its spinner says one thing only —
  *the instructions are entering the context* — so it stops as soon as the carrier part is
  written (`instructionsInjecting`), not when the answer finishes. Before that part exists,
  the line reads `core/instructions · injecting`.
- **TASK CONTRACT is a button, and nothing else**: the sidebar shows one focusable, clickable
  line which carries the label (`Goal definition`) **and its status** (`DOD(2) OOS(1)` — counts
  only, empty items excluded, a skipped contract counting as absent), and highlights its
  background on hover. It dispatches `session.goal.edit`. The objective, the DoD and
  the out-of-scope list are visible **only** in the editor panel it opens — xlarge minimum
  size, scrolling textarea, `ctrl+return` to save, esc to close. Without an existing contract
  the same click builds an empty one, so the button is also how a contract gets created; the
  editor's own guard still refuses an empty goal. The compact one-line summary that used to
  live in the sidebar, and its helper, were removed with it. No icon, no underline: the label
  is the button, and it opens on the **release** of the click — the dialog is a full-screen
  veil that closes on a `mouseup` outside its frame (`ui/dialog.tsx`), so opening on the press
  would receive that same click's release and close itself at once.
- **The Context section headline** is `Context`: the `(last call)` suffix is gone.

## Verification

From `packages/opencode`:

```text
bun test --timeout 60000 test/cli/tui/transcript-opacity.test.ts \
  test/cli/tui/instructions-injection.test.ts \
  test/cli/tui/inspect-batch-tree.test.tsx test/cli/tui/inspect-batch-align.test.tsx
bun run typecheck
```

Host baseline, A/B measured: `test/cli/tui/plugin-loader.test.ts` fails at HEAD as well, for
reasons unrelated to this change.
