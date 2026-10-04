import { describe, expect, test } from "bun:test"
import { formatGoalStatusBadge } from "./compaction"
import type { GoalState } from "./goal-state"

const statuses: readonly GoalState["status"][] = [
  "draft",
  "pending_user",
  "approved",
  "edited",
  "completed",
  "skipped",
  "blocked",
]

// Lot 6: every objective state must read distinctly, so a user can tell a
// running mission from one waiting for input, blocked, or finished.
describe("formatGoalStatusBadge", () => {
  test("labels every goal status in French", () => {
    expect(statuses.map((status) => formatGoalStatusBadge({ status }))).toEqual([
      "[Goal: brouillon]",
      "[Goal: en attente]",
      "[Goal: approuvé]",
      "[Goal: édité]",
      "[Goal: terminé]",
      "[Goal: ignoré]",
      "[Goal: bloqué]",
    ])
  })

  test("never collides two states on the same label", () => {
    const labels = statuses.map((status) => formatGoalStatusBadge({ status }))
    expect(new Set(labels).size).toBe(labels.length)
  })
})
