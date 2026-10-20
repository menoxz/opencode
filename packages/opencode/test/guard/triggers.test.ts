import { describe, expect, test } from "bun:test"
import {
  compileGuard,
  GuardDefinitionError,
  selectGuards,
  shouldInject,
  type CompiledGuard,
  type GuardState,
} from "../../src/guard/triggers"

function state(overrides: Partial<GuardState> = {}): GuardState {
  return {
    step: 1,
    turn: 1,
    stepsInTurn: 1,
    toolCallsInTurn: 0,
    tokensSinceLastGuard: 0,
    contextRatio: 0.1,
    afterCompaction: false,
    errorStreak: 0,
    repeatAction: 0,
    turnsSinceInjection: 0,
    paths: [],
    ...overrides,
  }
}

function guard(name: string, when: Record<string, unknown>, body = "consigne"): CompiledGuard {
  return compileGuard({ name, body, when })
}

describe("guard triggers", () => {
  test("a numeric comparison fires only when satisfied", () => {
    const g = guard("delegate", { tool_calls_in_turn: ">= 4" })
    expect(shouldInject(g, state({ toolCallsInTurn: 3 })).inject).toBe(false)
    expect(shouldInject(g, state({ toolCallsInTurn: 4 })).inject).toBe(true)
  })

  test("the reason carries the observed value, not just the threshold", () => {
    const verdict = shouldInject(guard("delegate", { tool_calls_in_turn: ">= 4" }), state({ toolCallsInTurn: 7 }))
    expect(verdict.reasons).toEqual(["tool_calls_in_turn>=4 (7)"])
  })

  test("several conditions are ANDed", () => {
    const g = guard("both", { tool_calls_in_turn: ">= 4", context_ratio: ">= 0.65" })
    expect(shouldInject(g, state({ toolCallsInTurn: 5, contextRatio: 0.3 })).inject).toBe(false)
    expect(shouldInject(g, state({ toolCallsInTurn: 5, contextRatio: 0.7 })).inject).toBe(true)
  })

  test("a boolean trigger reads the flag", () => {
    const g = guard("after-compact", { after_compaction: true })
    expect(shouldInject(g, state({ afterCompaction: false })).inject).toBe(false)
    expect(shouldInject(g, state({ afterCompaction: true })).inject).toBe(true)
  })

  test("a boolean trigger also accepts the frontmatter spelling", () => {
    expect(shouldInject(guard("b", { after_compaction: "= true" }), state({ afterCompaction: true })).inject).toBe(true)
  })

  test("path_match selects the guards that concern the files in play", () => {
    const g = guard("webui", { path_match: "**/*.tsx" })
    expect(shouldInject(g, state({ paths: ["packages/opencode/src/skill/index.ts"] })).inject).toBe(false)
    expect(shouldInject(g, state({ paths: ["packages/webui/src/app.tsx"] })).inject).toBe(true)
  })

  test("an enum trigger restricts the guard to one agent", () => {
    const g = guard("plan-only", { agent: "plan" })
    expect(shouldInject(g, state({ agent: "build" })).inject).toBe(false)
    expect(shouldInject(g, state({ agent: "plan" })).inject).toBe(true)
  })

  test("an unknown trigger is refused, naming the known ones", () => {
    expect(() => guard("bad", { nombre_de_steps: ">= 3" })).toThrow(GuardDefinitionError)
    expect(() => guard("bad", { nombre_de_steps: ">= 3" })).toThrow(/unknown trigger "nombre_de_steps"/)
  })

  test("a comparison that cannot be parsed is refused", () => {
    expect(() => guard("bad", { tool_calls_in_turn: "beaucoup" })).toThrow(/expects a comparison/)
  })

  test("a guard without any trigger is refused", () => {
    expect(() => guard("empty", {})).toThrow(/no trigger/)
  })

  test("selection prefers the more predictive trigger", () => {
    const late = guard("tool-calls", { tool_calls_in_turn: ">= 1" }, "AAAA")
    const tokens = guard("tokens", { since_last_tokens: ">= 1" }, "BBBB")
    const { selected } = selectGuards([late, tokens], state({ toolCallsInTurn: 9, tokensSinceLastGuard: 9 }))
    expect(selected.map((entry) => entry.guard.name)).toEqual(["tokens", "tool-calls"])
  })

  test("selection honours the count cap and reports what it dropped", () => {
    const first = guard("tokens", { since_last_tokens: ">= 1" }, "AAAA")
    const second = guard("context", { context_ratio: ">= 0.1" }, "BBBB")
    const { selected, skipped } = selectGuards([first, second], state({ tokensSinceLastGuard: 9 }), { max: 1 })
    expect(selected).toHaveLength(1)
    expect(selected[0]?.guard.name).toBe("tokens")
    expect(skipped.some((entry) => entry.name === "context")).toBe(true)
  })

  test("selection honours the character budget", () => {
    const big = guard("tokens", { since_last_tokens: ">= 1" }, "x".repeat(700))
    const { selected, skipped } = selectGuards([big], state({ tokensSinceLastGuard: 9 }), { maxChars: 600 })
    expect(selected).toHaveLength(0)
    expect(skipped.some((entry) => entry.name === "tokens")).toBe(true)
  })

  test("a guard that does not fire is never selected", () => {
    const g = guard("tokens", { since_last_tokens: ">= 1000" }, "AAAA")
    expect(selectGuards([g], state({ tokensSinceLastGuard: 10 })).selected).toHaveLength(0)
  })

  test("max_per_turn stops a guard that already fired its quota", () => {
    const g = compileGuard({
      name: "quota",
      body: "AAAA",
      when: { since_last_tokens: ">= 1" },
      limits: { max_per_turn: 2 },
    })
    const under = selectGuards([g], state({ tokensSinceLastGuard: 9, firedThisTurn: { quota: 1 } }))
    expect(under.selected).toHaveLength(1)

    const atQuota = selectGuards([g], state({ tokensSinceLastGuard: 9, firedThisTurn: { quota: 2 } }))
    expect(atQuota.selected).toHaveLength(0)
    expect(atQuota.skipped.some((entry) => entry.name === "quota")).toBe(true)
  })

  test("a guard without limits is only bounded by the step budget", () => {
    const g = guard("free", { since_last_tokens: ">= 1" }, "AAAA")
    const { selected } = selectGuards([g], state({ tokensSinceLastGuard: 9, firedThisTurn: { free: 99 } }))
    expect(selected).toHaveLength(1)
  })

  test("an unknown limit is refused, naming the known one", () => {
    expect(() =>
      compileGuard({ name: "bad", body: "x", when: { since_last_tokens: ">= 1" }, limits: { par_session: 3 } }),
    ).toThrow(/unknown limit "par_session" \(known: max_per_turn\)/)
  })

  test("a non-integer max_per_turn is refused", () => {
    expect(() =>
      compileGuard({ name: "bad", body: "x", when: { since_last_tokens: ">= 1" }, limits: { max_per_turn: 0 } }),
    ).toThrow(/expects an integer >= 1/)
  })

  // Couverture des dix déclencheurs de la spec : chacun doit être accepté au chargement ET tirer sur
  // un état construit pour lui. Sans ce test, « implémenté » signifierait seulement « parsé ».
  test("every trigger of the spec compiles and fires on its own state", () => {
    const cases: { key: string; value: unknown; state: Partial<GuardState> }[] = [
      { key: "since_last_tokens", value: ">= 100", state: { tokensSinceLastGuard: 200 } },
      { key: "context_ratio", value: ">= 0.5", state: { contextRatio: 0.7 } },
      { key: "after_compaction", value: true, state: { afterCompaction: true } },
      { key: "tool_calls_in_turn", value: ">= 3", state: { toolCallsInTurn: 4 } },
      { key: "error_streak", value: ">= 2", state: { errorStreak: 2 } },
      { key: "repeat_action", value: ">= 2", state: { repeatAction: 2 } },
      { key: "steps_in_turn", value: ">= 5", state: { stepsInTurn: 5 } },
      { key: "path_match", value: "**/*.tsx", state: { paths: ["src/app.tsx"] } },
      { key: "turns_since_injection", value: ">= 3", state: { turnsSinceInjection: 3 } },
      { key: "agent", value: "plan", state: { agent: "plan" } },
    ]
    expect(cases).toHaveLength(10)
    for (const item of cases) {
      const g = guard("g-" + item.key, { [item.key]: item.value })
      const verdict = shouldInject(g, state(item.state))
      expect({ key: item.key, inject: verdict.inject }).toEqual({ key: item.key, inject: true })
    }
  })
})
