/**
 * Tests for Eval Framework (Phase 6).
 * Run: bun test src/eval/eval.test.ts
 */

import { describe, it, expect } from "bun:test"
import {
  getScenario,
  getSuite,
  listScenarios,
  ALL_SCENARIOS,
  ALL_SUITES,
  type EvalScenario,
} from "./scenario"

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

describe("EvalScenario definitions", () => {
  it("should have all 8 built-in scenarios", () => {
    expect(Object.keys(ALL_SCENARIOS).length).toBe(8)
  })

  it("should have 3 built-in suites", () => {
    expect(Object.keys(ALL_SUITES).length).toBe(3)
  })

  it("should find hello-world scenario", () => {
    const s = getScenario("hello-world")
    expect(s).toBeDefined()
    expect(s!.name).toBe("Hello World")
    expect(s!.category).toBe("code-generation")
    expect(s!.difficulty).toBe("easy")
  })

  it("should find full suite with all scenarios", () => {
    const suite = getSuite("full")
    expect(suite).toBeDefined()
    expect(suite!.scenarios.length).toBe(8)
  })

  it("should filter scenarios by difficulty", () => {
    const easy = listScenarios({ difficulty: "easy" })
    expect(easy.length).toBe(3) // hello-world, fix-syntax-error, refactor-to-arrow
  })

  it("should filter scenarios by category", () => {
    const debugging = listScenarios({ category: "debugging" })
    expect(debugging.length).toBe(1)
    expect(debugging[0].id).toBe("debug-memory-leak")
  })
})

// ---------------------------------------------------------------------------
// Auto-evaluation logic (test the concept independently)
// ---------------------------------------------------------------------------

describe("auto-evaluation concept", () => {
  it("should detect required keywords in output", () => {
    const scenario = getScenario("hello-world")!
    const output = "Created file hello_eval.py with Hello, Eval Framework!"
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredKeywords).toBeDefined()
    // Check at least one keyword is found
    const found = behavior.requiredKeywords!.filter((kw) =>
      output.toLowerCase().includes(kw.toLowerCase()),
    )
    expect(found.length).toBeGreaterThan(0)
  })

  it("should fail when keywords are missing from output", () => {
    const scenario = getScenario("hello-world")!
    const output = "Some irrelevant output"
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredKeywords).toBeDefined()
    const found = behavior.requiredKeywords!.filter((kw) =>
      output.toLowerCase().includes(kw.toLowerCase()),
    )
    expect(found.length).toBe(0)
  })

  it("should detect required actions in tool calls", () => {
    const scenario = getScenario("hello-world")!
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredActions).toBeDefined()
    const toolCalls = ["write", "read"]
    const actionsFound = behavior.requiredActions!.filter((a) =>
      toolCalls.some((t) => t.includes(a)),
    )
    expect(actionsFound.length).toBeGreaterThan(0)
  })

  it("should detect anti-patterns in output", () => {
    const scenario = getScenario("code-review-simple")!
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.antiPatterns).toBeDefined()
    const output = "This code looks fine to me, no issues"
    const found = behavior.antiPatterns!.filter((ap) =>
      output.toLowerCase().includes(ap.toLowerCase()),
    )
    expect(found.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe("Scenario metrics", () => {
  it("should correctly compute pass rate from results", () => {
    const results = [
      { success: true, durationMs: 100, tokensUsed: 100, toolCalls: 2, errors: [] },
      { success: true, durationMs: 200, tokensUsed: 200, toolCalls: 3, errors: [] },
      { success: false, durationMs: 300, tokensUsed: 300, toolCalls: 1, errors: ["error"] },
    ]
    const passed = results.filter((r) => r.success).length
    const passRate = passed / results.length
    expect(passRate).toBe(2 / 3)
    expect(passed).toBe(2)
  })

  it("should compute average metrics", () => {
    const durations = [100, 200, 300]
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length
    expect(avg).toBe(200)
  })
})

console.log("✅ Eval tests ready!")
