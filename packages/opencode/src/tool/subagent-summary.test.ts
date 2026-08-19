import { describe, expect, test } from "bun:test"
import { boundSubagentResult, SUBAGENT_RESULT_CONTRACT } from "./subagent-summary"

describe("bounded subagent results", () => {
  test("keeps short results unchanged", () => {
    expect(boundSubagentResult("done", 1000)).toEqual({ text: "done", truncated: false, sticky: [] })
  })

  test("bounds long prose while preserving sticky findings and the conclusion", () => {
    const text = [
      "A".repeat(5000),
      "SEC-001 HIGH OPEN: cross-tenant filter is missing",
      "RESIDUAL: DELETE still returns 500",
      "final conclusion: implementation is partial",
    ].join("\n")
    const result = boundSubagentResult(text, 1200)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(1400)
    expect(result.text).toContain("SEC-001 HIGH OPEN")
    expect(result.text).toContain("RESIDUAL")
    expect(result.text).toContain("final conclusion")
    expect(result.sticky).toEqual([
      "SEC-001 HIGH OPEN: cross-tenant filter is missing",
      "RESIDUAL: DELETE still returns 500",
    ])
  })

  test("contract requires causal evidence and sticky finding status", () => {
    expect(SUBAGENT_RESULT_CONTRACT).toContain("evidence")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("CLOSED")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("RESIDUAL")
  })
})
