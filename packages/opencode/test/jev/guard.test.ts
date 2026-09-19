import { describe, expect, test } from "bun:test"
import { JevGuard } from "@/jev/guard"

describe("jev.guard", () => {
  test("allows an action the model finds unlikely to be risky", () => {
    const assessment = JevGuard.assess(0.02)
    expect(assessment.verdict).toBe("allow")
    expect(assessment.probability).toBe(0.02)
    expect(assessment.reason).toContain("2.0%")
  })

  test("escalates an action the model finds likely to be risky", () => {
    const assessment = JevGuard.assess(0.93)
    expect(assessment.verdict).toBe("escalate")
    expect(assessment.reason).toContain("93.0%")
    expect(assessment.reason).toContain("0.50")
  })

  test("treats a probability at the threshold as risky", () => {
    expect(JevGuard.assess(JevGuard.DEFAULT_THRESHOLD).verdict).toBe("escalate")
  })

  test("honours a caller supplied threshold", () => {
    expect(JevGuard.assess(0.6, 0.7).verdict).toBe("allow")
    expect(JevGuard.assess(0.6, 0.5).verdict).toBe("escalate")
  })

  test("screens risky permissions by default", () => {
    expect(JevGuard.DEFAULT_PERMISSIONS).toEqual(["write", "shell", "workspace_handoff"])
  })
})
