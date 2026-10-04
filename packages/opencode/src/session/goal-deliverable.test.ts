import { describe, expect, test } from "bun:test"
import { inferDeliverable } from "./goal-state"

// Regression context: a mission that asks to "make it more reliable" was kept
// on the old audit contract, so its closure rules never matched the real work.
describe("inferDeliverable", () => {
  test("detects implementation from mutation verbs", () => {
    expect(inferDeliverable("corrige le bug de connexion")).toBe("implementation")
    expect(inferDeliverable("add pagination to the list endpoint")).toBe("implementation")
    expect(inferDeliverable("il faut trouver un moyen de le rendre plus fiable")).toBe("implementation")
    expect(inferDeliverable("améliore la fiabilité de l'outil")).toBe("implementation")
  })

  test("distinguishes a plan request from the implementation it describes", () => {
    expect(inferDeliverable("prépare le plan de la prochaine implémentation")).toBe("plan")
    expect(inferDeliverable("write an implementation plan")).toBe("plan")
  })

  test("detects audits and evaluations", () => {
    expect(inferDeliverable("évalue la fiabilité de tool_search")).toBe("audit")
    expect(inferDeliverable("analyse l'état de l'art")).toBe("audit")
    expect(inferDeliverable("audit the MCP lifecycle")).toBe("audit")
  })

  test("defaults to a plain answer", () => {
    expect(inferDeliverable("combien d'outils sont actifs ?")).toBe("answer")
  })
})
