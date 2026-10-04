/**
 * QA guardrails — budgets, browser circuit-breaker, context pressure, finish diagnostics.
 * Run: bun test src/session/qa-guardrails.test.ts
 */
import { describe, expect, test } from "bun:test"
import {
  BROWSER_TOOL_IDS,
  QA_DEFAULT_TOOLS,
  browserCircuit,
  checkQaBudgets,
  diagnoseFinish,
  isQaToolAllowed,
  resolveQaBudget,
} from "./qa-guardrails"

describe("qa-guardrails.resolveQaBudget", () => {
  test("stays unbounded when nothing is configured", () => {
    expect(resolveQaBudget({}, {})).toEqual({})
  })

  test("explicit agent config wins over env", () => {
    const out = resolveQaBudget(
      { steps: 50, budgetMinutes: 15 },
      { OPENCODE_QA_STEPS: "40", OPENCODE_QA_BUDGET_MINUTES: "10", OPENCODE_QA_MAX_COST: "5" },
    )
    expect(out).toEqual({ steps: 50, budgetMinutes: 15, maxCost: 5 })
  })

  test("env provides a configurable ceiling without an implicit default", () => {
    const out = resolveQaBudget({}, { OPENCODE_QA_STEPS: "60", OPENCODE_QA_BUDGET_MINUTES: "20" })
    expect(out).toEqual({ steps: 60, budgetMinutes: 20 })
  })
})

describe("qa-guardrails.checkQaBudgets", () => {
  test("step budget stops with an observable reason", () => {
    const out = checkQaBudgets({ step: 50, steps: 50 })
    expect(out.stopped).toBe(true)
    expect(out.reason).toBe("step-limit")
    expect(out.detail).toContain("step")
  })

  test("wall-clock budget stops with an observable reason", () => {
    const out = checkQaBudgets({ step: 1, startedAt: 0, now: 16 * 60_000, budgetMinutes: 15 })
    expect(out.stopped).toBe(true)
    expect(out.reason).toBe("wall-clock")
  })

  test("cost budget stops with an observable reason", () => {
    const out = checkQaBudgets({ step: 1, cost: 5.1, maxCost: 5 })
    expect(out.stopped).toBe(true)
    expect(out.reason).toBe("cost-limit")
  })

  test("no budget means no stop", () => {
    expect(checkQaBudgets({ step: 10_000 }).stopped).toBe(false)
  })
})

describe("qa-guardrails.browserCircuit", () => {
  test("trips after three consecutive browser timeouts", () => {
    let state = browserCircuit.init()
    for (const at of [1, 2, 3]) {
      state = browserCircuit.record(state, { tool: "take_screenshot", timeout: true, ok: false, at })
    }
    expect(browserCircuit.tripped(state)).toBe(true)
    expect(browserCircuit.reason(state)).toContain("timeout")
  })

  test("does not trip on isolated failures", () => {
    let state = browserCircuit.init()
    state = browserCircuit.record(state, { tool: "click", timeout: true, ok: false, at: 1 })
    state = browserCircuit.record(state, { tool: "take_snapshot", timeout: false, ok: true, at: 2 })
    expect(browserCircuit.tripped(state)).toBe(false)
  })
})

describe("qa-guardrails tool scope", () => {
  test("browser tools are in scope, writes are out by default", () => {
    for (const tool of BROWSER_TOOL_IDS) expect(isQaToolAllowed(tool)).toBe(true)
    expect(isQaToolAllowed("read")).toBe(true)
    expect(isQaToolAllowed("write")).toBe(false)
    expect(isQaToolAllowed("edit")).toBe(false)
    expect(QA_DEFAULT_TOOLS).toContain("take_snapshot")
  })
})

describe("qa-guardrails.diagnoseFinish", () => {
  test("zero-token unknown finish is never silent", () => {
    const text = diagnoseFinish({ finish: "unknown", input: 0, output: 0, cost: 0, durationMs: 14_826 })
    expect(text).toContain("unknown")
    expect(text.length).toBeGreaterThan(20)
  })

  test("normal tool-calls finish stays quiet", () => {
    expect(diagnoseFinish({ finish: "tool-calls", input: 10, output: 5, cost: 0.01, durationMs: 100 })).toBe("")
  })
})
