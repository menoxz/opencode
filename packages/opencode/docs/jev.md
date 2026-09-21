# Jev (System One) decision layer

Jev is TypeSafe's System One model. It does not generate text: you send `state`
plus typed questions and get back typed answers carrying calibrated
probabilities. OpenCode uses it in two places:

- the `jev` agent tool, for short bounded decisions the agent asks for;
- an opt-in permission guard that escalates a ruleset auto-allowed action when
  Jev puts enough probability on that action being risky.

The same wire contract is served by TypeSafe Jev in production and by
Codiv's OpenJev for tests, so the integration is exercised against a real
compatible server without touching the production host.

## Backends

| Role | Base URL | Model |
| --- | --- | --- |
| Production | `https://api.typesafe.ai` | `jev-latest` |
| Tests | `https://api.codiv.ai` | `openjev-latest` |

Both expose `POST {base}/v1/systemone` and require
`Authorization: Bearer <api_key>`.

## Install and configure

Put the secret in the environment; OpenCode validates config strictly and
config files are routinely committed. The key is read from
`TYPESAFE_API_KEY`, then `JEV_API_KEY`, then `jev.api_key`.

Production (defaults, nothing to configure beyond the key):

```sh
export TYPESAFE_API_KEY=...
```

Test run against OpenJev:

```sh
export TYPESAFE_API_KEY=...
export TYPESAFE_BASE_URL=https://api.codiv.ai
```

### Getting an OpenJev key (free)

