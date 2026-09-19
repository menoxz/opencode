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

## Verify

From `packages/opencode`:

```sh
bun typecheck
bun test test/jev test/permission/jev-guard.test.ts
```

The suite covers the schema round-trip, the environment/base-url/model
resolution, the pure probability guard, the tool rendering and error paths,
and the permission guard escalation with a stub System One server.
