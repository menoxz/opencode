/**
 * Boundary of the agent loop's step budget.
 *
 * The loop used to fall back to an implicit ceiling of 50 iterations when an
 * agent declared no `steps`, which silently cut long autonomous runs. The budget
 * is now opt-in: only an explicitly configured `agent.steps` stops the loop.
 *
 * Run: bun test src/session/step-limit.test.ts
 */
import { describe, expect, test } from "bun:test"
import { reachedStepLimit } from "./prompt"

describe("session.prompt.reachedStepLimit", () => {
  test("an unconfigured budget never stops the loop", () => {
    expect(reachedStepLimit(0, undefined)).toBe(false)
    expect(reachedStepLimit(50, undefined)).toBe(false)
    expect(reachedStepLimit(51, undefined)).toBe(false)
    expect(reachedStepLimit(10_000, undefined)).toBe(false)
  })

  test("a configured budget stops on the step that reaches it", () => {
    expect(reachedStepLimit(49, 50)).toBe(false)
    expect(reachedStepLimit(50, 50)).toBe(true)
    expect(reachedStepLimit(51, 50)).toBe(true)
  })

  test("a budget of zero stops immediately", () => {
    expect(reachedStepLimit(0, 0)).toBe(true)
  })
})
