import { describe, expect, it } from "bun:test"
import { dagRuntimeGuard, validateDagSteps } from "../../src/orchestrator"

describe("dagRuntimeGuard", () => {
  it("requires both orchestration and strict read-only opt-ins", () => {
    expect(dagRuntimeGuard({ experimentalDagOrchestration: false, experimentalDagReadOnly: false })).toContain(
      "OPENCODE_EXPERIMENTAL_DAG_ORCHESTRATION",
    )
    expect(dagRuntimeGuard({ experimentalDagOrchestration: true, experimentalDagReadOnly: false })).toContain(
      "OPENCODE_EXPERIMENTAL_DAG_READ_ONLY",
    )
    expect(dagRuntimeGuard({ experimentalDagOrchestration: true, experimentalDagReadOnly: true })).toBeUndefined()
  })

  it("rejects writes, duplicate ids, missing dependencies and cycles before execution", () => {
    expect(validateDagSteps([
      { id: "a", description: "a", agent: "explore", prompt: "read", access: "read-only", depends: ["b"] },
      { id: "b", description: "b", agent: "explore", prompt: "read", access: "read-only", depends: ["a"] },
      { id: "a", description: "duplicate", agent: "build", prompt: "write", depends: ["missing"] },
    ] as any)).toEqual([
      "Duplicate DAG step id: a",
      "DAG step a depends on unknown step: missing",
      "DAG step a must declare access=read-only",
      "DAG dependency cycle detected: a -> b -> a",
    ])
  })
})
