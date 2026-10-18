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
 */
export function instructionsInjecting(sources: string[], busy: boolean): boolean {
  return busy && sources.length === 0
}
