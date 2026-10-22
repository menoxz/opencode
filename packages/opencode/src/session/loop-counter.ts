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

/**
 * Rappel à ajouter avant le step qui va commencer, ou `undefined` s'il n'y a rien à dire.
 *
 * Le premier step d'une invocation n'a pas de boucle précédente : le compter comme
 * sous-rempli rappellerait la règle pour la toute première décision, où l'agent n'a encore
 * rien pu regrouper.
 */
export function batchNudge(input: {
  steps: readonly StepLike[]
  nudged: number
  maxNudges?: number
  threshold?: number
}): { text: string; calls: number } | undefined {
  if (input.steps.length === 0) return undefined
  const calls = input.steps.at(-1)?.toolCalls?.length ?? 0
  // Zéro appel ne veut pas dire « boucle sous-remplie » : c'est le modèle qui s'arrête de
  // travailler. Le rappeler là reviendrait à lui demander de continuer un tour terminé.
  if (calls < 1) return undefined
  if (calls > (input.threshold ?? UNDERFILLED_THRESHOLD)) return undefined
  if (input.nudged >= (input.maxNudges ?? MAX_NUDGES)) return undefined
  return { text: nudgeText(calls), calls }
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
