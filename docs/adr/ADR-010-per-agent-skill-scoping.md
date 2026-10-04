# ADR-010: Per-Agent Skill Scoping

## Status
**Accepted** — 2026-06-29

## Context
Skills are globally discovered and, by default, every agent can see and load
every skill. For specialized agents (e.g. a "restaurant" agent, a "linkedin"
agent) this is noisy and unsafe: the system prompt lists skills the agent will
never use, and an agent can load a skill outside its remit.

The task contract asked for a way to **bind specific skills to an agent from its
configuration**, so a specialized agent only has access to the skills it needs —
while preserving today's behavior (access to all skills) when nothing is
declared.

### Key discovery: the runtime filter already exists
The filtering machinery was already in place before this change:

- `Skill.available(agent)` (`skill/index.ts`) filters the skill list via
  `Permission.evaluate("skill", skill.name, agent.permission).action !== "deny"`.
- It is consumed in `session/system.ts` (`SystemPrompt.skills`, behind a
  `Permission.disabled(["skill"])` gate), in the tool registry count, and in
  `todo.ts`.
- `skill` is already a first-class permission key (`config/permission.ts`
  `InputObject`), so wildcard `allow`/`ask`/`deny` rules on skill **names** are
  already evaluated by the standard permission matcher.

So no new runtime mechanism was needed. The only missing piece was an
**ergonomic config surface** that compiles down to those `permission.skill`
rules.

## Decision

### A. Add an ergonomic `skills` whitelist to the agent schema
`packages/opencode/src/config/agent.ts`:

- New optional field `skills: Schema.optional(Schema.Array(Schema.String))` on
  `AgentSchema`, with a description documenting names/wildcards and the
  "omit = all skills" default.
- `"skills"` added to `KNOWN_KEYS` so it is treated as a recognized agent key
  (not passed through as rest/unknown).

This works identically for `opencode.json`-defined agents and `.md`
frontmatter-defined agents, because both resolve through `ConfigAgent.Info`.

### B. Translate `skills` into `permission.skill` rules at assembly time
In `normalize()` (the `Schema.decodeTo` transform on the agent schema), a
`skills` whitelist `["a", "b-*"]` is translated into:

```
permission.skill = { "*": "deny", "a": "allow", "b-*": "allow" }
```

This mirrors the **existing** `tools → permission` translation already present in
`normalize()`. The pattern is: deny everything via `*`, then re-allow each listed
name/pattern.

Ordering matters and is exploited deliberately:

- `PermissionV2.evaluate` (`core/permission.ts`) is **`findLast`** — the last
  rule whose key matches wins.
- `Permission.fromConfig` (`permission/index.ts`) **preserves config key order**.
- Therefore `{ "*": "deny", "a": "allow" }` evaluates to `allow` for `a` and
  `deny` for everything else (`*` is the fallback via `Wildcard.match`).

### C. Explicit `permission.skill` always wins
The translated rules are written **before** `Object.assign(permission,
agent.permission)`, so a user who sets `permission.skill` explicitly overrides
the `skills` sugar entirely. Power users keep full, unambiguous control.

### D. Type-safety fix in the hot config path
Adding `skills` (a `readonly string[]` schema field) surfaced a latent
readonly/mutable mismatch at the raw `mergeDeep(...)` calls in `config.ts`
(`result.agent = mergeDeep(...)`), where the assembled `Info` is `DeepMutable`
but `ConfigAgent.Info` is readonly. Fixed by casting the merge result
(`as typeof result.agent`), consistent with the existing `mergeConfig(...) as
Info` wrapper that intentionally keeps remeda's conditional merge type out of the
hot config-loading path. No runtime behavior change.

## Resolution Chain (verified)
```
agent config: { skills: ["restaurant-*"] }
  → normalize()  → permission.skill = { "*": "deny", "restaurant-*": "allow" }
  → Permission.fromConfig (key order preserved)
  → Skill.available(agent):
       Permission.evaluate("skill", "restaurant-design-api", perm) = allow  → shown
       Permission.evaluate("skill", "github-webhooks",        perm) = deny   → hidden
  → SystemPrompt.skills lists only the allowed skills
```

## Semantics summary
| Config | Effect |
|--------|--------|
| field omitted | all skills available (back-compat default) |
| `skills: ["a", "b-*"]` | only `a` and `b-*` matches available |
| `skills: []` | no skills available (explicit "none") |
| listed name that doesn't exist | inert — never matches a real skill |
| `permission.skill` set explicitly | overrides `skills` entirely |

## Verification
`packages/opencode/test/agent/agent.test.ts` adds focused tests:

1. whitelist restricts to listed skills (others hidden);
2. wildcard patterns (`restaurant-*`) match;
3. omitting the field grants access to all skills (back-compat);
4. empty array hides every skill;
5. a non-existent name in the whitelist is inert;
6. explicit `permission.skill` overrides the `skills` field.

All pass. `bun run typecheck --filter=opencode` is clean.

## Consequences

### Positive
- Specialized agents can be scoped to exactly their skills from a single,
  readable config field.
- Zero new runtime code: reuses the audited `permission.skill` →
  `Skill.available` pipeline, so behavior is consistent with every other
  permission key (wildcards, precedence, `disabled`).
- Fully back-compatible: omitting the field changes nothing.
- Works for both `opencode.json` and `.md` agents through one schema change.

### Negative
- The sugar is expressed as `permission.skill` rules, so a user inspecting the
  resolved permission set sees `{ "*": "deny", ... }` rather than the original
  `skills` list. This is the same trade-off the existing `tools → permission`
  translation already makes.

## Files Changed
| File | Change |
|------|--------|
| `packages/opencode/src/config/agent.ts` | `skills` schema field + `KNOWN_KEYS` + `normalize()` translation to `permission.skill` |
| `packages/opencode/src/config/config.ts` | cast raw `mergeDeep` agent merges to satisfy readonly→mutable in the hot path |
| `packages/opencode/test/agent/agent.test.ts` | per-agent skill scoping tests |

## Extension Point
The seam for future work is `normalize()` in `config/agent.ts`: any richer
skill-binding policy (groups, deny-lists, inheritance from a parent agent) should
compile down to `permission.skill` rules there, keeping `Skill.available` and the
permission matcher as the single runtime authority.
