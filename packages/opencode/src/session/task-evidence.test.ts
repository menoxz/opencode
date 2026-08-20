import { describe, expect, test } from "bun:test"
import { buildTaskEvidencePacket } from "./task-evidence"

describe("task evidence packet", () => {
  test("is bounded, deterministic, and preserves sticky findings and gaps", () => {
    const findings = Array.from({ length: 70 }, (_, i) => ({
      id: `SEC-${i}`, severity: i === 69 ? "critical" : "medium", status: i === 69 ? "open" : "closed",
      summary: `finding ${i}`, evidence: [`proof ${i}`], firstSeenAt: i + 1, updatedAt: i + 1,
    }))
    const goalState = {
      findings,
      completion: { summary: "x".repeat(2000), evidence: [{ dod: "tests", proof: "exit 0" }], unverified: [{ dod: "ui", reason: "not run" }], completedAt: 2 },
    }
    const first = buildTaskEvidencePacket({ taskCallID: "call-1", revision: 1, parentSessionID: "parent", childSessionID: "child", state: "partial", text: "tail", goalState } as any)
    const second = buildTaskEvidencePacket({ taskCallID: "call-1", revision: 1, parentSessionID: "parent", childSessionID: "child", state: "partial", text: "tail", goalState } as any)
    expect(first).toEqual(second)
    expect(first.id).toBe("call-1:1")
    expect(first.summary.length).toBeLessThanOrEqual(1000)
    expect(first.findings).toHaveLength(64)
    expect(first.findings.some((item) => item.id === "SEC-69" && item.status === "open")).toBe(true)
    expect(first.residuals).toEqual([{ id: "UNVERIFIED-1", summary: "ui", reason: "not run" }])
    expect(first.omissions).toContainEqual({ section: "findings", omitted: 6, reason: "limit" })
  })
})
