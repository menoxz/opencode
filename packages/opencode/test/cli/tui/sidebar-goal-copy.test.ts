import { describe, expect, test } from "bun:test"
import { TASK_CONTRACT_SIDEBAR_COPY } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/goal"
import { formatTaskContractCompact } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/task-contract-compact"

/** Replicates the compactLine memo logic from goal.tsx — 1-line compact format */
function buildCompactLine(
  compact: ReturnType<typeof formatTaskContractCompact>,
  labels: { objectiveLabel: string; dodLabel: string; outOfScopeLabel: string },
): string {
  const c = compact
  const objText = c.objective.text || "-"
  const dodText = `${c.dod.summary}${c.dod.hidden > 0 ? `…+${c.dod.hidden}` : ""}`
  const oosText = `${c.outOfScope.summary}${c.outOfScope.hidden > 0 ? `…+${c.outOfScope.hidden}` : ""}`
  return `▸ ${labels.objectiveLabel}: ${objText} | ${labels.dodLabel}(${c.dod.total}): ${dodText} | ${labels.outOfScopeLabel}(${c.outOfScope.total}): ${oosText}`
}

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

  test("compact line is single-line, no paddingLeft, no space before (parens)", () => {
    // Full data — all sections present
    const c1 = formatTaskContractCompact({
      goal: "Implement compact task contract in sidebar",
      dod: ["reduce padding", "remove separator", "single line output"],
      outOfScope: ["style changes"],
    })
    const line1 = buildCompactLine(c1, TASK_CONTRACT_SIDEBAR_COPY)

    // Must be a single line (no \n)
    expect(line1.includes("\n")).toBe(false)
    // Must NOT contain "paddingLeft"
    expect(line1.includes("paddingLeft")).toBe(false)
    // Must NOT have space before ( — e.g. "DoD(3)" not "DoD (3)"
    expect(line1).not.toMatch(/[A-Za-z] \(/)
    // Must use …+N format not … +N
    expect(line1).not.toMatch(/… \+/)
    // Must contain | separators
    expect(line1).toContain("|")
    // Must start with ▸
    expect(line1.startsWith("▸")).toBe(true)

    // Empty DoD/OOS edge case
    const c2 = formatTaskContractCompact({
      goal: "Simple goal",
      dod: [],
      outOfScope: [],
    })
    const line2 = buildCompactLine(c2, TASK_CONTRACT_SIDEBAR_COPY)
    expect(line2.includes("\n")).toBe(false)
    expect(line2).toContain("DoD(0):")
    expect(line2).toContain("OOS(0):")
  })
})
