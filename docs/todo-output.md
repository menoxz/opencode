# Todo output v1

`todowrite({todos: [...]})` remains a full replacement. Stored `Todo.Service` data
and `metadata.todos` contain every task, including mandatory research/closure
wrappers. Missing wrappers reuse stored tasks (including completed status), or
are injected with concise titles. `[CLOSE]` / `[CLOSURE]` are case-insensitive,
with leading whitespace ignored. Cancelling wrappers is rejected.

## Targeted writes and recovery

`todo.ts` retains the legacy required-list `Parameters` export for consumers;
the actual tool uses exported `InputParameters` for replacement/update/read modes.

* `{revision, updates: [{id: "t1", status: "completed"}]}` updates fields only.
  `content`, `status`, and `priority` are supported; no deletion or reorder.
* `{action: "read"}` returns the full current list, IDs and revision without a write.
* `{todos: [...]}` requires neither IDs nor revision. Do not combine modes.
* IDs are revision-bound positions (`t0`, `t1`, ...), **not persistent identities**:
  update IDs valid only for matching revision. Revision is SHA-256 over the exact
  ordered `[content,status,priority]` tuples. Changes to any field/order invalidate
  it. Identical lists have identical revisions (content CAS, not a monotonic counter).
* Stale/missing revision, unknown/duplicate IDs and empty patches fail before any
  write. Empty update arrays are harmless no-ops with a valid revision.
* One semaphore belongs to the shared outer `TodoWriteTool` initialization, not
  its per-turn `init()` copies (`registry.ts` resolves the tool in its layer;
  `tool.ts` resolves the outer effect once). It serializes read/check/write for
  all sessions/handles of that registry, including full replacements. There is
  no global map/cache. This is in-process tool CAS, not protection from direct
  `Todo.Service` writers, independently constructed registries or other processes.

Permission checks retain the existing `todowrite` permission for every mode.
Skills are selected from `skill.available(agent)` only, never widening visibility.
Catalogue lookup and ranking run only for new/changed active substantive content,
not wrappers, reorder, status/priority-only changes, reads or no-ops. Maximum three
suggestions: `Skills: skill(name), ...`. No LLM is involved.

## History / UI integration

`session/message-v2.ts` imports `renderTodoSnapshot` from `src/tool/todo-output.ts`. This pure
module depends on Node crypto, not Effect/session services. Signature:

```ts
renderTodoSnapshot(partmetadata: unknown): string | undefined
```

Pass the latest successful part's **full metadata**, not `metadata.todoOutput`.
It validates `metadata.todos` (including legacy metadata), returns a compact JSON
snapshot `{summary, revision, todos: [{id, content, status, priority}]}`, and returns
`undefined` for invalid/missing metadata. Empty lists are valid. It never replays
suggestions or stale historical deltas.

With `replayToolOutputs: "summary"`, valid recent TODO results include that full
snapshot so IDs, revisions and unfinished obligations survive targeted writes.
Recent snapshots render consistently when new turns arrive, avoiding a rewrite
of the cached prompt prefix on every update. Beyond the existing block-based
summary boundary, older TODO results are replaced only when a later valid full
snapshot remains. Their input payloads are abbreviated only if input replay is
not explicitly `full`. Explicit output `full`/`off` behavior is unchanged.
Already compacted parts are never resurrected from metadata. Invalid/legacy
parts without a full snapshot do not authorize dropping earlier task inputs.
Snapshot order is recorded under the same semaphore (`metadata.todoOrder`:
registry scope + increasing sequence), before optional skill ranking. This
prevents parallel calls finishing out of order from promoting a stale read over
a newer write. Recent replay exposes this sequence; old snapshots are superseded
only within comparable scopes. Different registry lifetimes retain their evidence
rather than guessing a global ordering. Legacy snapshots retain message ordering.

`metadata.todoOutput: TodoOutput` contains `version: 1`, `summary` (total, pending,
in_progress, completed, cancelled, other), `revision`, complete ordered `ids`,
`changed` (ID + changed fields only), `removed` (old trailing positional IDs),
`unchanged` count, `noOp`. For replacement/reorder, changed positional contents
and removed trailing IDs reconstruct the full list; IDs are not entity identities.
`metadata.todos` remains authoritative for UI and replay. `truncated: false`
prevents generic tool truncation from cutting changed commands. No task content
is shortened. Normal output omits unchanged tasks; no-op output is just
`Todos unchanged. r=<revision>`. Completion outputs carry counts and status deltas,
without repeating unchanged task content. Read output intentionally includes all.

Other exports: `TodoItem`, `TodoSummary`, `TodoChange`, `TodoOutput` (types),
`todoRevision`, `mandatoryKind`, `substantiveTodoText`, `summarizeTodos`,
`todoDelta`, `renderTodoDelta` (pure helpers).

## Reproducible measurement

`bun test --timeout 30000 test/tool/todo.test.ts` (from `packages/opencode`)
prints `TODO_BYTES`. The deterministic 20-task fixture changes one status and
compares legacy pretty-printed full JSON plus a representative one-skill legacy
suggestion block with the actual new tool output. On 2026-09-05 (Bun 1.3.14):

| UTF-8 bytes | Legacy full replacement | Targeted update |
| --- | ---: | ---: |
| Input | 2,829 | 124 |
| Output | 3,599 | 214 |
| Total | 6,428 | 338 |

This is a 94.7% reduction for this fixture, not a tokenizer claim. The first
save/read still includes all content; savings primarily apply to later updates.