OpenJev is Codiv's open System One model and is free to evaluate. Sign up at
<https://codiv.ai/signup> (Google, GitHub or email, no card), then create a key in the
dashboard at <https://codiv.ai/dashboard> — it is shown once, prefixed `sk-codiv-`.
Every account starts with 100M System One input tokens and 10M text-generation tokens,
1,200 requests/minute per key and 8 MB request bodies. `openjev-latest` tracks the
newest release; pin `openjev-0.1` when answers must not change under you. Self-hosting
the same model is possible (Apache-2.0, <https://github.com/razorback16/openjev>) but
needs a 24 GB+ NVIDIA GPU, so the hosted free tier is the practical default.

`base_url` and `model` are resolved together, so pointing `base_url` at the
OpenJev host selects `openjev-latest` without leaving a TypeSafe-only model id
pointed at the OpenJev host. `TYPESAFE_MODEL` overrides the model explicitly.

`opencode.json` can carry the non-secret settings. `{env:VAR}` substitution is
supported, so a key can also be referenced without being written literally:

```json
{
  "jev": {
    "api_key": "{env:TYPESAFE_API_KEY}",
    "base_url": "https://api.typesafe.ai",
    "model": "jev-latest",
    "guard": {
      "enabled": false,
      "threshold": 0.5,
      "permissions": ["write", "shell", "workspace_handoff"]
    }
  }
}
```

- `endpoint` overrides `base_url` and defaults to `<base_url>/v1/systemone`.
- `guard.enabled` defaults to off; when off the guard is a strict no-op, so
  existing behaviour is unchanged even without a key.
- `guard.threshold` is the probability (0..1) of the risky outcome at or above
  which an auto-allowed action is escalated. Default `0.5`; lower values trade
  false escalations for fewer missed risks.
- `guard.permissions` lists the permission names screened.

## The `jev` tool

`parameters`:

- `state` — every fact the questions depend on. Jev is stateless and text-only,
  so nothing outside `state` is visible to it. A plain string, or JSON
  structure when the guidance needs to be organised.
- `questions` — a map keyed by a stable id; the answer comes back under the
  same id. Each entry is one of:
  - `noul`: `{ type, instructions, criteria? { true, false } }` — a yes/no
    question answered by a single probability that the answer is yes.
  - `choice`: `{ type, instructions, criteria }` — `criteria` maps each option
    name to its description; the answer names the selected option.
  - `score`: `{ type, instructions, criteria }` — `criteria` is an ordered list
    of level descriptions, lowest first; the answer is a probability-weighted
    position across those levels.
- `model` — optional per-call override, for example `openjev-latest`.

The tool never throws on an upstream problem: a missing key, an HTTP failure or
a payload that does not match the schema comes back as a `Jev decision
unavailable` result with the error tag, so the agent can fall back to its own
reasoning.

## Spec corrections

The original integration request described an API that does not exist. The
shipped code follows the documented behaviour instead:

1. **Wire format is map-keyed, not array-keyed.** `questions` and `answers` are
   objects keyed by a caller-chosen id. The id never reaches the model; it only
   matches an answer to its question. There is no `id`/`kind` field on a
   question or answer.
2. **A `noul` answer is a single probability.** It carries `noul` (probability
   that the answer is yes) and no separate confidence. Only `choice` and
   `score` carry `confidence`, alongside their per-option/level `probabilities`
   and, for `score`, an optional `legend`.
3. **The plugin API is not `Plugin.define({ id, setup })`.** In OpenCode v2 a
   plugin is `define<R>({ id, effect })` and hooks are flat keys of
   `HookSpec` in `packages/core/src/plugin.ts`; there is no per-context
   `ctx.hook()` object.
4. **The compaction hook is `experimental.session.compacting`**, triggered in
   `src/session/compaction.ts`; a plugin may return a replacement `prompt` or
   `context`.

## Jev at both ends of the ReAct step

A tool call is an observation. The loop pays for the same observation twice in
two different shapes: the *exact* repeat (`git status`, twice) and the *near*
repeat (`git status --short` after `git status`), where the arguments differ but
the information does not. `ToolRepetition` already refuses the exact repeat once
it is proven unproductive, and `ReadLedger` already answers a re-read of the same
file range from its own persisted ledger. The layers below cover what is left.

### Context allocation — `src/session/context-ledger.ts`

One slot per observation target: a file, a URL, a command, a query. The slot is
canonical and refreshed in place, so a long session carries one bounded line per
target instead of a growing series of copies.

- **Freshness is decided, never guessed.** Every call classified as mutating
  advances a session epoch; an observation stays valid only while the epoch has
  not moved **and** its time-to-live (default 120 s) has not expired. The
  classifier is conservative: anything outside the read-only allowlist counts as
  mutating, and `|`, `;`, `&`, backticks, `$(...)` and redirection all
  disqualify a command. A false "mutating" costs a missed optimisation; a false
  "read-only" would suppress a call that was needed. A bare runner name proves
  nothing either — `bun --version` observes, `bun add` installs.
- **A presence notice replaces execution.** When a read-only target is provably
  unchanged, the call is answered from the slot with `[present]`, quoting the
  target, the step it was observed at and a bounded summary, plus an explicit
  escape: repeat the call if you know the world changed.
- **File coverage.** A `read` slot records the union of the line ranges already
  held (`lines 1-200,303-352`), merged across overlapping reads, so the
  allocation says precisely which part of a file is in context.
- **The capsule.** `contextCapsule()` renders `<context_slots>`:
  one canonical line per current target, and a *named* — never quoted — list of
  superseded targets, because the repair is a re-read the model still has to
  make. It is injected once, next to the progress capsule, and rebuilt every
  turn rather than accumulated.
- **Compaction invalidates every claim.** A summary may have dropped an
  observation the notice still promises, and only the harness can know: slots are
  marked elided in `src/session/compaction.ts`, so presence has to be re-earned.
- **Wiring.** The gate runs in `src/session/tools.ts`, on the same path as the
  guard, immediately around `item.execute`. `read` and `inspect_batch` are
  exempt: they keep their own reporting.
- **Config.** `experimental.hot_path.context_slots` (default `true`) disables the
  capsule and the gate together.

### Relevance judge — `src/jev/relevance.ts`

Asked only when the deterministic gate cannot settle the call: a read-only call
whose target looks like a near repeat of something already held. It answers one
`noul` question — will this call return information absent from what is already
observed? — with the bounded observed surface and the candidate call as state.

- Banding: at or below `jev.relevance.threshold` (default 0.25) the call is
  answered from the ledger; below `jev.relevance.ambiguous_threshold` (default
  0.6) it runs and its result is flagged; above, it runs silently.
- Advisory by construction: it never refuses a call, never asks the user and
  never touches a call that can mutate. Under `jev.shadow` every verdict is
  logged and annotated instead of acted on.
- Memoised on `(tool, args, observed surface, thresholds)` in `src/jev/state.ts`,
  so a replayed step never pays a second round-trip for the same verdict.
- Fail-open: an unreachable or unreadable answer abstains and the call runs.

### Next-action selector — `src/jev/next-action.ts`

After a call, one closed `choice` — `continue`, `reobserve`, `switch_strategy`,
`verify`, `answer`, `blocked` — judged against the result, the progress status
(`stagnant`, last verdict), the current plan phase and the objective, rendered as
a single `[jev next action]` guidance line beside the tool result.

It is **not** an extra round-trip. `JevHooks.post` merges these questions into
the request it already makes for the review, so a step costs at most one Jev call
whichever hooks are on, and none when both are off. The question is closed rather
than free-form so it can be tested, logged and counted, and the model stays the
planner: the guidance competes with nothing.

### What Jev is not allowed to own

Jev is stateless and text-only, so it sees only the state the caller passes and
cannot know what survived compaction or elision. Presence is therefore the
harness's business — the notice is built from the ledger, never from a Jev
answer — and every Jev verdict is advisory: suppression is a harness policy
limited to provably unchanged read-only targets.

### Metrics

Every decision logs, next to the existing `jev guard` lines:
`context presence` (tool, target, step, calls), `jev relevance decision`
(verdict, probability, cached, shadow) and `jev guard memoised`.

## Verify

From `packages/opencode`:

```sh
bun typecheck
bun test test/jev test/permission/jev-guard.test.ts src/session src/tool
```

The suite covers the schema round-trip, the environment/base-url/model
resolution, the pure probability guard, the tool rendering and error paths, the
permission guard escalation with a stub System One server, and — for the layers
above — the read-only classifier, epoch and TTL freshness, range-coverage
merging, presence notices, capsule rendering, compaction invalidation, the
relevance bands and memoisation, and the merged single-round-trip post hook.
