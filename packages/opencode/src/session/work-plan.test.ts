import { describe, expect, test } from "bun:test"
import { SessionWorkPlan, TODO_PROJECTION_LIMIT } from "./work-plan"

const todo = (content: string, status = "pending") => ({ content, status, priority: "medium" })

describe("session work plan", () => {
  test("keeps the active phase detailed in a bounded projection", () => {
    const todos = Array.from({ length: 14 }, (_, index) =>
      todo(`phase ${index}`, index === 8 ? "in_progress" : "pending"),
    )
    const projection = SessionWorkPlan.projectTodos(todos)
    expect(projection.todos).toHaveLength(TODO_PROJECTION_LIMIT)
    expect(projection.todos.some((item) => item.content === "phase 8" && item.status === "in_progress")).toBe(true)
    expect(projection.omitted).toBe(6)
  })

  test("renders a stable session reference and complete plan", () => {
    const todos = [todo("research", "completed"), todo("implementation", "in_progress"), todo("verification")]
    const planPath = "C:\\repo\\.opencode\\plans\\ses_test.md"
    const full = SessionWorkPlan.render({ sessionID: "ses_test", planPath, todos })
    const reference = SessionWorkPlan.reference({ sessionID: "ses_test", planPath, todos })
    expect(full).toContain("P3 · pending · medium — verification")
    expect(reference).toContain('ref="opencode://session/ses_test/plan"')
    expect(reference).toContain("Active phase: implementation")
    expect(reference).not.toContain("verification")
  })
})
