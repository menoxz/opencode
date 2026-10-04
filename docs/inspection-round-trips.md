# Avoidable inspection round trips

The shared environment guidance (including custom-prompt agents) now asks for
already-known independent read-only inspections in one batch/parallel tool wave.
It explicitly excludes speculative work, unknown-result dependencies, and
mutations that must remain ordered. Relevant offset/limit ranges and grep
filters take priority over whole-file dumps. Truncation calls for a targeted
follow-up, not an automatic full reread. Idle work uses managed waits rather
than repeated status polling.

`inspect_batch` already deduplicates identical actions with identical dependency
sets. It now emits the primary content only once. Alias rows keep their ID,
type, status, error and truncation state, plus `aliasOf`; their output references
the primary result. Errors and denied permissions still block dependent actions.
No cross-call cache of file contents is added: stale evidence is not silently
reused after changes. Existing concurrency and per-wave output caps remain.
The same 16,000-character total / 4,000-character per-result default now applies
outside Lean unless a caller explicitly requests a larger result cap. Lean
continues enforcing its existing hard caps. This limits default excerpt growth,
not JSON metadata, error details, or actual provider tokens. Batch results use
compact JSON; no information is removed solely for whitespace reduction.

Delegation guidance assigns non-overlapping scopes, passes existing evidence
references and avoids a parent repeating an active child's audit. Critical
claims still require targeted verification. Overview work locates sections
before reading ranges; a batch's maximum action count is not a quota.
Truncation markers now fit inside the per-result text allowance, and excerpts
do not split Unicode surrogate pairs. The cap covers excerpt text, not JSON
envelope metadata or error/control fields required to interpret the result.

Tests cover the actual planner/result path and assert one execution plus one
content copy for duplicate requests, while keeping permission errors visible.
This deterministically removes redundant payloads for duplicates; instructions
alone do not guarantee fewer model turns or a particular provider bill.

Controlled fixture (2026-09-08): six identical read actions, one 4,000-character
result, measured through the production dedupe/localize/ordered functions:
24,541 to 4,811 serialized characters (80% reduction), one execution. This is
only that fixture's tool-result payload, not total request tokens or billing.
