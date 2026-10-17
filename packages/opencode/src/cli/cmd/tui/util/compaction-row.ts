/**
 * La part de compaction ne porte **aucun texte** et le bloc `Compacted context` n'apparaît
 * qu'avec le message porteur du résumé, à la fin : entre les deux, le fil n'affiche rien et
 * une session qui travaille ressemble à une session figée. Ces deux verdicts décident de la
 * ligne d'attente, et rien de plus.
 */

/**
 * Vrai si un message **postérieur** porte déjà le résumé — c'est lui qui prend le relais.
 *
 * La comparaison est **stricte** (`=== true`) à dessein : un message utilisateur porte lui
 * aussi un `summary`, mais sous forme d'objet (`{ title, body, diffs }`) — un simple test de
 * véracité prendrait le résumé de diffs d'un tour antérieur pour la fin de la compaction.
 */
export function summaryAfter(
  messages: readonly { id: string; role: string; summary?: unknown }[],
  messageID: string,
): boolean {
  const index = messages.findIndex((message) => message.id === messageID)
  if (index < 0) return false
  return messages.slice(index + 1).some((message) => message.role === "assistant" && message.summary === true)
}

/**
 * Le travail est **en cours** si ce message porte la part, que la session tourne encore, et
 * qu'aucun résumé n'existe après lui. La troisième condition est celle qui compte : un tour
 * continue après la compaction, donc « occupé » seul ferait tourner l'animation jusqu'à la
 * fin de la réponse.
 */
export function compactionRunning(input: { carries: boolean; busy: boolean; summaryReady: boolean }): boolean {
  return input.carries && input.busy && !input.summaryReady
}
