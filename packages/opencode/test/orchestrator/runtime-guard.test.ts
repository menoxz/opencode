import { describe, expect, it } from "bun:test"
import { dagRuntimeGuard } from "../../src/orchestrator"

describe("dagRuntimeGuard", () => {
  it("requires an explicit DAG orchestration runtime opt-in", () => {
    expect(dagRuntimeGuard({ experimentalDagOrchestration: false })).toContain(
      "OPENCODE_EXPERIMENTAL_DAG_ORCHESTRATION",
    )
    expect(dagRuntimeGuard({ experimentalDagOrchestration: true })).toBeUndefined()
  })
})
