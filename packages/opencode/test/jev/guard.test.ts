import { describe, expect, test } from "bun:test"
import { JevGuard } from "@/jev/guard"

describe("jev.guard", () => {
  test("allows a confident, unflagged answer", () => {
    const assessment = JevGuard.assess({ confidence: 0.97 })
    expect(assessment.verdict).toBe("allow")
    expect(assessment.confidence).toBe(0.97)
    expect(assessment.reason).toContain("confident and not flagged")
  })

  test("escalates an answer below the default threshold", () => {
    const assessment = JevGuard.assess({ confidence: 0.42 })
    expect(assessment.verdict).toBe("escalate")
    expect(assessment.reason).toContain("0.42")
    expect(assessment.reason).toContain("0.80")
  })

  test("escalates an answer flagged as destructive even when confident", () => {
    const assessment = JevGuard.assess({ confidence: 0.99, noul: true })
    expect(assessment.verdict).toBe("escalate")
    expect(assessment.reason).toContain("destructive")
  })

  test("treats a confidence equal to the threshold as sufficient", () => {
    expect(JevGuard.assess({ confidence: JevGuard.DEFAULT_THRESHOLD }).verdict).toBe("allow")
  })

  test("honours a caller supplied threshold", () => {
    expect(JevGuard.assess({ confidence: 0.6 }, 0.5).verdict).toBe("allow")
    expect(JevGuard.assess({ confidence: 0.6 }, 0.9).verdict).toBe("escalate")
  })

  test("screens risky permissions by default", () => {
    expect(JevGuard.DEFAULT_PERMISSIONS).toEqual(["write", "shell", "workspace_handoff"])
  })
})
