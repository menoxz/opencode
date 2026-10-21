import { describe, expect, test } from "bun:test"
import { formatInjectionBlock, formatInjectionHeader, formatInjectionLine, formatGuardFiringLine, formatGuardFiringsBlock } from "../../src/session/injection-format"
import { parseInjections } from "../../../webui/src/injections"

/**
 * Test croisé : la sortie du serveur est passée au **parseur réel** de la webui, importé tel quel.
 * C'est le seul contrôle qui empêche les deux extrémités de diverger en silence — un test côté
 * serveur avec le format recopié à la main validerait le format que j'ai écrit, pas celui qui est lu.
 */
describe("context injection block", () => {
  test("a block built by the server is parsed back by the webui", () => {
    const text = formatInjectionBlock([
      { section: "core", label: "system prompt (PROMPT_CORE) · agent build", size: 5592 },
      { section: "env", label: "environment", size: 391 },
      { section: "guards", label: "6 globale(s) · 5 locale(s)", size: 132 },
    ])
    const parsed = parseInjections(text)
    expect(parsed?.kind).toBe("sections")
    expect(parsed?.count).toBe(3)
    expect(parsed?.sections.map((section) => section.key)).toEqual(["core", "env", "guards"])
  })

  test("the guards section keeps its origin breakdown", () => {
    const text = formatInjectionBlock([{ section: "guards", label: "6 globale(s) · 5 locale(s)", size: 132 }])
    const guards = parseInjections(text)?.sections[0]
    // Le parseur coupe sur ` · ` : premier segment = libellé, suivants = détail.
    expect(guards?.label).toBe("6 globale(s)")
    expect(guards?.detail).toBe("5 locale(s)")
    expect(guards?.chars).toBe(132)
    expect(guards?.truncated).toBe(false)
  })

  test("truncation survives the round trip", () => {
    const text = formatInjectionBlock([{ section: "instructions", label: "instruction files · 3 source(s)", size: 27578, truncated: true }])
    const section = parseInjections(text)?.sections[0]
    expect(section?.chars).toBe(27578)
    expect(section?.truncated).toBe(true)
  })

  test("the header shape is the one the parser looks for", () => {
    expect(formatInjectionHeader(4)).toBe("Context injections · 4 section(s)")
    expect(formatInjectionLine({ section: "guards", label: "0 globale(s) · 0 locale(s)", size: 0 })).toBe(
      "- guards: 0 globale(s) · 0 locale(s) · 0 chars",
    )
  })

  test("an empty block still parses to undefined, never to a bogus section list", () => {
    expect(parseInjections(formatInjectionBlock([]))).toBeUndefined()
  })
})

/**
 * Aller-retour des tirs : ce que le serveur écrit doit être exactement ce que la webui relit, sinon
 * la ligne n'apparaît pas — et une ligne absente ne produit aucune erreur, seulement du silence.
 */
describe("guard firings block", () => {
  test("the webui reads back what the server writes", () => {
    const text = formatGuardFiringsBlock([
      { origin: "global", name: "delegate-before-diving", reason: "tool_calls_in_turn>=10 (11)" },
      { origin: "project", name: "bash-loop", reason: "tool_calls.bash>=12 (14)" },
    ])
    const parsed = parseInjections(text)
    expect(parsed?.kind).toBe("firings")
    expect(parsed?.count).toBe(2)
    // `project` est écrit `workspace` : c'est le mot affiché, et c'est lui que le parseur relit.
    expect(parsed?.firings).toEqual([
      { origin: "global", name: "delegate-before-diving", reason: "tool_calls_in_turn>=10 (11)" },
      { origin: "workspace", name: "bash-loop", reason: "tool_calls.bash>=12 (14)" },
    ])
  })

  test("the line carries the icon and the origin prefix", () => {
    expect(formatGuardFiringLine({ origin: "project", name: "bash-loop", reason: "x" })).toBe(
      "- 🛡 guard: workspace/bash-loop · x",
    )
  })

  test("an empty firing list is never rendered as a block", () => {
    expect(parseInjections(formatGuardFiringsBlock([]))).toBeUndefined()
  })
})
