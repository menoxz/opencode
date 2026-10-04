import { describe, expect, test } from "bun:test"
import { mergeGoalFindings, type GoalFinding } from "./goal-evidence"

const open: GoalFinding = {
  id: "SEC-001", severity: "high", status: "open", summary: "tenant filter missing",
  evidence: ["audit ses_a"], firstSeenAt: 1, updatedAt: 1,
}

describe("sticky goal findings", () => {
  test("a narrower empty pass never erases an existing finding", () => {
    expect(mergeGoalFindings([open], [], 10)).toEqual([open])
  })

  test("refuses to close without evidence and closes monotonically with evidence", () => {
    const refused = mergeGoalFindings([open], [{ ...open, status: "closed", evidence: [] }], 10)
    expect(refused[0]?.status).toBe("open")
    const closed = mergeGoalFindings([open], [{ ...open, status: "closed", evidence: ["independent re-audit ses_b PASS"] }], 10)
    expect(closed[0]?.status).toBe("closed")
    expect(closed[0]?.evidence).toEqual(["audit ses_a", "independent re-audit ses_b PASS"])
  })

  test("deduplicates retries and preserves first-seen ordering", () => {
    const result = mergeGoalFindings([open], [{ ...open, evidence: ["audit ses_a", "new proof"] }], 20)
    expect(result).toHaveLength(1)
    expect(result[0]?.firstSeenAt).toBe(1)
    expect(result[0]?.evidence).toEqual(["audit ses_a", "new proof"])
  })
})
