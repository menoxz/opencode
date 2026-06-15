import { describe, expect, test } from "bun:test"
import { TASK_CONTRACT_SIDEBAR_COPY } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/goal"
import { formatTaskContractCompact } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/task-contract-compact"

describe("sidebar goal copy", () => {
  test("uses contract-oriented labels and empty-state fallback", () => {
    expect(TASK_CONTRACT_SIDEBAR_COPY.sectionTitle).toBe("TASK CONTRACT")
    expect(TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel).toBe("Obj")
    expect(TASK_CONTRACT_SIDEBAR_COPY.panelExpandHint).toBe("expand")
    expect(TASK_CONTRACT_SIDEBAR_COPY.panelCollapseHint).toBe("collapse")
    expect(TASK_CONTRACT_SIDEBAR_COPY.dodLabel).toBe("DoD")
    expect(TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel).toBe("OOS")
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

  test("builds compact DoD/OOS summaries with overflow marker", () => {
    const preview = formatTaskContractCompact({
      goal: "Obj",
      dod: ["first dod", "second dod", "third dod"],
      outOfScope: ["first oos", "second oos"],
    })

    expect(preview.dod.summary).toBe("first dod")
    expect(preview.dod.hidden).toBe(2)
    expect(preview.outOfScope.summary).toBe("first oos")
    expect(preview.outOfScope.hidden).toBe(1)
  })
})
