/**
 * Compteur de boucles : un tour modèle = un step. Le gaspillage mesuré dans ce projet n'est
 * pas « trop de boucles » mais « une boucle par appel » — 51 % des steps n'émettent qu'un
 * seul appel outil, alors que plusieurs étaient indépendants et pouvaient partir ensemble.
 *
 * Ce module ne mesure que ce qui est observable côté harnais : le nombre d'appels émis au
 * step précédent. Il ne peut pas savoir combien d'appels *étaient possibles* ; il rappelle
 * donc la règle au moment où elle s'applique, et laisse le modèle trancher. C'est une
 * consigne d'exécution, pas une contrainte : rien n'interdit d'éditer dès la deuxième
 * boucle, et mélanger lectures et éditions dans une même boucle est le comportement visé.
 */

/** Marqueur du rappel, pour retirer un rappel précédent avant d'ajouter le nouveau. */
export const LOOP_COUNTER_MARKER = "<!--loop-counter-->"

/** Nombre de rappels par invocation fournisseur : au-delà, le bruit coûte plus que le gain. */
export const MAX_NUDGES = 2

/** Seuil en dessous duquel une boucle est considérée comme sous-remplie. */
export const UNDERFILLED_THRESHOLD = 1

/** Forme minimale d'un step, pour ne pas dépendre du type du SDK. */
export interface StepLike {
  readonly toolCalls?: readonly unknown[]
}

/** Nombre d'appels outils de chaque step déjà exécuté. */
export function callsPerStep(steps: readonly StepLike[]): number[] {
  return steps.map((step) => step.toolCalls?.length ?? 0)
}

/** Message assistant, réduit à ce qui compte pour compter ses appels. */
export interface AssistantLike {
  role?: string
  content?: unknown
}

/**
 * Nombre d'appels outils portés par un message assistant.
 *
 * Indispensable pour voir **entre** les tours : `steps` ne décrit que l'invocation en cours,
 * et se vide à chaque nouveau tour. Or le gaspillage mesuré est justement un tour qui n'émet
 * qu'un appel puis continue — information qui n'existe que dans l'historique.
 */
export function assistantToolCalls(message: AssistantLike): number {
  const content = message.content
  if (!Array.isArray(content)) return 0
  return content.filter(
    (part) => part !== null && typeof part === "object" && (part as { type?: unknown }).type === "tool-call",
  ).length
}

/** Dernier message assistant de la conversation, s'il y en a un. */
export function lastAssistant<T extends AssistantLike>(messages: readonly T[]): T | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === "assistant") return message
  }
  return undefined
}

/**
 * Vrai si le message est un **vrai** tour utilisateur, c'est-à-dire un prompt portant une
 * part `text`.
 *
 * Les rappels injectés voyagent aussi en `role: "user"` avec un contenu chaîne. Les compter
 * comme tours décalait la frontière d'un tour : relevé live, la tranche retenue était
 * `[rappel, rappel]`, donc 0 appel, alors que le tour venait d'émettre un appel.
 */
export function isUserTurn(message: AssistantLike): boolean {
  if (message.role !== "user" || !Array.isArray(message.content)) return false
  return message.content.some(
    (part) => part !== null && typeof part === "object" && (part as { type?: unknown }).type === "text",
  )
}

/**
 * Vrai pour un message utilisateur qui n'est **pas** un prompt de l'utilisateur : cartes
 * injectées en queue (working state, rappels). Elles portent un contenu texte brut et
 * commencent par `<system-reminder>` ou `<!--`.
 *
 * Sans ce filtre, la frontière de tour est introuvable : releve live — deux runs identiques
 * ont donné 0 puis 1 parce que la carte injectée se faisait passer pour le dernier prompt.
 */
export function isInjectedUserMessage(message: AssistantLike): boolean {
  if (message.role !== "user") return false
  const content = message.content
  if (typeof content !== "string") return false
  const head = content.trimStart()
  return head.startsWith("<system-reminder>") || head.startsWith("<!--")
}

