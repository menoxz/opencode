/**
 * Le serveur joint à chaque message utilisateur une partie `synthetic` qui décrit ce qui a été
 * injecté dans le contexte. Relevé sur données réelles (`ses_edb48d77affeF6ky1NqRoE3JNH`,
 * `ses_f068fa00bffeFPQlEjhYB5em1F`) :
 *
 *   Context injections · 3 section(s)
 *   - core: system prompt (PROMPT_CORE) · agent build · 5592 chars
 *   - env: environment · 391 chars
 *   - instructions: instruction files · 2 source(s) · 13891 chars (truncated)
 *   - skills: skill summary · 6764 chars
 *
 * Ces nombres disent à l'utilisateur ce qui consomme sa fenêtre — information qu'aucune autre
 * surface ne donne, et qu'aucune estimation ne peut remplacer. On les lit donc comme une
 * structure, pas comme du texte : c'est ce qui permet de replier, d'aligner et de traduire.
 */

export type InjectionSection = {
  /** Clé stable du serveur : `core`, `env`, `instructions`, `skills`… */
  key: string
  /** Libellé d'origine, conservé pour un serveur qui ajouterait une section inconnue. */
  label: string
  /** Précision facultative : « agent build », « 2 source(s) ». */
  detail?: string
  chars: number
  truncated: boolean
}

export type Injections = {
  count: number
  sections: InjectionSection[]
}

/** En-tête : `Context injections · 4 section(s)`. */
const HEADER = /^Context injections\s+·\s+(\d+)\s+section/
/** Queue de ligne : `13891 chars` ou `13891 chars (truncated)`. */
const TAIL = /^(\d+)\s+chars(\s+\(truncated\))?$/

/**
 * Lit le bloc d'injections. Renvoie `undefined` quand le texte n'en est pas un — c'est ce qui
 * distingue une injection d'un prompt réellement écrit par l'utilisateur, sans dépendre du
 * drapeau `synthetic` seul (un serveur peut marquer d'autres parties comme synthétiques).
 */
export function parseInjections(text: string | undefined): Injections | undefined {
  if (!text) return undefined
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const header = lines.length > 0 ? HEADER.exec(lines[0] ?? "") : null
  if (!header) return undefined

  const sections: InjectionSection[] = []
  for (const line of lines.slice(1)) {
    if (!line.startsWith("-")) continue
    const body = line.slice(1).trim()
    const colon = body.indexOf(":")
    if (colon === -1) continue
    const key = body.slice(0, colon).trim()
    const parts = body
      .slice(colon + 1)
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean)
    const tail = parts.length > 0 ? TAIL.exec(parts[parts.length - 1] ?? "") : null
    if (!tail) continue
    const head = parts.slice(0, -1)
    sections.push({
      key,
      label: head[0] ?? key,
      detail: head.length > 1 ? head.slice(1).join(" · ") : undefined,
      chars: Number(tail[1]),
      truncated: Boolean(tail[2]),
    })
  }

  return sections.length > 0 ? { count: Number(header[1]), sections } : undefined
}

/**
 * Traduction des clés du serveur. Le nom technique n'est pas un mot d'écran ; une clé inconnue
 * garde son libellé d'origine plutôt que de disparaître — une section non prévue doit rester
 * visible, c'est justement celle qu'on n'attendait pas.
 */
const LABELS: Record<string, string> = {
  core: "invite système",
  env: "environnement",
  instructions: "fichiers d'instructions",
  skills: "compétences",
}

export function injectionLabel(section: InjectionSection): string {
  return LABELS[section.key] ?? section.label
}

/** Volume lisible : `13891` → `13,9 k`. Au-delà de 1000 on abrège, en dessous on compte. */
export function formatChars(chars: number): string {
  if (chars < 1000) return String(chars)
  return `${(chars / 1000).toFixed(1).replace(".", ",")} k`
}

/** Part du total, pour une barre de proportion. Renvoie 0 quand le total est nul. */
export function share(chars: number, total: number): number {
  if (total <= 0) return 0
  return chars / total
}
