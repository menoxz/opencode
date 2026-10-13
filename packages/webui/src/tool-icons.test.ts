import { describe, expect, test } from "vitest"
import { toolIcon, toolVerb } from "./tool-icons"

describe("toolIcon", () => {
  test("les familles de lecture partagent une icône", () => {
    expect(toolIcon("read")).toBe("read")
    expect(toolIcon("list")).toBe("read")
    expect(toolIcon("glob")).toBe("read")
  })

  test("les familles d'écriture partagent une icône", () => {
    expect(toolIcon("write")).toBe("write")
    expect(toolIcon("edit")).toBe("write")
  })

  test("les outils réellement observés sont tous classés", () => {
    // Relevé sur les 19 sessions du serveur : bash=18, complete_objective=6, turn_plan=3,
    // read=2, task=2, grep=1, question=1.
    expect(toolIcon("bash")).toBe("shell")
    expect(toolIcon("complete_objective")).toBe("goal")
    expect(toolIcon("turn_plan")).toBe("plan")
    expect(toolIcon("task")).toBe("subagent")
    expect(toolIcon("grep")).toBe("search")
    expect(toolIcon("question")).toBe("ask")
  })

  test("un outil inconnu reçoit l'icône générique, pas un vide", () => {
    expect(toolIcon("outil_du_futur")).toBe("generic")
    expect(toolIcon("")).toBe("generic")
  })
})

describe("toolVerb", () => {
  test("chaque famille a un mot français", () => {
    expect(toolVerb("bash")).toBe("commande")
    expect(toolVerb("read")).toBe("lecture")
    expect(toolVerb("outil_du_futur")).toBe("outil")
  })
})
