import { describe, expect, test } from "bun:test"
import { subagentResultPolicy, LEAN_SUBAGENT_CONTRACT, SUBAGENT_RESULT_CONTRACT } from "./subagent-summary"

describe("subagent result contracts", () => {
  test("lean parent gives every child the Lean policy without a result-size limit", () => {
    const lean = subagentResultPolicy("lean", false)
    expect(lean).toEqual({ contract: LEAN_SUBAGENT_CONTRACT })
    expect(lean.contract).toContain("inspect_batch")
    expect(lean.contract).toContain("independent")
    expect(lean.contract).toContain("residual")
    expect(lean.contract).toContain("8 actions")
    expect(lean.contract).toContain("2,000 characters")
    expect(lean.contract).toContain("workspace fingerprint")
    expect(lean.contract).toContain("one coherent initial patch")
    expect(lean.contract).toContain("full terminal output")
    expect(subagentResultPolicy("build", false)).toEqual({ contract: "" })
    expect(subagentResultPolicy("build", true)).toEqual({ contract: SUBAGENT_RESULT_CONTRACT })
  })

  test("contract requires causal evidence and sticky finding status", () => {
    expect(SUBAGENT_RESULT_CONTRACT).toContain("evidence")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("CLOSED")
    expect(SUBAGENT_RESULT_CONTRACT).toContain("RESIDUAL")
  })
})
