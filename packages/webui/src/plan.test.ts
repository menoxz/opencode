import { describe, expect, test } from "vitest"
import {
  addItem,
  cleanList,
  contractFrom,
  contractPayload,
  draftFrom,
  removeItem,
  setItem,
  todoProgress,
  todosFrom,
} from "./plan"

describe("todosFrom — les todos d'une session", () => {
  test("les trois champs sont repris, le contenu détouré", () => {
    expect(
      todosFrom([
        { content: "  Écrire le composant  ", status: "in_progress", priority: "high" },
        { content: "Vérifier à l'écran", status: "pending" },
      ]),
    ).toEqual([
      { content: "Écrire le composant", status: "in_progress", priority: "high" },
      { content: "Vérifier à l'écran", status: "pending", priority: undefined },
    ])
  })

  test("un état inconnu retombe sur `pending`, jamais sur un état inventé", () => {
    // Le serveur peut ajouter un état : mieux vaut le traiter comme « pas encore fait » que
    // l'afficher tel quel — un état non traduit dans l'écran serait un mot de protocole à l'écran.
    expect(todosFrom([{ content: "x", status: "en cours de rédaction" }])[0]!.status).toBe("pending")
  })

  test("une entrée sans contenu ne s'affiche pas", () => {
    expect(todosFrom([{ content: "   ", status: "pending" }, { status: "pending" }])).toEqual([])
  })

  test("une réponse absente ou malformée rend une liste vide, jamais une erreur", () => {
    expect(todosFrom(undefined)).toEqual([])
    expect(todosFrom({})).toEqual([])
    expect(todosFrom([null, 42, "texte"])).toEqual([])
  })
})

describe("contractFrom — le contrat de tâche", () => {
  test("objectif, DoD et hors-périmètre sont projetés", () => {
    expect(
      contractFrom({
        goalState: {
          goal: "Livrer la vue Trajectory",
          dod: ["Le panneau s'affiche à droite", "  ", "Les tests passent"],
          outOfScope: ["Le rendu serveur"],
          status: "active",
          source: "user",
        },
      }),
    ).toEqual({
      goal: "Livrer la vue Trajectory",
      dod: ["Le panneau s'affiche à droite", "Les tests passent"],
      outOfScope: ["Le rendu serveur"],
      status: "active",
      source: "user",
    })
  })

  test("**un contrat vide ne s'affiche pas** — c'est le cas le plus fréquent", () => {
    // Mesuré : toute session sans contrat reçoit un `goalState` d'état `skipped`, objectif vide et
    // DoD vide. Afficher un cadre pour cela serait du mobilier ; l'absence est la bonne réponse.
    expect(contractFrom({ goalState: { goal: "", dod: [], outOfScope: [], status: "skipped" } })).toBeUndefined()
    expect(contractFrom({ goalState: null })).toBeUndefined()
    expect(contractFrom({})).toBeUndefined()
    expect(contractFrom(undefined)).toBeUndefined()
  })

  test("un objectif **seul** suffit à l'afficher", () => {
    // Une DoD vide n'empêche pas l'objectif d'être une information : c'est même le cas d'un contrat
    // posé à la main, sans définition de fin.
    expect(contractFrom({ goalState: { goal: "Corriger la barre" } })).toEqual({
      goal: "Corriger la barre",
      dod: [],
      outOfScope: [],
      status: undefined,
      source: undefined,
    })
  })
})

describe("todoProgress — ce qui s'affiche au repos", () => {
  test("le compte des faites et l'item en cours", () => {
    const todos = todosFrom([
      { content: "a", status: "completed" },
      { content: "b", status: "completed" },
      { content: "c", status: "in_progress" },
      { content: "d", status: "pending" },
    ])
    const progress = todoProgress(todos)
    expect(progress.done).toBe(2)
    expect(progress.total).toBe(4)
    expect(progress.active?.content).toBe("c")
  })

  test("sans item en cours, le premier `pending` prend la place", () => {
    // Sinon la ligne n'aurait rien à dire alors qu'il reste du travail : c'est le **prochain** fait
    // qui renseigne, à défaut de celui en cours.
    const todos = todosFrom([
      { content: "a", status: "completed" },
      { content: "b", status: "pending" },
    ])
    expect(todoProgress(todos).active?.content).toBe("b")
  })

  test("l'item en cours passe devant un `pending` placé plus haut", () => {
    const todos = todosFrom([
      { content: "a", status: "pending" },
      { content: "b", status: "in_progress" },
    ])
    expect(todoProgress(todos).active?.content).toBe("b")
  })

  test("tout terminé : aucun item actif, et ce n'est pas une absence", () => {
    const todos = todosFrom([{ content: "a", status: "completed" }])
    const progress = todoProgress(todos)
    expect(progress.done).toBe(1)
    expect(progress.active).toBeUndefined()
  })

  test("une liste vide ne rend ni compte ni actif", () => {
    expect(todoProgress([])).toEqual({ done: 0, total: 0, active: undefined })
  })
})

