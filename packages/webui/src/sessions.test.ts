import { describe, expect, test } from "vitest"
import {
  SESSION_LIMIT,
  formatCost,
  formatTokens,
  groupByWorkspace,
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
    expect(orphan.label).toBe("no folder")
    expect(orphan.key).toBe("")
  })
})

describe("libellés", () => {
  test("le modèle perd son fournisseur", () => {
    expect(modelLabel({ id: "deepseek/deepseek-v4.1-flash" })).toBe("deepseek-v4.1-flash")
    expect(modelLabel({ id: "sans-barre" })).toBe("sans-barre")
    expect(modelLabel(undefined)).toBe("server default")
  })

  test("les volumes s'abrègent au-delà de mille", () => {
    expect(formatTokens(851)).toBe("851")
    expect(formatTokens(47403)).toBe("47.4k")
    expect(formatTokens(251136)).toBe("251.1k")
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(undefined)).toBe("0")
  })

  test("le coût nul s'écrit zéro, pas une décimale", () => {
    expect(formatCost(0)).toBe("$0")
    expect(formatCost(undefined)).toBe("$0")
    // Sous un cent, on garde la précision ; au-dessus, deux décimales suffisent.
    expect(formatCost(0.005)).toBe("$0.005")
    expect(formatCost(0.0123)).toBe("$0.01")
    expect(formatCost(1.5)).toBe("$1.50")
  })
})

