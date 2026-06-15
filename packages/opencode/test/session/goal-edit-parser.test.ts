import { describe, expect, test } from "bun:test"
import {
  buildGoalEditTemplate,
  MINIMAL_DOD_ITEM,
  normalizeGoalList,
  parseGoalEditInput,
  serializeGoalStateCompressed,
} from "../../src/cli/cmd/tui/routes/session/goal-edit-parser"

describe("goal-edit-parser", () => {
  test("parses goal, dod and out-of-scope sections", () => {
    const parsed = parseGoalEditInput(`Goal: Improve onboarding UX

DoD:
- Add empty-state illustration
- Add inline help text

Out of scope:
- Backend API changes`)

    expect(parsed).toEqual({
      goal: "Improve onboarding UX",
      dod: ["Add empty-state illustration", "Add inline help text"],
      outOfScope: ["Backend API changes"],
    })
  })

  test("accepts aliases and casing variations", () => {
    const parsed = parseGoalEditInput(`OBJECTIF: Finaliser le flux de paiement

definition of done:
1. gérer les erreurs réseau
2. afficher un état de succès

Scope exclusions:
- migration DB
- instrumentation analytics`)

    expect(parsed.goal).toBe("Finaliser le flux de paiement")
    expect(parsed.dod).toEqual(["gérer les erreurs réseau", "afficher un état de succès"])
    expect(parsed.outOfScope).toEqual(["migration DB", "instrumentation analytics"])
  })

  test("accepts French labels for DoD and out-of-scope", () => {
    const parsed = parseGoalEditInput(`Objectif: Améliorer la sidebar TUI

Définition de Done:
- afficher 2 lignes max
- conserver la vue étendue

Hors périmètre:
- migration base de données`)

    expect(parsed).toEqual({
      goal: "Améliorer la sidebar TUI",
      dod: ["afficher 2 lignes max", "conserver la vue étendue"],
      outOfScope: ["migration base de données"],
    })
  })

  test("falls back to first paragraph when Goal section is absent", () => {
    const parsed = parseGoalEditInput(`Ship a complete mobile-ready auth flow

DoD:
- login
- reset password`)

    expect(parsed.goal).toBe("Ship a complete mobile-ready auth flow")
    expect(parsed.dod).toEqual(["login", "reset password"])
  })

  test("builds template and normalizes list values", () => {
    const template = buildGoalEditTemplate({
      goal: "  Improve docs  ",
      dod: [" Ship docs ", "", "Ship docs"],
      outOfScope: ["  Refactor core "],
    })

    expect(template).toContain("Objective: Improve docs")
    expect(template).toContain("Definition of Done:")
    expect(template).toContain("- Ship docs")
    expect(template).toContain("Out of Scope:")
    expect(template).toContain("- Refactor core")

    expect(normalizeGoalList([" a ", "", "a", "b", 1])).toEqual(["a", "b"])
  })

  test("serializes compressed goal state sections", () => {
    const compressed = serializeGoalStateCompressed("Improve onboarding. Details", ["item 1"], ["oos 1"])
    expect(compressed).toContain("GOAL: Improve onboarding")
    expect(compressed).toContain("DOD: item 1")
    expect(compressed).toContain("OOS: oos 1")
    expect(compressed.endsWith("\n")).toBe(true)
  })

  test("parses objective and out-of-scope title casing aliases", () => {
    const parsed = parseGoalEditInput(`Objective: Improve docs IA

Definition of Done:
- update navigation labels

Out of Scope:
- migration`)

    expect(parsed).toEqual({
      goal: "Improve docs IA",
      dod: ["update navigation labels"],
      outOfScope: ["migration"],
    })
  })

  test("exposes minimal dod fallback constant", () => {
    expect(MINIMAL_DOD_ITEM.length).toBeGreaterThan(10)
  })
})
