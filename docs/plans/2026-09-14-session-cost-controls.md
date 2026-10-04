# Session Cost Controls Implementation Plan

> **For OpenCode:** Execute this plan in order with test-first changes; do not commit unless the user requests it.

**Goal:** Reduce avoidable long-session cost by preserving a stable prompt prefix, enforcing targeted/ bounded inspection and deliberate delegation, compacting read-heavy contexts around 80–100k tokens, and collapsing compaction summaries by default.

**Architecture:** Keep invariant system fragments ahead of per-turn data and preserve fragment boundaries through request preparation so provider caches retain the longest possible prefix. Put operating guidance in the invariant core prompt. Extend the existing overflow decision with a bounded read-output signal while retaining current model-limit/config guards and the existing compaction summary/tail preservation path. Make only the v2 compaction summary disclosure interactive because the normal TUI currently renders metadata only.

**Tech Stack:** TypeScript, Effect, Bun test, SolidJS/OpenTUI.

---

### Task 1: Preserve and verify the stable prompt prefix (priority 1)

**Objective:** Ensure stable policy/instruction fragments precede volatile environment, plan, skill-selection, and goal state, and remain separate provider system blocks where supported.

**Files:**
- Modify: `packages/opencode/src/session/system.ts`
- Modify: `packages/opencode/src/session/prompt.ts`
- Modify: `packages/opencode/src/session/llm/request.ts`
- Test: `packages/opencode/test/session/system.test.ts`
- Test: `packages/opencode/test/session/prompt.test.ts`
- Test: `packages/opencode/test/session/cache-prefix.test.ts`

**Steps:**
1. Add failing tests that identify stable and volatile fragments, assert stable-to-volatile ordering, and prove a runtime/plan change does not alter preceding fragments.
2. Add a failing request-preparation assertion that system fragments are not collapsed before provider/plugin processing (except the existing OpenAI OAuth final string requirement).
3. Split shell/task guidance from volatile runtime environment data.
4. Assemble system fragments in this order: core/agent prompt; repository instructions; shell/task policy; preloaded skills; tool/security policy; runtime environment; session plan reference; user-dependent skills; goal/environment capsules.
5. Preserve fragment boundaries in `LLMRequestPrep.prepare`; retain plugin ordering semantics and join only where the provider contract requires one string.
6. Run the targeted system/prompt/cache tests and confirm the old ordering/boundary assertions fail before the implementation and pass afterward.

### Task 2: Add targeted-reading, bounded-output, and delegation policy

**Objective:** Make agents locate likely lines/ranges before reading, request bounded outputs, and delegate only when independence/specialization/context protection outweighs coordination cost.

**Files:**
- Modify: `packages/opencode/src/session/prompt/core.txt`
- Test: `packages/opencode/test/session/system.test.ts`

**Steps:**
1. Add failing prompt-policy tests for: keyword/symbol localization before broad reads; exact range follow-up after search; bounded terminal/tool output with retained error/exit evidence; no repetitive full-file reads; delegation for independent specialist scopes or context protection; no delegation for trivial/sequential work; parent verification of critical child evidence.
2. Add concise invariant rules under `tool_policy` and a dedicated `delegation` section.
3. Keep the policy provider-agnostic and free of volatile session values so it remains cacheable.
4. Run the focused system prompt tests.

### Task 3: Compact read-heavy contexts around 80–100k tokens

**Objective:** Trigger normal automatic compaction by 100k tokens and as early as 80k when accumulated read/search outputs materially dominate context, without weakening lower model limits or explicit disabling.

**Files:**
- Modify: `packages/opencode/src/session/overflow.ts`
- Modify: `packages/opencode/src/session/compaction.ts` only if the existing summary/tail preservation path needs an exposed helper
- Modify: `packages/opencode/src/session/prompt.ts`
- Modify: `packages/opencode/src/config/config.ts` if the read-heavy thresholds are made configurable
- Test: `packages/opencode/test/session/compaction.test.ts`

**Steps:**
1. Add failing boundary tests: below 80k stays open; 80k with substantial completed `read`/`grep`/`glob` output compacts; 80k without accumulated inspection does not compact; 100k compacts regardless; a smaller model/config trigger still wins; `auto: false` still disables automatic compaction; post-compaction history does not count obsolete reads.
2. Derive a cheap read-context estimate from completed read/search tool output already present in current messages; do not tokenize or reread files.
3. Extend the overflow decision input with the current message history and compute `min(existing model trigger, 100k hard cap, 80k read-heavy cap)`.
4. Count only context after the latest completed compaction boundary and use conservative character-to-token estimation.
5. Reuse the current compaction process, which summarizes old context, preserves essential goal/plan state, retains a recent tail, and prunes obsolete tool output.
6. Run compaction boundary and preservation tests, including the existing reserve/cache accounting suite.

### Task 4: Collapse compaction summaries by default in the v2 TUI

**Objective:** Keep repeated compactions visible but unobtrusive, with accessible expansion when a user wants the summary.

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/feature-plugins/system/session-v2.tsx`
- Add: `packages/opencode/test/cli/tui/session-v2-compaction.view.test.tsx`

**Steps:**
1. Export the focused compaction view and add a failing OpenTUI render test proving the initial frame shows the disclosure label but not summary text.
2. Add local collapsed-by-default state with a focusable disclosure control.
3. Support mouse click plus Enter/Return/Space; render `▶` collapsed and `▼` expanded with a visible focus state.
4. Keep streaming summary updates hidden until expanded and distinguish automatic from manual compaction labels.
5. Verify default collapse, keyboard expansion/collapse, mouse expansion, empty summary, and appended summary behavior.

### Task 5: Integrated validation

**Objective:** Prove behavior and typing without disturbing unrelated in-progress workspace changes.

**Files:**
- Inspect: all files changed by Tasks 1–4

**Steps:**
1. Run all targeted Bun tests from `packages/opencode`.
2. Run `bun typecheck` from `packages/opencode` and retain a bounded diagnostic log on failure.
3. Inspect VS Code problems for changed files.
4. Review `git diff` and confirm only intended hunks were added alongside pre-existing user changes.
5. Validate the OpenTUI component through its real renderer test; use a visual desktop check only if renderer evidence is insufficient.
6. Record evidence for each acceptance criterion and leave any material correctness/accessibility/cache finding open until fixed.
