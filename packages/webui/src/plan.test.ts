import { describe, expect, test } from "vitest"
import { contractFrom, todoProgress, todosFrom } from "./plan"

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
