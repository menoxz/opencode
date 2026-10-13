import { describe, expect, test } from "vitest"
import {
  SESSION_LIMIT,
  formatCost,
  formatTokens,
  groupByDirectory,
  groupOf,
  modelLabel,
  sessionDetails,
  splitSessions,
  type SessionSummary,
} from "./sessions"

/** Relevé tel quel sur `GET /session` : 16 sessions sous `packages\opencode`, 3 à la racine. */
const inPackages: SessionSummary = {
  id: "ses_f4060c2a8ffeIZwYfFR1DSo44X",
  title: "Test 4 étapes avec erreurs injectées",
  directory: "C:\\jeanluc\\opencode-fork\\packages\\opencode",
  path: "packages/opencode",
  agent: "build",
  model: { id: "deepseek/deepseek-v4.1-flash", providerID: "command-code", variant: "default" },
  cost: 0,
  tokens: { input: 47403, output: 851, reasoning: 584, cache: { read: 251136, write: 0 } },
  summary: { additions: 0, deletions: 0, files: 0 },
}

const atRoot: SessionSummary = {
  id: "ses_ecf758efeffeXfN3wYsB5BgAio",
  title: "Failure journal",
  directory: "C:\\jeanluc\\opencode-fork",
  path: "",
  agent: "build",
}

describe("dossier d'une session", () => {
  test("le chemin relatif prime et sert de libellé", () => {
    expect(groupOf(inPackages)).toEqual({
      key: "C:\\jeanluc\\opencode-fork\\packages\\opencode",
      label: "packages/opencode",
      hint: "C:\\jeanluc\\opencode-fork\\packages\\opencode",
    })
  })

  test("sans chemin relatif, on retombe sur le dernier segment du dossier absolu", () => {
    expect(groupOf(atRoot).label).toBe("opencode-fork")
  })

  test("une session sans dossier ne disparaît pas", () => {
    const orphan = groupOf({ id: "ses_x" })
    expect(orphan.label).toBe("sans dossier")
    expect(orphan.key).toBe("")
  })
})

describe("regroupement", () => {
  test("deux dossiers réels donnent deux groupes, dans l'ordre d'apparition", () => {
    const groups = groupByDirectory([inPackages, atRoot, { ...inPackages, id: "ses_2" }])
    expect(groups.map((group) => group.label)).toEqual(["packages/opencode", "opencode-fork"])
    expect(groups[0]?.sessions).toHaveLength(2)
    expect(groups[1]?.sessions).toHaveLength(1)
  })

  test("une liste vide ne produit aucun groupe", () => {
    expect(groupByDirectory([])).toEqual([])
  })

  test("les sessions sans dossier sont rassemblées, pas écartées", () => {
    const groups = groupByDirectory([{ id: "a" }, { id: "b" }])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.sessions).toHaveLength(2)
  })
})

describe("libellés", () => {
  test("le modèle perd son fournisseur", () => {
    expect(modelLabel({ id: "deepseek/deepseek-v4.1-flash" })).toBe("deepseek-v4.1-flash")
    expect(modelLabel({ id: "sans-barre" })).toBe("sans-barre")
    expect(modelLabel(undefined)).toBe("modèle par défaut")
  })

  test("les volumes s'abrègent au-delà de mille", () => {
    expect(formatTokens(851)).toBe("851")
    expect(formatTokens(47403)).toBe("47,4 k")
    expect(formatTokens(251136)).toBe("251,1 k")
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(undefined)).toBe("0")
  })

  test("le coût nul s'écrit zéro, pas une décimale", () => {
    expect(formatCost(0)).toBe("0 $")
    expect(formatCost(undefined)).toBe("0 $")
    // Sous un cent, on garde la précision ; au-dessus, deux décimales suffisent.
    expect(formatCost(0.005)).toBe("0,005 $")
    expect(formatCost(0.0123)).toBe("0,01 $")
    expect(formatCost(1.5)).toBe("1,50 $")
  })
})

describe("détail d'une session", () => {
  test("les cinq lignes sont présentes, dans l'ordre", () => {
    const details = sessionDetails(inPackages)
    expect(details.map((line) => line.label)).toEqual(["agent", "modèle", "jetons", "coût", "fichiers"])
  })

  test("les jetons viennent des vraies valeurs", () => {
    const line = sessionDetails(inPackages).find((item) => item.label === "jetons")
    expect(line?.value).toBe("47,4 k entrée · 851 sortie · 251,1 k cache")
  })

  test("aucun changement ne s'écrit pas « +0 −0 »", () => {
    const line = sessionDetails(inPackages).find((item) => item.label === "fichiers")
    expect(line?.value).toBe("aucun changement")
  })

  test("un vrai changement est décrit, et le pluriel suivi", () => {
    const changed: SessionSummary = {
      ...inPackages,
      summary: { additions: 12, deletions: 3, files: 4 },
    }
    expect(sessionDetails(changed).find((item) => item.label === "fichiers")?.value).toBe("+12 −3 · 4 fichiers")

    const one: SessionSummary = { ...inPackages, summary: { additions: 1, deletions: 0, files: 1 } }
    expect(sessionDetails(one).find((item) => item.label === "fichiers")?.value).toBe("+1 −0 · 1 fichier")
  })

  test("une session sans agent ni modèle ne laisse pas de trou", () => {
    const bare: SessionSummary = { id: "ses_x" }
    const details = sessionDetails(bare)
    expect(details.find((item) => item.label === "agent")?.value).toBe("défaut du serveur")
    expect(details.find((item) => item.label === "modèle")?.value).toBe("modèle par défaut")
  })
})

describe("plafond de sessions par dossier", () => {
  /** Relevé : 16 sessions sous `packages/opencode`. C'est ce dossier qui chargeait la liste. */
  const many = Array.from({ length: 16 }, (_, index) => ({ ...inPackages, id: `ses_${index}` }))

  test("au-delà du plafond, seules les quatre premières sont montrées", () => {
    const { shown, hidden } = splitSessions(many, false)
    expect(SESSION_LIMIT).toBe(4)
    expect(shown).toHaveLength(4)
    expect(hidden).toBe(12)
    expect(shown[0]?.id).toBe("ses_0")
  })

  test("déplié, tout est montré et rien n'est caché", () => {
    const { shown, hidden } = splitSessions(many, true)
    expect(shown).toHaveLength(16)
    expect(hidden).toBe(0)
  })

  test("sous le plafond, aucun bouton : hidden vaut zéro", () => {
    // C'est ce qui décide l'existence du bouton « voir plus » : à zéro, il n'est pas monté.
    const few = many.slice(0, 3)
    expect(splitSessions(few, false)).toEqual({ shown: few, hidden: 0 })
  })

  test("exactement au plafond, aucun bouton non plus", () => {
    expect(splitSessions(many.slice(0, 4), false).hidden).toBe(0)
  })

  test("un dossier vide ne casse rien", () => {
    expect(splitSessions([], false)).toEqual({ shown: [], hidden: 0 })
  })

  test("le plafond est un paramètre, pas une constante cachée", () => {
    expect(splitSessions(many, false, 2).hidden).toBe(14)
  })
})
