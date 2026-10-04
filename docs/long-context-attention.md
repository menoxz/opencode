# Long-context structure and attention

Source audit, 2026-09-07. A large context window is a capacity limit, not a
guarantee of reliable recall, instruction compliance, or prioritization.

## What the implementation does

- `src/session/llm/request.ts` assembles the agent/provider prompt, system
  context and user system text before conversation messages (with separate
  handling for OpenAI OAuth/workflows). Plugins can transform the request.
- `src/session/prompt.ts` injects a Goal/Definition of Done contract and a
  reminder to compare the latest user request with it. This helps orient the
  model, but an out-of-date objective still depends on the agent updating it.
- `src/session/message-v2.ts` supports compact tool-history replay and retains
  newer complete TODO snapshots. A file reference is not a semantic summary:
  the agent may need a targeted reread to recover discarded evidence.
- `src/session/compaction.ts` requests a structured summary with Goal,
  Constraints, Progress, Decisions, Next Steps, Critical Context and Relevant
  Files. It protects recent history and skills during pruning. Compaction
  can still lose details; preservation is not a verified recall guarantee.
- `src/session/overflow.ts` triggers compaction against usable model capacity
  using recorded token usage. The default threshold is 95%, configurable.
  With a separate model input limit, usable capacity subtracts `reserved`;
  otherwise it subtracts the maximum output allowance from context capacity.
  Thus `reserved` is not an absolute context cap and does not act on that
  latter branch. Unknown/zero context limits disable this overflow check.
- `src/session/instruction.ts` supports full instructions and a lossy summary
  mode consisting of the first six nonempty lines. Do not assume that mode
  preserves important rules occurring later in a file.

## What these mechanisms do not prove

They do not measure whether the model recalls a critical constraint buried in
the middle of 200,000 tokens, handles conflicting old instructions correctly,
or retains evidence after repeated compactions. Tests of overflow arithmetic
and replay serialization cannot establish those properties. No universal
safe token threshold follows from this audit; it depends on model and task.

The current assembly does not provide a verified end-to-end guarantee that
the final payload, including tool schemas and plugin additions, fits every
provider's actual limit. The working-state card below bounds only its own
overhead; it is not a final-payload budget refactor.

## Ephemeral working-state card

`session/llm.ts` reads Session.Service and Todo.Service on **every** stream
request, before the AI SDK/native runtime split. `working-state.ts` uses only
structured goal, DoD, out-of-scope constraints, the in-progress (otherwise first
pending) TODO, and recent high/critical finding evidence references. It never
mines history, tool output, instruction-file first lines, or compaction prose.
Evidence references are claims to consult, not validated proof. A contract whose
anchorUserID does not match the request's user ID is omitted (including legacy
unanchored contracts). The latest real user request explicitly takes precedence;
Active TODO is emitted only for a matching anchored nonterminal goal. Missing,
unanchored, stale, completed or skipped goals suppress TODO content and report
`unavailable/unanchored` rather than advertising an unrelated task.

The card is at most **8192 UTF-8 bytes**, including delimiters and escaping.
Per-section quotas ensure an oversized goal cannot crowd out TODO/constraints.
Values are JSON-quoted, control/tag delimiters escaped, and truncation marked;
omitted array entries are counted. No free-text summary or raw history is copied.
Escaping prevents delimiter breakout, not all semantic prompt injection.

Request preparation attaches one card to a copy of the existing tail user or
assistant content, or the last tool result. Text/error-text results gain a text
suffix; content results gain a text part. JSON/error-JSON tails **omit the card**:
their values and schemas (including scalars/arrays) remain exactly unchanged.
Call IDs, roles, ordering,
media, error classification and original replay objects are retained. No extra
user turn, system message, or database write is introduced. The system prefix
(including OAuth instructions) remains unchanged for caching. Native lowering
therefore cannot hoist this card into its separate system field. GitLab workflow
requests **skip attachment entirely**: the provider extracts the last user text
as its createWorkflow goal, so augmenting that text would change user intent.
Provider transformations still own wire encoding.

Compaction's processor calls the same LLM service, so its summary request and
subsequent continuation each receive a newly read card. The card explicitly
preserves the compaction agent's task. It is not added to persisted summaries or
history by this code; a model can of course mention its contents in its answer.
Compaction resolves the last real text/file user anchor from the original input,
before overflow replay removes turns; a synthetic compaction marker is not new
intent. The former raw verbatim-goal compaction hint is replaced by this card.
Opt-in context-file diagnostics may capture the assembled request as before.
Empty/system-only requests, absent sessions, and unsupported tail output types
do not receive a card. No new configuration switch is introduced.

This is a **deterministic availability/placement** mechanism, not an empirical
attention, recall, compliance, or universal provider-capacity guarantee. It does
not recover unstructured constraints lost by compaction. Only structured state
is refreshed; providers/plugins and models may still alter or ignore context.

Verification: `test/session/working-state.test.ts` checks byte limits, escaping,
immutable long-history attachment and tool encodings. The companion
`working-state-runtime.test.ts` uses real services/database and a local HTTP
fixture (no LLM/service mocks), capturing AI SDK and native requests across four
changing-state steps with >200,000 estimated tokens and compaction snapshots.
It also runs the real compaction processor with a synthetic parent and checks
that the generated persisted summary does not contain the card.

## Recommended next evaluation

1. Measure constraint recall and task success at several context sizes,
   including 200k+, with critical facts placed at the beginning, middle and
   end. Include distractors, changed requirements and repeated compactions.
2. Compare against a bounded working-state card containing the latest goal,
   non-negotiable constraints, active task and a few evidence references.
   Keep historical/untrusted text separate from authoritative instructions.
3. Validate the final request budget including tool schemas, output allowance
   and post-plugin additions; measure costs and cache impact rather than
   repeatedly rewriting the entire prefix.

An attention claim should be based on those observed results, not XML tags,
markdown headings, window size, or successful token-count tests alone.
