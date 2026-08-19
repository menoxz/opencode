import { describe, expect, test } from "bun:test"
import { buildQaProofAdvisory, buildRiskAdvisory } from "./lean-advisory"

describe("Lean advisories", () => {
  test("precompiles real UI proof in UI-network-persistence-security order", () => {
    const text = buildQaProofAdvisory({
      goal: "Validate the real browser journey",
      dod: ["UI visible", "HTTP request succeeds", "database persistence confirmed", "security audit passes"],
    })
    expect(text).toContain("UI → network → persistence → security → stop")
    expect(text.indexOf("UI evidence")).toBeLessThan(text.indexOf("Network evidence"))
    expect(text.indexOf("Network evidence")).toBeLessThan(text.indexOf("Persistence evidence"))
    expect(text.indexOf("Persistence evidence")).toBeLessThan(text.indexOf("Security evidence"))
  })

  test("does not prescribe a browser journey for non-UI work", () => {
    expect(buildQaProofAdvisory({ goal: "Refactor parser", dod: ["unit tests pass"] })).toBe("")
  })

  test("risk advisory remains non-scoring and keeps open findings sticky", () => {
    const text = buildRiskAdvisory(
      { goal: "Ship safely", dod: ["security audit passes"] },
      ["SEC-001 HIGH OPEN: tenant filter missing"],
    )
    expect(text).toContain("SEC-001 HIGH OPEN")
    expect(text).toContain("advisory only")
    expect(text).not.toContain("score")
  })
})
