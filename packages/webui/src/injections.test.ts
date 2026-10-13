import { describe, expect, test } from "vitest"
import { formatChars, injectionLabel, parseInjections, share } from "./injections"

/** Relevé tel quel sur `ses_edb48d77affeF6ky1NqRoE3JNH`. */
const THREE = `Context injections · 3 section(s)
- core: system prompt (PROMPT_CORE) · agent build · 5592 chars
- env: environment · 391 chars
- instructions: instruction files · 2 source(s) · 13891 chars`

/** Relevé tel quel sur `ses_f068fa00bffeFPQlEjhYB5em1F` — avec troncature. */
const FOUR = `Context injections · 4 section(s)
- core: system prompt (PROMPT_CORE) · agent build · 2655 chars
- env: environment · 1426 chars
- instructions: instruction files · 3 source(s) · 27578 chars (truncated)
- skills: skill summary · 6883 chars`

describe("parseInjections", () => {
  test("lit le bloc réel à trois sections", () => {
    const parsed = parseInjections(THREE)
    expect(parsed?.count).toBe(3)
    expect(parsed?.sections.map((s) => s.key)).toEqual(["core", "env", "instructions"])
    expect(parsed?.sections[0]).toEqual({
      key: "core",
      label: "system prompt (PROMPT_CORE)",
      detail: "agent build",
      chars: 5592,
      truncated: false,
    })
  })

  test("une section sans précision n'a pas de détail", () => {
    const parsed = parseInjections(THREE)
    expect(parsed?.sections[1]?.detail).toBeUndefined()
    expect(parsed?.sections[1]?.chars).toBe(391)
  })

  test("lit la troncature et le nombre de sources", () => {
    const parsed = parseInjections(FOUR)
    const instructions = parsed?.sections.find((s) => s.key === "instructions")
    expect(instructions?.truncated).toBe(true)
    expect(instructions?.detail).toBe("3 source(s)")
    expect(instructions?.chars).toBe(27578)
    expect(parsed?.sections.find((s) => s.key === "skills")?.truncated).toBe(false)
  })

  test("un prompt écrit par l'utilisateur n'est pas une injection", () => {
    expect(parseInjections("Explique-moi les tests unitaires")).toBeUndefined()
    expect(parseInjections("Context injections mais sans en-tête valide")).toBeUndefined()
    expect(parseInjections("")).toBeUndefined()
    expect(parseInjections(undefined)).toBeUndefined()
  })

  test("un en-tête sans section lisible ne produit rien", () => {
    expect(parseInjections("Context injections · 1 section(s)\n- rien du tout")).toBeUndefined()
  })

  test("une section inconnue est conservée, pas écartée", () => {
    const parsed = parseInjections("Context injections · 1 section(s)\n- memoire: notes · 42 chars")
    expect(parsed?.sections[0]?.key).toBe("memoire")
    expect(injectionLabel(parsed!.sections[0]!)).toBe("notes")
  })
})

describe("libellés et volumes", () => {
  test("les clés connues sont traduites", () => {
    const parsed = parseInjections(FOUR)!
    expect(parsed.sections.map(injectionLabel)).toEqual([
      "invite système",
      "environnement",
      "fichiers d'instructions",
      "compétences",
    ])
  })

  test("les volumes s'abrègent au-delà de mille", () => {
    expect(formatChars(391)).toBe("391")
    expect(formatChars(999)).toBe("999")
    expect(formatChars(1000)).toBe("1,0 k")
    expect(formatChars(13891)).toBe("13,9 k")
  })

  test("la part est nulle quand le total est nul", () => {
    expect(share(10, 0)).toBe(0)
    expect(share(50, 100)).toBe(0.5)
  })
})
