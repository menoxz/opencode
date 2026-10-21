/**
 * Le serveur joint à chaque message utilisateur une partie `synthetic` qui décrit ce qui a été
 * injecté dans le contexte. **Deux formes coexistent**, toutes deux relevées sur données réelles :
 *
 *   1. `ses_edb48d77affeF6ky1NqRoE3JNH` — volumes par section :
 *
 *        Context injections · 3 section(s)
 *        - core: system prompt (PROMPT_CORE) · agent build · 5592 chars
 *        - env: environment · 391 chars
 *        - instructions: instruction files · 2 source(s) · 13891 chars (truncated)
 *
 *   2. `ses_edb48d77affeF6ky1NqRoE3JNH`, autre tour — liste de fichiers :
 *
 *        Instruction injections · 2 source(s)
 *        Instructions from: C:\Users\jeanl\.config\opencodev2\AGENTS.md
 *        Instructions from: C:\jeanluc\opencode-fork\packages\opencode\AGENTS.md
 *
 * Ces nombres disent à l'utilisateur ce qui consomme sa fenêtre — information qu'aucune autre
 * surface ne donne, et qu'aucune estimation ne peut remplacer. On les lit donc comme une structure,
 * pas comme du texte : c'est ce qui permet de replier, d'aligner et de traduire. Et c'est ce qui
 * évite qu'un bloc d'injection s'affiche comme si l'utilisateur l'avait écrit.
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
  kind: "sections" | "sources" | "firings"
  count: number
  sections: InjectionSection[]
  /** Chemins des fichiers d'instructions, pour la forme « sources ». */
  sources: string[]
  /** Gardes qui ont tiré dans le tour, pour la forme « firings ». */
  firings: GuardFiring[]
}

/** Un tir de garde-fou : l'origine (config globale ou dépôt) et le nom sont ce qu'on lit en premier. */
export type GuardFiring = {
  origin: "global" | "workspace"
  name: string
  reason?: string
}

/** En-tête des tirs : `Guards fired · 2 tir(s)`. */
const HEADER_FIRINGS = /^Guards fired\s+·\s+(\d+)\s+tir/
/** Ligne de tir : `- 🛡 guard: global/nom · raison`. L'icône est optionnelle à la lecture. */
const FIRING_LINE = /^-\s*(?:🛡\s*)?guard:\s*(global|workspace)\/(\S+?)(?:\s+·\s+(.+))?$/

/** En-tête à volumes : `Context injections · 4 section(s)`. */
const HEADER_SECTIONS = /^Context injections\s+·\s+(\d+)\s+section/
/** En-tête à fichiers : `Instruction injections · 2 source(s)`. */
const HEADER_SOURCES = /^Instruction injections\s+·\s+(\d+)\s+source/
/** Queue de ligne à volumes : `13891 chars` ou `13891 chars (truncated)`. */
const TAIL = /^(\d+)\s+chars(\s+\(truncated\))?$/
const SOURCE_LINE = /^Instructions from:\s*(.+)$/

/**
 * Ce qu'une partie **déclare** avoir injecté — la métadonnée du serveur, jamais le texte.
 *
 * Repris du TUI (`cli/cmd/tui/util/instructions-injection.ts:11-22`) : la part des instructions
 * porte `metadata.injection = "instructions"` avec `metadata.sources`, celle du contexte
 * `metadata.injection = "context"` avec `metadata.sections`. Relevé sur le serveur le 2026-10-17
 * (3 sources, 3 sections). Lire la métadonnée plutôt que le texte est ce qui rend « les instructions
 * entrent-elles dans le contexte ? » décidable **avant** que la ligne n'existe.
 */
/** L'injection à laquelle une part appartient, ou `undefined`. */
function injectionKind(part: unknown): string | undefined {
  if (!part || typeof part !== "object") return undefined
  const metadata = (part as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== "object") return undefined
  const injection = (metadata as { injection?: unknown }).injection
  return typeof injection === "string" && injection.length > 0 ? injection : undefined
}

export function declaresInjection(part: unknown): boolean {
  return injectionKind(part) !== undefined
}

/**
 * Les phases d'une injection, dans l'ordre où le serveur les écrit.
 *
 * `loading` : les fichiers d'instructions entrent dans le contexte.
 * `injecting` : ils y sont, le contexte (les sections) entre à son tour.
 * `done` : les deux parts sont écrites.
 */
export type InjectionPhase = "loading" | "injecting" | "done"

/**
 * Où en est l'injection — **par les métadonnées du serveur**, jamais par le texte.
 *
 * Le serveur écrit **deux** parts, à plusieurs secondes d'écart (mesuré le 2026-10-17 : 1,9 s puis
 * 5,1 s) : `injection: "instructions"` (les fichiers chargés) puis `injection: "context"` (les
 * sections). La ligne d'attente suit cet ordre. C'est la condition du TUI
 * (`instructionsInjecting`, `cli/cmd/tui/util/instructions-injection.ts:38-40`), étendue à la
 * seconde part — le TUI n'a qu'une ligne, la page en a deux.
 */
