# JEV in the ReAct loop — real hooks, not the spec's API

The integration brief described a plugin API of `Plugin.define(...)`, a `setup(ctx)`
call, `options.codemode` and `ctx.<hook>()` registration. None of that exists in
this fork (v1.18.91). This document is the proof of adaptation: what the real API
is, how each spec hook maps onto it, and where the intent had to be realised
natively because the hook contract cannot express it.

## The real API

`packages/plugin/src/index.ts`

```ts
type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
```

A plugin is a function returning a plain `Hooks` object whose keys are hook
names. There is no `define`, no `ctx`, no registration call. Hooks are fired with
`plugin.trigger(name, input, output)`; `output` is a mutable object and a hook's
return value is ignored.

| Hook | Fires at | Mutable output |
| --- | --- | --- |
| `tool.execute.before` | `session/tools.ts` before `item.execute` | `{ args, block? }` |
| `tool.execute.after` | `session/tools.ts` after `item.execute` | `{ title, metadata, output, attachments }` |
| `permission.ask` | `permission/index.ts` when a permission-gated tool asks | `{ status: "ask" \| "deny" \| "allow" }` |
| `experimental.chat.system.transform` | `session/llm/request.ts` while building the system prompt | `{ system: string[] }` |
| `experimental.session.compacting` | `session/compaction.ts` before/after summarization | `{ prompt?, context? }` |

## Spec → real mapping

| Spec intent | Real mechanism | Where |
| --- | --- | --- |
| route before the loop | native call in the request prep, stored in session state, rendered into the system prompt | `src/jev/route.ts`, `src/session/llm/request.ts` |
| guard **every** tool call | native call in the local-tool wrapper, right after `tool.execute.before` | `src/jev/hooks.ts`, `src/session/tools.ts` |
| deny / ask / allow | `deny` → fail the call; `ask` → `ctx.ask()` (the real permission channel); `allow` → proceed | `src/session/tools.ts` |
| review after execution | native call after `item.execute`, annotation appended to the tool output | `src/jev/review.ts`, `src/session/tools.ts` |
| injection detection | deterministic markers on every result + optional Jev confirmation, stored in shared session state and re-read by the guard | `src/jev/untrusted.ts`, `src/jev/state.ts` |
| compaction by decision | Jev checklist + audit wired into `experimental.session.compacting`; pairing/pruning helpers | `src/jev/compaction.ts`, `src/session/compaction.ts` |
| context injection | native block appended to `system` after the plugin transform | `src/jev/context.ts`, `src/session/llm/request.ts` |

## The one real divergence: `tool.execute.before` cannot refuse

`tool.execute.before` output is the `args` bag. Its return value is discarded and a
thrown error is swallowed upstream (`.pipe(Effect.ignore)`). It can rewrite
arguments; it cannot stop a call. `permission.ask` can return `deny`, but it only
runs for tools that pass through the permission system — `read`, `glob` and `grep`
never do, so it cannot be the systematic gate.

Two changes close the gap:

1. `tool.execute.before`'s output type gains `block?: { reason: string }`. A plugin
   sets it; `session/tools.ts` reads it immediately after the trigger and fails the
   call with a visible refusal.
2. The JEV guard runs natively at the same point, so **every** local tool call is
   screened regardless of whether a permission is attached. A `deny` fails the
   call; an `ask` goes through `ctx.ask()` so the user sees the call, JEV's reason,
   and can still allow it.

This is the smallest reversible extension to the plugin contract that makes the
"guard every call" requirement real rather than nominal.

## Fail-open posture

Every JEV call is wrapped so that an error, a timeout or an absent answer becomes
`undefined`, and `undefined` never blocks, asks or alters anything. The guard only
acts on an explicit verdict. Deterministic injection markers run without any
network call, so detection survives JEV being unreachable.

## Feature flags and rollback

`config.jev` (see `src/config/jev.ts`):

| Flag | Effect |
| --- | --- |
| `guard.enabled` | systematic pre-tool guard |
| `route.enabled` | pre-loop tier + complexity + per-turn threshold |
| `review.enabled` | post-tool correctness/complexity/security scores |
| `untrusted.enabled` | Jev confirmation of injection markers (markers are always recorded) |
| `compaction.enabled` | Jev checklist + audit inside compaction |
| `shadow` | evaluate, log and inject, but never block, ask or alter a result |
| `rules` | verbatim non-codifiable rules injected each turn |

Rollout: enable with `shadow: true` to measure the guard without consequences,
inspect `jev guard decision` logs, then set `shadow: false`. Rollback is setting the
section's `enabled` to `false` (or `shadow: true`) — no code change, because a
disabled section renders a byte-identical prompt and an unchanged tool result.
