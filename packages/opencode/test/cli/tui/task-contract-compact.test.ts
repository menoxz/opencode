import { describe, expect, test } from "bun:test"
import {
  formatTaskContractCompact,
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

    expect(compact.dod.visible).toEqual(["one", "two"])
    expect(compact.dod.hidden).toBe(1)
    expect(compact.dod.total).toBe(3)
    expect(compact.dod.visible.length).toBe(MAX_DOD_PREVIEW)

    expect(compact.outOfScope.visible).toEqual(["x"])
    expect(compact.outOfScope.hidden).toBe(1)
    expect(compact.outOfScope.total).toBe(2)
    expect(compact.outOfScope.visible.length).toBe(MAX_OOS_PREVIEW)
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
})
