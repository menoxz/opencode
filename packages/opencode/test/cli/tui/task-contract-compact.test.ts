import { describe, expect, test } from "bun:test"
import {
  formatTaskContractCompact,
  formatTaskContractCompactLines,
  MAX_DOD_PREVIEW,
  MAX_OOS_PREVIEW,
} from "../../../src/cli/cmd/tui/feature-plugins/sidebar/task-contract-compact"

describe("task contract compact formatter", () => {
  test("removes markdown noise and keeps single-line objective", () => {
    const compact = formatTaskContractCompact(
      {
        goal: "## Objective\n```md\nraw fence\n```\nImprove `sidebar` readability.",
        dod: [],
        outOfScope: [],
      },
      { objectiveMaxChars: 40 },
    )

    expect(compact.objective.text).toBe("Objective Improve sidebar readability.")
    expect(compact.objective.text.includes("\n")).toBe(false)
  })

  test("applies DoD and OOS preview limits with hidden counters", () => {
    const compact = formatTaskContractCompact({
      goal: "Compact panel",
      dod: ["one", "two", "three"],
      outOfScope: ["x", "y"],
    })

    expect(compact.dod.visible).toEqual(["one"])
    expect(compact.dod.summary).toBe("one")
    expect(compact.dod.hidden).toBe(2)
    expect(compact.dod.total).toBe(3)
    expect(compact.dod.visible.length).toBe(MAX_DOD_PREVIEW)

    expect(compact.outOfScope.visible).toEqual(["x"])
    expect(compact.outOfScope.summary).toBe("x")
    expect(compact.outOfScope.hidden).toBe(1)
    expect(compact.outOfScope.total).toBe(2)
    expect(compact.outOfScope.visible.length).toBe(MAX_OOS_PREVIEW)
  })

  test("strips raw markdown markers from compact DoD/OOS summaries", () => {
    const compact = formatTaskContractCompact({
      goal: "Obj",
      dod: ["- **Done** item", "```txt\nnoise\n```"],
      outOfScope: ["## Heading", "- another"],
    })

    expect(compact.dod.summary).toBe("Done item")
    expect(compact.dod.summary.includes("**")).toBe(false)
    expect(compact.outOfScope.summary).toBe("Heading")
    expect(compact.outOfScope.summary.includes("##")).toBe(false)
  })

  test("supports FR/EN contract payloads transparently", () => {
    const compact = formatTaskContractCompact({
      goal: "Objectif: réduire l'encombrement visuel du panneau",
      dod: ["DoD: afficher compteur"],
      outOfScope: ["Hors périmètre: refonte complète"],
    })

    expect(compact.objective.text.length).toBeGreaterThan(0)
    expect(compact.dod.total).toBe(1)
    expect(compact.outOfScope.total).toBe(1)
  })

  test("generates exact compact lines Obj/DoD(N)/OOS(N)", () => {
    const compact = formatTaskContractCompact({
      goal: "Reduce visual density",
      dod: ["first", "second"],
      outOfScope: ["first oos", "second oos"],
    })

    const lines = formatTaskContractCompactLines(compact)
    expect(lines.objectiveLine.startsWith("Obj: ")).toBe(true)
    expect(lines.dodLine).toBe("DoD (2): first… +1")
    expect(lines.oosLine).toBe("OOS (2): first oos… +1")
    expect(lines.objectiveLine.includes("\n")).toBe(false)
    expect(lines.dodLine.includes("\n")).toBe(false)
    expect(lines.oosLine.includes("\n")).toBe(false)
  })
})
