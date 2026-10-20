import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Guard } from "../../src/guard"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Le fixture de répertoire temporaire résout un ChildProcessSpawner même sans `git: true` : sans ce
// layer, chaque test échoue sur « Service not found » avant d'atteindre le service.
const it = testEffect(Layer.mergeAll(Guard.defaultLayer, CrossSpawnSpawner.defaultLayer))

const valid = (name: string, when: string, body = "consigne") =>
  `---\nname: ${name}\ndescription: Une garde de test.\nwhen:\n${when}\n---\n\n${body}\n`

describe("guard discovery", () => {
  it.live("discovers a guard from .opencode/guards", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Bun.write(path.join(dir, ".opencode", "guards", "delegate.md"), valid("delegate", "  tool_calls_in_turn: \">= 4\"")),
        )
        const guard = yield* Guard.Service
        const guards = yield* guard.all()
        expect(guards.map((entry) => entry.name)).toContain("delegate")
        expect((yield* guard.errors()).length).toBe(0)
      }),
    ),
  )

  it.live("keeps an invalid guard out of the catalog but reports why", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Bun.write(
            path.join(dir, ".opencode", "guards", "broken.md"),
            valid("broken", '  nombre_de_steps: ">= 3"'),
          ),
        )
        const guard = yield* Guard.Service
        expect(yield* guard.get("broken")).toBeUndefined()
        const errors = yield* guard.errors()
        expect(errors.length).toBe(1)
        expect(errors[0]?.message).toContain("unknown trigger")
      }),
    ),
  )

  it.live("reports a guard file without a name instead of dropping it silently", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Bun.write(
            path.join(dir, ".opencode", "guards", "nameless.md"),
            `---\ndescription: sans nom\nwhen:\n  tool_calls_in_turn: ">= 4"\n---\n\nnope\n`,
          ),
        )
        const guard = yield* Guard.Service
        expect((yield* guard.all()).map((entry) => entry.name)).not.toContain(undefined)
        const errors = yield* guard.errors()
        expect(errors.some((entry) => entry.message.includes("missing name"))).toBe(true)
      }),
    ),
  )

  it.live("a guard created after boot enters the catalog after reload", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const guard = yield* Guard.Service
        expect(yield* guard.get("late-guard")).toBeUndefined()

        yield* Effect.promise(() =>
          Bun.write(
            path.join(dir, ".opencode", "guards", "late-guard.md"),
            valid("late-guard", '  since_last_tokens: ">= 20000"'),
          ),
        )

        yield* guard.reload()
        expect(yield* guard.get("late-guard")).toBeDefined()
      }),
    ),
  )

  it.live("a guard without any trigger is refused, not fired every step", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Bun.write(path.join(dir, ".opencode", "guards", "empty.md"), `---\nname: empty\nwhen: {}\n---\n\nnoop\n`),
        )
        const guard = yield* Guard.Service
        expect(yield* guard.get("empty")).toBeUndefined()
        expect((yield* guard.errors()).some((entry) => entry.message.includes("no trigger"))).toBe(true)
      }),
    ),
  )
})
