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
