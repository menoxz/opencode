import { describe, expect, test } from "bun:test"
import { formatGoalContext } from "./compaction"

describe("sticky goal context", () => {
  test("keeps findings and completion gaps visible after completion", () => {
    const context = formatGoalContext({
      status: "completed", source: "user", goal: "Ship safely", dod: ["secure"], outOfScope: [], version: 2, updatedAt: 2,
      findings: [{ id: "SEC-001", severity: "high", status: "residual", summary: "tenant filter pending", evidence: ["audit"], firstSeenAt: 1, updatedAt: 2 }],
      completion: { summary: "functional work done", evidence: [{ dod: "secure", proof: "test 4/4 exit 0" }], unverified: [{ dod: "load", reason: "environment unavailable" }], completedAt: 2 },
    } as any)
    expect(context).toContain("SUMMARY: functional work done")
    expect(context).toContain("FINDING SEC-001 [high/residual]")
    expect(context).toContain("UNVERIFIED: load")
  })
})