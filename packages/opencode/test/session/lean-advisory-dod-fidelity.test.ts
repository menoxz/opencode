import { describe, expect, test } from "bun:test"
import { buildRiskAdvisory } from "../../src/session/lean-advisory"

const SENTINELS = ["DOD_SENTINEL_ALPHA", "DOD_SENTINEL_BETA"]

// Each discriminating assertion lives in its own block: bun aborts a test on its
// first failing expect(), so grouping them would report one red instead of six.
// The assertions themselves are verbatim those of P05 §7.
describe("risk advisory DoD fidelity", () => {
  test("no longer restates the text of the first DoD item", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).not.toContain("DOD_SENTINEL_ALPHA")
  })

  test("no longer restates the text of the second DoD item", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).not.toContain("DOD_SENTINEL_BETA")
  })

  test("emits no per-item mandatory requirement line", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text.match(/^- mandatory requirement: /gm) ?? []).toHaveLength(0)
  })

  test("keeps a reference to the canonical carrier", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).toContain("<task-contract>")
  })

  test("keeps the DoD item count of the canonical carrier", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).toContain("2 DoD item(s)")
  })

  test("keeps the per-item proof instruction", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).toContain("its own verifiable proof")
  })

  test("preserves the volatile half and the default behaviour", () => {
    expect(
      buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, ["SEC-001 HIGH OPEN: tenant filter missing"]),
    ).toContain("SEC-001 HIGH OPEN")
    expect(buildRiskAdvisory({ goal: "Ship safely", dod: [] }, [])).toBe("")
  })
})