import { describe, expect, test } from "vitest"
import { parseInjections } from "./injections"
/**
 * La section `guards` est écrite par le serveur avec le décompte par origine. Le parseur ne connaît
 * pas la clé, et ne doit pas la perdre : c'est ce qui fait apparaître la ligne de chargement dans le
 * stream sans toucher au rendu.
 */
const GUARDS = `Context injections · 3 section(s)
- core: system prompt (PROMPT_CORE) · agent build · 5592 chars
- env: environment · 391 chars
- guards: 6 globale(s) · 5 locale(s) · 132 chars`

describe("guards injection section", () => {
  test("the origin breakdown is parsed as its own section", () => {
    const parsed = parseInjections(GUARDS)
    expect(parsed?.kind).toBe("sections")
    const guards = parsed?.sections.find((section) => section.key === "guards")
    // Sémantique du parseur : le premier segment est le libellé, les suivants le détail.
    expect(guards?.label).toBe("6 globale(s)")
    expect(guards?.detail).toBe("5 locale(s)")
    expect(guards?.chars).toBe(132)
    expect(guards?.truncated).toBe(false)
  })

  test("the other sections are unaffected", () => {
    const parsed = parseInjections(GUARDS)
    expect(parsed?.sections.map((section) => section.key)).toEqual(["core", "env", "guards"])
  })
})

/** Forme « tirs » : une ligne par garde déclenchée, avec l'origine en clair. */
const FIRINGS = `Guards fired · 2 tir(s)
- 🛡 guard: global/delegate-before-diving · tool_calls_in_turn>=10 (11)
- 🛡 guard: workspace/bash-loop · tool_calls.bash>=12 (14)`

describe("guard firings", () => {
  test("each firing is parsed with its origin, name and reason", () => {
    const parsed = parseInjections(FIRINGS)
    expect(parsed?.kind).toBe("firings")
    expect(parsed?.count).toBe(2)
    expect(parsed?.firings).toEqual([
      { origin: "global", name: "delegate-before-diving", reason: "tool_calls_in_turn>=10 (11)" },
      { origin: "workspace", name: "bash-loop", reason: "tool_calls.bash>=12 (14)" },
    ])
  })

  test("the icon is optional when reading, so an older line still parses", () => {
    const parsed = parseInjections("Guards fired · 1 tir(s)\n- guard: global/interpret-request · since_last_tokens>=12000 (13000)")
    expect(parsed?.firings[0]).toEqual({
      origin: "global",
      name: "interpret-request",
      reason: "since_last_tokens>=12000 (13000)",
    })
  })

  test("a header without any firing line is not rendered as an empty block", () => {
    expect(parseInjections("Guards fired · 0 tir(s)")).toBeUndefined()
  })
})
