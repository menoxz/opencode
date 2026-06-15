import { describe, expect, test } from "bun:test"
import { TASK_CONTRACT_SIDEBAR_COPY } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/goal"
import { formatTaskContractCompact } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/task-contract-compact"

describe("sidebar goal copy", () => {
  test("uses contract-oriented labels and empty-state fallback", () => {
    expect(TASK_CONTRACT_SIDEBAR_COPY.sectionTitle).toBe("TASK CONTRACT")
    expect(TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel).toBe("Objective")
    expect(TASK_CONTRACT_SIDEBAR_COPY.panelExpandHint).toBe("expand")
    expect(TASK_CONTRACT_SIDEBAR_COPY.panelCollapseHint).toBe("collapse")
    expect(TASK_CONTRACT_SIDEBAR_COPY.dodLabel).toBe("Definition of Done")
    expect(TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel).toBe("Out of Scope")
    expect(TASK_CONTRACT_SIDEBAR_COPY.emptyState).toBe("no contract defined")
  })

  test("builds a compact single-line objective preview with ellipsis", () => {
    const preview = formatTaskContractCompact(
      {
        goal: "Implement a compact objective view in the sidebar while keeping the full text available in expanded mode for long contracts.",
        dod: [],
        outOfScope: [],
      },
      { objectiveMaxChars: 26 },
    )

    expect(preview.objective.truncated).toBe(true)
    expect(preview.objective.text.includes("\n")).toBe(false)
    expect(preview.objective.text.endsWith("…")).toBe(true)
  })
})