export function injectionPhase(parts: ReadonlyArray<unknown>, busy: boolean): InjectionPhase {
  if (!busy) return "done"
  const kinds = parts.map(injectionKind)
  if (!kinds.includes("instructions")) return "loading"
  if (!kinds.includes("context")) return "injecting"
  return "done"
}

/** Conservé pour les appelants qui ne veulent que la première phase. */
export function instructionsInjecting(parts: ReadonlyArray<unknown>, busy: boolean): boolean {
  return injectionPhase(parts, busy) === "loading"
}

/**
 * Lit un bloc d'injections, quelle que soit sa forme. Renvoie `undefined` quand le texte n'en est
 * pas un — c'est ce qui distingue une injection d'un prompt réellement écrit par l'utilisateur,
 * sans dépendre du seul drapeau `synthetic` (d'autres parties peuvent le porter).
 */
export function parseInjections(text: string | undefined): Injections | undefined {
  if (!text) return undefined
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const first = lines[0] ?? ""

  const sectionsHeader = HEADER_SECTIONS.exec(first)
  if (sectionsHeader) {
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
    return sections.length > 0
      ? { kind: "sections", count: Number(sectionsHeader[1]), sections, sources: [], firings: [] }
      : undefined
  }

  const sourcesHeader = HEADER_SOURCES.exec(first)
  if (sourcesHeader) {
    const sources: string[] = []
    for (const line of lines.slice(1)) {
      const match = SOURCE_LINE.exec(line)
      if (match?.[1]) sources.push(match[1].trim())
    }
    return sources.length > 0
      ? { kind: "sources", count: Number(sourcesHeader[1]), sections: [], sources, firings: [] }
      : undefined
  }

  const firingsHeader = HEADER_FIRINGS.exec(first)
  if (firingsHeader) {
    const firings: GuardFiring[] = []
    for (const line of lines.slice(1)) {
      const match = FIRING_LINE.exec(line)
      if (!match) continue
      firings.push({
        origin: match[1] as GuardFiring["origin"],
        name: match[2] ?? "",
        reason: match[3]?.trim(),
      })
    }
    return firings.length > 0
      ? { kind: "firings", count: Number(firingsHeader[1]), sections: [], sources: [], firings }
      : undefined
  }

  return undefined
}

/**
 * Traduction des clés du serveur. Le nom technique n'est pas un mot d'écran ; une clé inconnue
 * garde son libellé d'origine plutôt que de disparaître — une section non prévue doit rester
 * visible, c'est justement celle qu'on n'attendait pas.
 */
const LABELS: Record<string, string> = {
  core: "system prompt",
  env: "environment",
  instructions: "instruction files",
  skills: "skills",
}

export function injectionLabel(section: InjectionSection): string {
  return LABELS[section.key] ?? section.label
}

/** Volume lisible : `13891` → `13.9k`. Au-delà de 1000 on abrège, en dessous on compte. */
export function formatChars(chars: number): string {
  if (chars < 1000) return String(chars)
  return `${(chars / 1000).toFixed(1)}k`
}

/** Part du total, pour une barre de proportion. Renvoie 0 quand le total est nul. */
export function share(chars: number, total: number): number {
  if (total <= 0) return 0
  return chars / total
}

/**
 * Chemin lisible d'un fichier d'instructions : les trois derniers segments, précédés de `…` quand
 * le chemin est tronqué. Deux `AGENTS.md` de dossiers différents restent ainsi distincts à l'écran,
 * là où un simple nom de fichier les confondrait.
 */
export function sourceLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) return parts.join("\\")
  return `…\\${parts.slice(-3).join("\\")}`
}

/**
 * Un chemin rendu **relatif à une base**, ou `undefined` s'il n'est pas dessous.
 *
 * C'est ce qui décide si le contenu d'un fichier d'instructions peut être lu : `/file/content` résout
 * `path` **sous la racine du projet** et rien d'autre. Mesuré sur l'instance de développement :
 * `path=AGENTS.md&directory=<projet>/packages/opencode` rend 7 291 octets, `path=<chemin absolu>` rend
 * une chaîne vide, et un fichier **hors** du projet rend une erreur 500. Or les injections portent des
 * chemins absolus — dont `~/.config/opencodev2/AGENTS.md`, qui est hors projet par nature. On ne peut
 * donc lire que ce qui est sous la base, et il faut le dire plutôt que d'afficher une boîte vide.
 *
 * Le séparateur est normalisé : un chemin Windows relu tel quel ne se compare pas à un chemin à `/`.
 */
export function relativeTo(path: string, base: string): string | undefined {
  const normal = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "")
  const target = normal(path)
  const root = normal(base)
  if (!root || !target) return undefined
  if (target.toLowerCase() === root.toLowerCase()) return undefined
  if (!target.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return undefined
  return target.slice(root.length + 1)
}
