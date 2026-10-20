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
})
