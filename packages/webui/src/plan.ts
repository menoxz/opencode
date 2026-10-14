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
