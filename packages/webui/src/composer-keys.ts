/**
 * La couche clavier et suggestions de la saisie — pure, donc testable sans navigateur.
 *
 * Elle existe séparément pour une raison de méthode : ce sont des décisions (où commence une mention,
 * ce qu'un `Tab` change, quand deux `Échap` valent un arrêt), et une décision se vérifie par un test,
 * pas par une capture d'écran. Le composant, lui, ne fait que brancher ces fonctions sur des
 * événements.
 */

import type { Message } from "./view-model"

/** Un choix de commande, réduit à ce que la liste affiche. */
export type CommandChoice = {
  name: string
  description?: string
  /** `command`, `mcp` ou `skill` — la provenance se dit, elle distingue un raccourci d'un outil. */
  source?: string
}

/** Un remplacement dans le texte, avec la position du curseur qui va avec. */
export type Edit = { text: string; caret: number }

/* -----------------------------------------------------------------------------
   La commande — `/`
   -------------------------------------------------------------------------- */

/**
 * La requête de commande, ou `undefined` s'il n'y en a pas.
 *
 * Une commande ne s'écrit qu'**en tête** et sans espace encore : dès qu'un espace apparaît, on écrit
 * l'argument de la commande, et la liste n'a plus rien à proposer. C'est ce qui la fait disparaître
 * toute seule, sans code de fermeture.
 */
export function slashQuery(text: string): string | undefined {
  if (!text.startsWith("/")) return undefined
  if (text.includes("\n") || text.includes(" ")) return undefined
  return text.slice(1)
}

/**
 * Le `@` sous le curseur, ou `undefined`.
 *
 * Un `@` n'ouvre une mention que s'il **commence un mot** : dans `moi@exemple.com`, il est au milieu
 * d'un mot, et proposer des fichiers là serait absurde. La mention court jusqu'au prochain blanc —
 * c'est `end` qui dit quoi remplacer, pas la position du curseur.
 */
export function mentionQuery(
  text: string,
  caret: number,
): { query: string; start: number; end: number } | undefined {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf("@")
  if (at < 0) return undefined
  const previous = at === 0 ? "" : before[at - 1]!
  if (previous && !/\s/.test(previous)) return undefined
  const token = before.slice(at + 1)
  if (/\s/.test(token)) return undefined
  const stop = text.slice(caret).search(/\s/)
  const end = stop < 0 ? text.length : caret + stop
  return { query: token, start: at, end }
}

/** Remplace `[start, end)` par `insert`, et pose le curseur après ce qui vient d'être inséré. */
export function replaceRange(text: string, start: number, end: number, insert: string): Edit {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length }
}

/** Ce qu'on écrit quand on choisit une commande : son nom, puis un espace pour son argument. */
export function commandInsert(name: string): string {
  return `/${name} `
}

/** Ce qu'on écrit quand on choisit un fichier : son chemin, puis un espace. */
export function fileInsert(path: string): string {
  return `${path} `
}

/**
 * Le filtre des commandes : le **nom** d'abord, la description ensuite.
 *
 * Le nom d'abord parce qu'on tape le début d'un nom ; la description ensuite parce qu'on cherche
 * parfois « comment on fait un commit » sans connaître le nom du raccourci. Un filtre qui ne
 * regarderait que le nom rendrait cette seconde recherche impossible.
 */
export function filterCommands(commands: CommandChoice[], query: string): CommandChoice[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return commands
  return commands.filter(
    (command) =>
      command.name.toLowerCase().includes(needle) ||
      (command.description ?? "").toLowerCase().includes(needle),
  )
}

/** La projection des commandes du serveur — jamais la charge brute, qui porte les gabarits entiers. */
export function commandChoices(payload: unknown): CommandChoice[] {
  if (!Array.isArray(payload)) return []
  const out: CommandChoice[] = []
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue
    const command = entry as { name?: unknown; description?: unknown; source?: unknown }
    if (typeof command.name !== "string" || !command.name.trim()) continue
    out.push({
      name: command.name.trim(),
      description: typeof command.description === "string" ? command.description : undefined,
      source: typeof command.source === "string" ? command.source : undefined,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/* -----------------------------------------------------------------------------
   Le clavier
   -------------------------------------------------------------------------- */

/** La fenêtre pendant laquelle deux `Échap` valent un arrêt. */
export const ESC_ABORT_WINDOW_MS = 700

/**
 * Deux `Échap` rapprochés valent un arrêt — et c'est un **choix** : `Échap` seul ferme les listes,
 * donc l'arrêt ne peut pas être sur une seule pression sans fermer les listes par accident. La fenêtre
 * est assez large pour être atteignable, assez courte pour ne pas arrêter par inadvertance.
 */
export function isDoubleEscape(previous: number | undefined, now: number): boolean {
  return previous !== undefined && now - previous <= ESC_ABORT_WINDOW_MS
}

/**
 * Le choix suivant, en boucle — ce que fait `Tab` sur l'agent.
 *
 * Une valeur absente de la liste y entre au premier rang plutôt que de repartir de zéro : une valeur
 * que le serveur accepte mais ne publie pas (un agent configuré à la main) ne doit pas être un cul-de-sac.
 */
export function nextChoice(choices: Array<{ value: string }>, current: string): string {
  if (choices.length === 0) return current
  const index = choices.findIndex((entry) => entry.value === current)
  if (index < 0) return choices[0]!.value
  return choices[(index + 1) % choices.length]!.value
}

/* -----------------------------------------------------------------------------
   L'historique des prompts
   -------------------------------------------------------------------------- */

/**
 * L'historique, du plus récent au plus ancien.
 *
 * Il est **dérivé des messages** plutôt que tenu dans un signal : une liste tenue à part se
 * désynchronise de la session (changement de session, reprise, rechargement), et l'historique
 * montrerait alors des prompts qui ne sont pas dans le fil qu'on regarde.
 */
export function promptHistory(messages: Message[]): string[] {
  const out: string[] = []
  for (const message of messages) {
    if (message.info.role !== "user") continue
    const text = message.parts
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("")
      .trim()
    if (text) out.push(text)
  }
  return out.reverse()
}

/**
 * Un pas dans l'historique.
 *
 * `index` vaut `-1` quand on n'y est pas encore : c'est l'état d'un brouillon neuf. Monter depuis
 * `-1` va au plus récent ; descendre depuis `0` **revient au brouillon vide**, sinon on resterait
 * prisonnier de l'historique sans moyen d'en sortir.
 */
export function historyStep(
  history: string[],
  index: number,
  direction: "up" | "down",
): { text: string; index: number } {
  if (history.length === 0) return { text: "", index: -1 }
  if (direction === "up") {
    const next = Math.min(index + 1, history.length - 1)
    return { text: history[next]!, index: next }
  }
  if (index <= 0) return { text: "", index: -1 }
  return { text: history[index - 1]!, index: index - 1 }
}
