import { describe, expect, test } from "bun:test"
import { PlanEngine } from "../../src/plan-engine"

describe("plan-engine validation", () => {
  test("computes deterministic parallel groups for valid DAGs", () => {
    const plan = PlanEngine.validateExecutionPlan({
      goal: "ship feature",
      complexity: "complex",
      estimatedTokens: 100,
      steps: [
        { id: "research", description: "Research", agent: "explore", prompt: "Research", depends: [], complexity: 0.3 },
        { id: "tests", description: "Tests", agent: "build", prompt: "Tests", depends: ["research"], complexity: 0.4 },
        { id: "docs", description: "Docs", agent: "build", prompt: "Docs", depends: ["research"], complexity: 0.2 },
        { id: "final", description: "Final", agent: "build", prompt: "Final", depends: ["tests", "docs"], complexity: 0.2 },
      ],
      parallelGroups: [],
    })

    expect(plan.parallelGroups).toEqual([["research"], ["docs", "tests"], ["final"]])
  })

  test("rejects duplicate step ids", () => {
    expect(() =>
      PlanEngine.validateExecutionPlan({
        goal: "bad",
        complexity: "moderate",
        estimatedTokens: 1,
        steps: [
          { id: "a", description: "A", agent: "build", prompt: "A", depends: [], complexity: 0.1 },
          { id: "a", description: "A2", agent: "build", prompt: "A2", depends: [], complexity: 0.1 },
        ],
        parallelGroups: [],
      }),
    ).toThrow("Duplicate plan step id")
  })

  test("rejects missing dependencies", () => {
    expect(() =>
      PlanEngine.validateExecutionPlan({
        goal: "bad",
        complexity: "moderate",
        estimatedTokens: 1,
        steps: [
          { id: "a", description: "A", agent: "build", prompt: "A", depends: ["missing"], complexity: 0.1 },
        ],
        parallelGroups: [],
      }),
    ).toThrow("missing dependency")
  })

  test("rejects dependency cycles", () => {
    expect(() =>
      PlanEngine.validateExecutionPlan({
        goal: "bad",
        complexity: "moderate",
        estimatedTokens: 1,
        steps: [
          { id: "a", description: "A", agent: "build", prompt: "A", depends: ["b"], complexity: 0.1 },
          { id: "b", description: "B", agent: "build", prompt: "B", depends: ["a"], complexity: 0.1 },
        ],
        parallelGroups: [],
      }),
    ).toThrow("cycle")
  })
})
