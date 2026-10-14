/**
 * Le **plan** d'une session, tel qu'il s'affiche juste au-dessus du compositeur : ses todos, et le
 * contrat de tâche (objectif, Definition of Done, hors-périmètre).
 *
 * Deux sources distinctes, et c'est voulu :
 *
 * - les **todos** viennent de `GET /session/{id}/todo` — une liste plate `{content, status, priority}`,
 *   que l'agent réécrit au fil du travail (`todowrite`) ;
 * - le **contrat** vient de `GET /session/{id}` → `goalState` — l'objectif posé au départ, sa DoD et
 *   ce qui est hors-périmètre.
 *
 * Ce module est **pur** : il ne connaît ni le JSX ni le réseau, donc il se vérifie par des tests.
 */

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

export type TodoView = {
  content: string
  status: TodoStatus
  priority?: string
}

export type ContractView = {
  goal: string
  dod: string[]
  outOfScope: string[]
  /** L'état du contrat côté serveur — `active`, `completed`, `skipped`… */
  status?: string
  /** D'où il vient — `auto` quand il a été déduit, `user` quand il a été posé. */
  source?: string
}

const TODO_STATUSES: readonly TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"]

function todoStatus(value: unknown): TodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value)
    ? (value as TodoStatus)
    : "pending"
}

/** Les todos, projetés — une entrée sans contenu ne dit rien et ne s'affiche pas. */
export function todosFrom(payload: unknown): TodoView[] {
  if (!Array.isArray(payload)) return []
  const out: TodoView[] = []
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as { content?: unknown; status?: unknown; priority?: unknown }
    if (typeof row.content !== "string" || row.content.trim().length === 0) continue
    out.push({
      content: row.content.trim(),
      status: todoStatus(row.status),
      priority: typeof row.priority === "string" ? row.priority : undefined,
    })
  }
  return out
}

/** Les chaînes d'une liste du contrat — les entrées vides sont écartées, elles ne disent rien. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * Le contrat, projeté — `undefined` quand il n'a **rien à dire**.
 *
 * C'est le cas le plus fréquent : le serveur rend un `goalState` d'état `skipped` avec un objectif
 * vide et une DoD vide sur toute session qui n'a pas reçu de contrat. Afficher un cadre vide pour
 * cela serait du mobilier ; ne rien afficher est la bonne réponse (CIBLE §8).
 */
export function contractFrom(payload: unknown): ContractView | undefined {
  const goalState =
    payload && typeof payload === "object" ? (payload as { goalState?: unknown }).goalState : undefined
  if (!goalState || typeof goalState !== "object") return undefined
  const state = goalState as { goal?: unknown; dod?: unknown; outOfScope?: unknown; status?: unknown; source?: unknown }
  const goal = typeof state.goal === "string" ? state.goal.trim() : ""
  const dod = strings(state.dod)
  const outOfScope = strings(state.outOfScope)
  if (!goal && dod.length === 0 && outOfScope.length === 0) return undefined
  return {
    goal,
    dod,
    outOfScope,
    status: typeof state.status === "string" ? state.status : undefined,
    source: typeof state.source === "string" ? state.source : undefined,
  }
}

/**
 * L'avancement : combien de todos sont faites, et **laquelle est en cours**.
 *
 * L'item en cours est la seule information qui mérite de s'afficher au repos : c'est ce que l'agent
 * fait maintenant. Le compte dit où l'on en est ; la liste entière se déplie à la demande.
 *
 * Un item `in_progress` a la priorité sur un `pending` : quand l'agent a marqué ce qu'il fait, c'est
 * cela qu'on montre, même s'il reste des items avant lui dans l'ordre.
 */
export function todoProgress(todos: TodoView[]): {
  done: number
  total: number
  active?: TodoView
} {
  const done = todos.filter((todo) => todo.status === "completed").length
  const active =
    todos.find((todo) => todo.status === "in_progress") ?? todos.find((todo) => todo.status === "pending")
  return { done, total: todos.length, active }
}

/* =============================================================================
   L'édition du contrat.

   Le contrat est **inscriptible** : `PATCH /session/{id}` accepte un `goalState`. Prouvé par un
   PATCH réel sur le bac à sable — 200, l'objectif relu portait la modification, `version` 5 → 6.
   L'écran écrit donc par la route qui existe, sans en ajouter aucune.

   Ce que l'édition change est **la décision** : l'objectif, les items de DoD, le hors-périmètre. Ce
   qui l'entoure (`findings`, `completion`, `compaction`) est **repris tel quel** — l'écran n'en
   connaît pas le sens, et le perdre serait une perte de données silencieuse.
   ============================================================================= */

/** Le contrat en cours d'édition : trois champs, tous du texte libre. */
export type ContractDraft = {
  goal: string
  dod: string[]
  outOfScope: string[]
}

export function draftFrom(contract: ContractView): ContractDraft {
  return { goal: contract.goal, dod: [...contract.dod], outOfScope: [...contract.outOfScope] }
}

/** Les entrées vides ne partent pas : une ligne blanche n'est pas une décision. */
export function cleanList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0)
}

/** Remplace une entrée — un index hors bornes rend la liste inchangée. */
export function setItem(items: string[], index: number, value: string): string[] {
  if (index < 0 || index >= items.length) return items
  return items.map((item, at) => (at === index ? value : item))
}

export function addItem(items: string[]): string[] {
  return [...items, ""]
}

export function removeItem(items: string[], index: number): string[] {
  return items.filter((_, at) => at !== index)
}

/**
 * Le `goalState` à envoyer : l'état **brut** du serveur, moins ce que l'écran a décidé.
 *
 * On repart de l'état brut, jamais de la projection : le schéma exige `status`, `source`, `version`
 * et `updatedAt`, et le serveur **remplace** l'objet reçu — envoyer la seule projection effacerait
 * `findings` et `completion`.
 */
export function contractPayload(
  raw: unknown,
  draft: ContractDraft,
  now: number = Date.now(),
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const base = raw as Record<string, unknown>
  const version = typeof base.version === "number" ? base.version : 0
  return {
    ...base,
    goal: draft.goal.trim(),
    dod: cleanList(draft.dod),
    outOfScope: cleanList(draft.outOfScope),
    // Une main d'utilisateur a touché le contrat : c'est exactement ce que disent ces deux champs.
    status: "edited",
    source: "user",
    version: version + 1,
    updatedAt: now,
  }
}