describe("l'édition du contrat — le brouillon", () => {
  const contract = { goal: "Objectif", dod: ["a", "b"], outOfScope: ["c"] }

  test("le brouillon repart du contrat affiché, sans partager ses tableaux", () => {
    const draft = draftFrom(contract)
    expect(draft).toEqual({ goal: "Objectif", dod: ["a", "b"], outOfScope: ["c"] })
    // Modifier le brouillon ne doit **pas** toucher le contrat : sans la copie, l'annulation ne
    // ramènerait rien, puisque l'original aurait déjà changé.
    draft.dod.push("z")
    expect(contract.dod).toEqual(["a", "b"])
  })

  test("les entrées vides ne partent pas : une ligne blanche n'est pas une décision", () => {
    expect(cleanList(["  a  ", "", "   ", "b"])).toEqual(["a", "b"])
  })

  test("remplacer une entrée laisse les autres intactes", () => {
    expect(setItem(["a", "b", "c"], 1, "B")).toEqual(["a", "B", "c"])
  })

  test("un index hors bornes rend la liste inchangée", () => {
    expect(setItem(["a"], 4, "x")).toEqual(["a"])
    expect(setItem(["a"], -1, "x")).toEqual(["a"])
  })

  test("ajouter pose une entrée vide : on l'écrit ensuite", () => {
    expect(addItem(["a"])).toEqual(["a", ""])
  })

  test("retirer enlève la bonne ligne", () => {
    expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"])
  })
})

describe("l'édition du contrat — la charge envoyée au serveur", () => {
  const raw = {
    status: "active",
    source: "auto",
    goal: "ancien",
    dod: ["x"],
    outOfScope: [],
    version: 4,
    updatedAt: 1,
    findings: [{ id: "F1", summary: "à ne pas perdre" }],
    completion: { evidence: [], unverified: [], completedAt: 0 },
  }

  test("ce que l'écran ne connaît pas traverse **tel quel**", () => {
    // Le serveur **remplace** le goalState reçu : repartir de la projection effacerait `findings`
    // et `completion`, et personne ne le verrait.
    const payload = contractPayload(raw, { goal: "neuf", dod: ["y"], outOfScope: [] }, 999)
    expect(payload?.findings).toEqual(raw.findings)
    expect(payload?.completion).toEqual(raw.completion)
  })

  test("l'objectif et les listes sont détourés, les vides écartés", () => {
    const payload = contractPayload(raw, { goal: "  neuf  ", dod: ["  y  ", ""], outOfScope: ["z"] }, 999)
    expect(payload?.goal).toBe("neuf")
    expect(payload?.dod).toEqual(["y"])
    expect(payload?.outOfScope).toEqual(["z"])
  })

  test("la main de l'utilisateur est **dite** : statut édité, source utilisateur, version incrémentée", () => {
    const payload = contractPayload(raw, { goal: "neuf", dod: [], outOfScope: [] }, 999)
    expect(payload?.status).toBe("edited")
    expect(payload?.source).toBe("user")
    expect(payload?.version).toBe(5)
    expect(payload?.updatedAt).toBe(999)
  })

  test("sans état brut, il n'y a rien à envoyer — et surtout pas un objet inventé", () => {
    expect(contractPayload(undefined, { goal: "a", dod: [], outOfScope: [] })).toBeUndefined()
    expect(contractPayload(null, { goal: "a", dod: [], outOfScope: [] })).toBeUndefined()
  })

  test("une version absente repart de zéro au lieu de rendre NaN", () => {
    const payload = contractPayload({ goal: "a", dod: [], outOfScope: [] }, { goal: "b", dod: [], outOfScope: [] }, 1)
    expect(payload?.version).toBe(1)
  })
})