/**
 * Appels outils émis par le **tour précédent**, c'est-à-dire entre l'avant-dernier et le
 * dernier vrai prompt utilisateur.
 *
 * Lire seulement le dernier message assistant ne marche pas : le dernier est la réponse
 * finale du tour, celle qui n'émet aucun appel. Mesuré en live — `previousTurnCalls=0`
 * alors que le tour venait d'émettre un appel. C'est donc l'intervalle du tour qu'il faut
 * sommer, en excluant les messages injectés qui brouillent la frontière.
 */
export function previousTurnToolCalls(messages: readonly AssistantLike[]): number | undefined {
  const userTurns: number[] = []
  for (let index = messages.length - 1; index >= 0 && userTurns.length < 2; index--) {
    const message = messages[index]
    if (message?.role !== "user") continue
    if (isInjectedUserMessage(message)) continue
    userTurns.push(index)
  }
  if (userTurns.length < 2) return undefined
  const previous = userTurns[1]!
  const current = userTurns[0]!
  let total = 0
  for (let index = previous; index < current; index++) {
    total += assistantToolCalls(messages[index]!)
  }
  return total
}

/** D'où vient le constat, pour que la trace permette de distinguer les deux cas. */
export type NudgeScope = "step" | "turn"

/**
 * Rappel à ajouter avant le step qui va commencer, ou `undefined` s'il n'y a rien à dire.
 *
 * Deux cas, et un seul est un vrai gaspillage :
 * - step > 1 : la boucle précédente de cette invocation n'a émis qu'un appel ;
 * - step 1 : le **tour précédent** n'a émis qu'un appel puis a continué.
 *
 * Zéro appel n'est jamais un rappel : c'est une réponse terminée, pas une boucle sous-remplie.
 */
export function batchNudge(input: {
  steps: readonly StepLike[]
  nudged: number
  previousTurnCalls?: number
  maxNudges?: number
  threshold?: number
}): { text: string; calls: number; scope: NudgeScope } | undefined {
  const threshold = input.threshold ?? UNDERFILLED_THRESHOLD
  if (input.nudged >= (input.maxNudges ?? MAX_NUDGES)) return undefined

  if (input.steps.length === 0) {
    const previous = input.previousTurnCalls
    if (previous === undefined || previous < 1 || previous > threshold) return undefined
    return { text: nudgeText(previous), calls: previous, scope: "turn" }
  }

  const calls = input.steps.at(-1)?.toolCalls?.length ?? 0
  if (calls < 1) return undefined
  if (calls > threshold) return undefined
  return { text: nudgeText(calls), calls, scope: "step" }
}

/**
 * Texte du rappel. Volontairement court : il voyage à chaque step concerné, et il est
 * réinjecté dans une conversation déjà longue.
 */
export function nudgeText(calls: number): string {
  const count = `${calls} tool call${calls === 1 ? "" : "s"}`
  return [
    "<system-reminder>",
    LOOP_COUNTER_MARKER,
    `Loop counter: the previous step issued ${count}.`,
    "Issue every independent call together in this single step: several reads, several searches, several edits, or a read and an edit that do not depend on each other.",
    "One-call loops are the main source of wasted turns here; editing early is encouraged as soon as the scope is clear.",
    "</system-reminder>",
  ].join("\n")
}

/** Vrai si le message porte un rappel du compteur. */
export function isLoopNudge(message: { content?: unknown }): boolean {
  const content = message.content
  if (typeof content === "string") return content.includes(LOOP_COUNTER_MARKER)
  if (!Array.isArray(content)) return false
  return content.some(
    (part) =>
      part !== null &&
      typeof part === "object" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.includes(LOOP_COUNTER_MARKER),
  )
}

/**
 * Retire les rappels précédents. Sans cela, un rappel ajouté au step N serait rejoué aux
 * steps N+1… et le compteur deviendrait lui-même la pollution qu'il dénonce.
 */
export function stripLoopNudge<T extends { content?: unknown }>(messages: readonly T[]): T[] {
  return messages.filter((message) => !isLoopNudge(message))
}
