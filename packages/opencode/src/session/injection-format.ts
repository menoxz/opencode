/**
 * Formatage du bloc « Context injections » joint au message utilisateur.
 *
 * Extrait de `prompt.ts` pour une raison précise : ce texte est **lu** par la webui
 * (`packages/webui/src/injections.ts`), qui le découpe en sections. Tant que le format vivait en
 * ligne dans la boucle, rien ne garantissait qu'une section ajoutée côté serveur reste lisible côté
 * affichage — et une ligne mal formée disparaît sans erreur, ce qui est le pire des échecs.
 *
 * Fonction pure : aucun accès au disque, aucun service. Testable des deux côtés de la frontière.
 */

export type InjectionSectionLine = {
  /** Clé stable : `core`, `env`, `instructions`, `skills`, `guards`… */
  section: string
  /** Libellé affiché, suivi éventuellement d'un détail séparé par ` · `. */
  label: string
  /** Taille du texte réellement injecté, en caractères. */
  size: number
  truncated?: boolean
}

/**
 * En-tête du bloc. La webui l'attend sous la forme `Context injections · N section(s)`.
 */
export function formatInjectionHeader(count: number): string {
  return `Context injections · ${count} section(s)`
}

/**
 * Une ligne de section : `- clé: libellé · N chars`, suffixée `(truncated)` quand le texte a été
 * coupé. Le séparateur ` · ` est celui que le parseur utilise pour distinguer libellé et détail.
 */
export function formatInjectionLine(entry: InjectionSectionLine): string {
  return `- ${entry.section}: ${entry.label} · ${entry.size} chars${entry.truncated ? " (truncated)" : ""}`
}

/** Le bloc complet, prêt à être écrit dans la partie `synthetic` du message. */
export function formatInjectionBlock(sections: InjectionSectionLine[]): string {
  return [formatInjectionHeader(sections.length), ...sections.map(formatInjectionLine)].join("\n")
}
