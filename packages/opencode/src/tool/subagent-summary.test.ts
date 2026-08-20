import { describe, expect, test } from "bun:test"
import { boundSubagentResult, subagentResultPolicy, LEAN_SUBAGENT_CONTRACT, SUBAGENT_RESULT_CONTRACT } from "./subagent-summary"

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

  test("lean parent automatically gives every child the compact Lean policy", () => {
    const lean = subagentResultPolicy("lean", false)
    expect(lean.contract).toBe(LEAN_SUBAGENT_CONTRACT)
    expect(lean.maxChars).toBe(4_000)
    expect(lean.contract).toContain("inspect_batch")
    expect(lean.contract).toContain("independent")
    expect(lean.contract).toContain("residual")
    expect(lean.contract).toContain("8 actions")
    expect(lean.contract).toContain("2,000 characters")
    expect(lean.contract).toContain("workspace fingerprint")
    expect(lean.contract).toContain("one coherent initial patch")
    expect(lean.contract).toContain("full terminal output")
    expect(subagentResultPolicy("build", false)).toEqual({ contract: "", maxChars: undefined })
    expect(subagentResultPolicy("build", true)).toEqual({ contract: SUBAGENT_RESULT_CONTRACT, maxChars: 12_000 })
  })

  test("contract requires causal evidence and sticky finding status", () => {
    expect(SUBAGENT_RESULT_CONTRACT).toContain("evidence")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("CLOSED")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("RESIDUAL")
  })
})