describe("détail d'une session", () => {
  test("les cinq lignes sont présentes, dans l'ordre", () => {
    const details = sessionDetails(inPackages)
    expect(details.map((line) => line.label)).toEqual(["agent", "model", "tokens", "cost", "files"])
  })

  test("les jetons viennent des vraies valeurs", () => {
    const line = sessionDetails(inPackages).find((item) => item.label === "tokens")
    expect(line?.value).toBe("47.4k input · 851 output · 251.1k cache")
  })

  test("aucun changement ne s'écrit pas « +0 −0 »", () => {
    const line = sessionDetails(inPackages).find((item) => item.label === "files")
    expect(line?.value).toBe("no changes")
  })

  test("un vrai changement est décrit, et le pluriel suivi", () => {
    const changed: SessionSummary = {
      ...inPackages,
      summary: { additions: 12, deletions: 3, files: 4 },
    }
    expect(sessionDetails(changed).find((item) => item.label === "files")?.value).toBe("+12 −3 · 4 files")

    const one: SessionSummary = { ...inPackages, summary: { additions: 1, deletions: 0, files: 1 } }
    expect(sessionDetails(one).find((item) => item.label === "files")?.value).toBe("+1 −0 · 1 file")
  })

  test("une session sans agent ni modèle ne laisse pas de trou", () => {
    const bare: SessionSummary = { id: "ses_x" }
    const details = sessionDetails(bare)
    expect(details.find((item) => item.label === "agent")?.value).toBe("server default")
    expect(details.find((item) => item.label === "model")?.value).toBe("server default")
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

/**
 * Le regroupement par **workspace** — la correction du 2026-10-14.
 *
 * Mesuré avant : le rail affichait `packages/opencode` sous le titre « workspaces », c'est-à-dire un
 * sous-chemin du dossier courant. La référence (DSH) liste des **projets**.
 */
describe("regroupement par workspace", () => {
  const projects = ["C:\\jeanluc\\opencode-fork", "C:\\jeanluc\\boutikV2"]

  test("une session est rattachée au projet qui la contient, pas à son sous-chemin", () => {
    const groups = groupByWorkspace([inPackages], projects, "")
    expect(groups[0]?.label).toBe("opencode-fork")
    expect(groups[0]?.key).toBe("c:/jeanluc/opencode-fork")
    expect(groups[0]?.sessions).toHaveLength(1)
  })

  test("le projet le plus long gagne", () => {
    const nested = [...projects, "C:\\jeanluc\\opencode-fork\\packages\\opencode"]
    // Tous les projets connus figurent dans la liste : c'est donc celui qui **porte la session**
    // qu'on interroge, pas le premier affiché.
    const carrier = groupByWorkspace([inPackages], nested, "").find((group) => group.sessions.length > 0)
    expect(carrier?.label).toBe("opencode")
  })

  test("le courant se reconnaît par préfixe — on travaille dans un sous-dossier du workspace", () => {
    const here = "C:/jeanluc/opencode-fork/packages/opencode"
    expect(groupByWorkspace([inPackages], projects, here)[0]?.current).toBe(true)
  })

  test("un autre workspace n'est pas marqué courant", () => {
    expect(groupByWorkspace([inPackages], projects, "C:/jeanluc/boutikV2")[0]?.current).toBe(false)
  })

  test("un dossier voisin n'est pas le workspace : le préfixe s'arrête au séparateur", () => {
    // `…/opencode-fork-2` commence par `…/opencode-fork` : une comparaison de texte le confondrait.
    expect(groupByWorkspace([inPackages], projects, "C:/jeanluc/opencode-fork-2")[0]?.current).toBe(false)
  })

  test("une session hors de tout projet connu retombe sur son propre dossier", () => {
    const orphan: SessionSummary = { id: "ses_orphan", directory: "D:\\ailleurs\\projet", path: "" }
    const groups = groupByWorkspace([orphan], projects, "")
    // Les projets connus figurent tous dans la liste : c'est donc le groupe qui **porte** la session
    // qu'on interroge — pas le premier affiché.
    const carrier = groups.find((group) => group.sessions.length > 0)
    expect(carrier?.label).toBe("projet")
    expect(carrier?.key).toBe("d:/ailleurs/projet")
  })

  test("l'ordre d'apparition est conservé, et les sessions se groupent", () => {
    const other: SessionSummary = { id: "ses_b", directory: "C:\\jeanluc\\boutikV2", path: "" }
    const groups = groupByWorkspace([inPackages, other, { ...inPackages, id: "ses_2" }], projects, "")
    expect(groups.map((group) => group.label)).toEqual(["opencode-fork", "boutikV2"])
    expect(groups[0]?.sessions).toHaveLength(2)
  })

  test("sans projet connu, on retombe sur l'ancien regroupement", () => {
    expect(groupByWorkspace([inPackages, atRoot], [], "").map((group) => group.label)).toEqual([
      "packages/opencode",
      "opencode-fork",
    ])
  })

test("tous les workspaces connus figurent, même sans session", () => {
  // Règle corrigée le 2026-10-15 : la référence (DSH) montre **tous** ses projets et n'ouvre que
  // le courant. La question « où ai-je travaillé ? » appelle aussi « où puis-je travailler ? ».
  const groups = groupByWorkspace([], projects, "C:/jeanluc/opencode-fork")
  expect(groups.map((group) => group.label)).toEqual(["opencode-fork", "boutikV2"])
  expect(groups.every((group) => group.sessions.length === 0)).toBe(true)
})

test("un seul workspace est marqué courant : le plus précis", () => {
  // Relevé à la mesure le 2026-10-15 : `opencode-fork` **et** `jeanluc` portaient la marque, parce
  // que l'un contient l'autre. La référence n'en marque jamais qu'un — « où suis-je ? » n'a qu'une
  // réponse, et deux marques la rendent illisible.
  const nested = ["C:\\jeanluc", "C:\\jeanluc\\opencode-fork"]
  const here = "C:/jeanluc/opencode-fork/packages/opencode"
  const marked = groupByWorkspace([inPackages], nested, here).filter((group) => group.current)
  expect(marked.map((group) => group.label)).toEqual(["opencode-fork"])
})

  test("les sessions sans dossier ne sont pas perdues", () => {
    // Repris de `groupByDirectory`, qu'on remplace : l'invariant survit au changement de regroupement.
    // Elles se rassemblent dans **un** groupe — celui des sessions sans lieu — quels que soient les
    // projets connus affichés à côté.
    const groups = groupByWorkspace([{ id: "a" }, { id: "b" }], projects, "")
    const carrier = groups.filter((group) => group.sessions.length > 0)
    expect(carrier).toHaveLength(1)
    expect(carrier[0]?.sessions).toHaveLength(2)
  })
})
