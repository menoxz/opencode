import { describe, expect, test } from "vitest"
import {
  declaresInjection,
  injectionPhase,
  formatChars,
  injectionLabel,
  instructionsInjecting,
  parseInjections,
  relativeTo,
  share,
  sourceLabel,
} from "./injections"

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

/** Relevé tel quel sur `ses_edb48d77affeF6ky1NqRoE3JNH`, autre tour : la seconde forme. */
const SOURCES = `Instruction injections · 2 source(s)
Instructions from: C:\\Users\\jeanl\\.config\\opencodev2\\AGENTS.md
Instructions from: C:\\jeanluc\\opencode-fork\\packages\\opencode\\AGENTS.md`

describe("parseInjections", () => {
  test("lit le bloc réel à trois sections", () => {
    const parsed = parseInjections(THREE)
    expect(parsed?.kind).toBe("sections")
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

  test("lit la seconde forme réelle : une liste de fichiers", () => {
    // Relevé tel quel sur `ses_edb48d77affeF6ky1NqRoE3JNH`.
    const parsed = parseInjections(SOURCES)
    expect(parsed?.kind).toBe("sources")
    expect(parsed?.count).toBe(2)
    expect(parsed?.sources).toEqual([
      "C:\\Users\\jeanl\\.config\\opencodev2\\AGENTS.md",
      "C:\\jeanluc\\opencode-fork\\packages\\opencode\\AGENTS.md",
    ])
    expect(parsed?.sections).toEqual([])
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
      "system prompt",
      "environment",
      "instruction files",
      "skills",
    ])
  })

  test("les volumes s'abrègent au-delà de mille", () => {
    expect(formatChars(391)).toBe("391")
    expect(formatChars(999)).toBe("999")
    expect(formatChars(1000)).toBe("1.0k")
    expect(formatChars(13891)).toBe("13.9k")
  })

  test("la part est nulle quand le total est nul", () => {
    expect(share(10, 0)).toBe(0)
    expect(share(50, 100)).toBe(0.5)
  })
})

describe("chemin d'un fichier d'instructions", () => {
  test("trois segments suffisent à distinguer deux AGENTS.md", () => {
    expect(sourceLabel("C:\\Users\\jeanl\\.config\\opencodev2\\AGENTS.md")).toBe("…\\.config\\opencodev2\\AGENTS.md")
    expect(sourceLabel("C:\\jeanluc\\opencode-fork\\packages\\opencode\\AGENTS.md")).toBe(
      "…\\packages\\opencode\\AGENTS.md",
    )
  })

  test("un chemin court n'est pas tronqué", () => {
    expect(sourceLabel("AGENTS.md")).toBe("AGENTS.md")
    expect(sourceLabel("a\\b\\c.md")).toBe("a\\b\\c.md")
  })
})

describe("relativeTo — ce qui est lisible dépend de la base", () => {
  const base = "C:\\jeanluc\\opencode-fork"

  test("un fichier sous la base devient un chemin relatif", () => {
    expect(relativeTo("C:\\jeanluc\\opencode-fork\\packages\\opencode\\AGENTS.md", base)).toBe(
      "packages/opencode/AGENTS.md",
    )
  })

  test("la casse des lecteurs Windows ne compte pas", () => {
    expect(relativeTo("c:\\jeanluc\\OPENCODE-FORK\\AGENTS.md", base)).toBe("AGENTS.md")
  })

  test("un fichier hors de la base n'est pas lisible — c'est le cas de ~/.config", () => {
    expect(relativeTo("C:\\Users\\jeanl\\.config\\opencodev2\\AGENTS.md", base)).toBeUndefined()
  })

  test("la base elle-même n'est pas un fichier", () => {
    expect(relativeTo(base, base)).toBeUndefined()
  })

  test("un préfixe qui n'est pas un dossier ne compte pas", () => {
    // `opencode-fork-old` commence par `opencode-fork` : sans le séparateur, il passerait pour dedans.
    expect(relativeTo("C:\\jeanluc\\opencode-fork-old\\AGENTS.md", base)).toBeUndefined()
  })

  test("sans base, rien n'est lisible", () => {
    expect(relativeTo("C:\\jeanluc\\opencode-fork\\AGENTS.md", "")).toBeUndefined()
  })
})

describe("les instructions qui entrent dans le contexte", () => {
  const carrier = { metadata: { injection: "instructions", sources: ["a.md", "b.md"] } }
  const context = { metadata: { injection: "context", sections: [] } }

  test("une part qui declare une injection est reconnue par sa metadonnee, pas par son texte", () => {
    // Releve sur le serveur le 2026-10-17 : `{"injection":"instructions","sources":[...]}`.
    expect(declaresInjection(carrier)).toBe(true)
    expect(declaresInjection(context)).toBe(true)
    expect(declaresInjection({ metadata: {} })).toBe(false)
    expect(declaresInjection({})).toBe(false)
    expect(declaresInjection({ metadata: { injection: "" } })).toBe(false)
  })

  test("l'injection est en cours tant que le fil travaille et qu'aucune part ne la porte", () => {
    expect(instructionsInjecting([{ text: "salut" }], true)).toBe(true)
  })

  test("des que la part est ecrite, l'injection est faite — meme si la reponse continue", () => {
    expect(instructionsInjecting([{ text: "salut" }, carrier], true)).toBe(false)
  })

  test("au repos, rien n'est en cours", () => {
    expect(instructionsInjecting([{ text: "salut" }], false)).toBe(false)
  })
})

describe("les phases d'une injection et ce qui travaille", () => {
  const carrier = (kind: string) => ({ metadata: { injection: kind } })

  test("les deux phases suivent l'ordre du serveur : les fichiers, puis le contexte", () => {
    // Mesure du 2026-10-17 : le serveur ecrit `instructions` a 1,9 s et `context` a 5,1 s.
    expect(injectionPhase([{ text: "salut" }], true)).toBe("loading")
    expect(injectionPhase([{ text: "salut" }, carrier("instructions")], true)).toBe("injecting")
    expect(injectionPhase([{ text: "salut" }, carrier("instructions"), carrier("context")], true)).toBe("done")
  })

  test("au repos, aucune phase n'est en cours", () => {
    expect(injectionPhase([{ text: "salut" }], false)).toBe("done")
    expect(instructionsInjecting([{ text: "salut" }], true)).toBe(true)
    expect(instructionsInjecting([{ text: "salut" }, carrier("instructions")], true)).toBe(false)
  })
})
