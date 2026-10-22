import type { Part } from "@opencode-ai/sdk/v2"

/**
 * Les instructions chargées automatiquement (AGENTS.md global et projet, fichiers
 * `*.instructions.md`) sont injectées à **chaque étape** et persistées une fois par message
 * utilisateur, dans une part **synthétique et ignorée** portant
 * `metadata.injection = "instructions"` et `metadata.sources`. Le fil la masquait : elle
 * n'était visible que dans les Logs. Seules les sources **déclarées** comptent — rien n'est
 * déduit du texte de la part — et une source qui n'est pas une chaîne est ignorée.
 */
export function instructionSources(parts: Part[]): string[] {
  const carrier = parts.findLast(
    (part): part is Extract<Part, { type: "text" }> =>
      part.type === "text" && part.metadata?.injection === "instructions",
  )
  const sources = (carrier?.metadata as { sources?: unknown } | undefined)?.sources
  if (!Array.isArray(sources)) {
    return []
  }

  return sources.filter((item): item is string => typeof item === "string")
}

/** En-tête de la ligne. Zéro source connue = les instructions **entrent** dans le contexte. */
export function instructionsHeading(count: number): string {
  if (count === 0) {
    return "core/instructions: injecting"
  }

  return `core/instructions: ${count} source${count === 1 ? "" : "s"}`
}

/**
 * La part qui porte les sources est écrite **au moment** de l'injection : sa présence veut
 * dire « les instructions sont dans le contexte ». L'animation ne dit donc que cela, et
 * s'arrête là — elle ne tourne pas pendant toute la réponse.
 *
 * Un message qui porte la part de `compaction` est exclu : ce tour-là n'envoie pas son prompt
 * au modèle, il est rejoué dans un message **neuf** après le résumé, et c'est ce message neuf
 * qui reçoit les sources. Sans cette garde, la ligne restait sur `injecting` pendant toute la
 * compaction **et** tout le tour qui suit, la session n'étant pas au repos (mesuré le
 * 2026-10-20 sur une session réelle : message utilisateur dont l'unique part est `compaction`).
 */
export function instructionsInjecting(input: {
  sources: string[]
  busy: boolean
  compaction: boolean
  /**
   * Le prompt est encore en file (QUEUED) ou part en steer : il n'est **pas** en train d'être
   * injecté. Sans cette garde, la ligne s'affichait sur un prompt que le run n'avait pas encore
   * pris — elle annonçait une injection qui n'avait pas commencé.
   */
  pending?: boolean
  /**
   * Le run a déjà écrit une réponse pour ce prompt : l'injection est finie depuis longtemps.
   * Une part de sources manquante ne doit donc pas laisser l'animation tourner indéfiniment —
   * cas mesuré sur un prompt livré par la file.
   */
  answered?: boolean
}): boolean {
  if (input.pending === true) return false
  if (input.answered === true) return false
  return input.busy && !input.compaction && input.sources.length === 0
}
