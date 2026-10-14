import type { JSX } from "solid-js"
import { toolIcon, toolVerb, type ToolIconName } from "./tool-icons"

/**
 * Icônes d'outil dessinées en primitives SVG plutôt qu'en glyphes Unicode : un glyphe dépend de la
 * police du système (rendu variable, parfois absent), une primitive non. Trait fin, monochrome,
 * 24×24 — la même grammaire que la marque.
 *
 * Chaque forme tient en deux ou trois éléments : à 14px, un dessin plus fin devient de la bouillie.
 */
const SHAPES: Record<ToolIconName, () => JSX.Element> = {
  read: () => (
    <>
      <path d="M6 3h7l5 5v13H6z" />
      <path d="M13 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  write: () => (
    <>
      <path d="M4 20l4.5-1.2L19 8.3l-3.3-3.3L5.2 15.5z" />
      <path d="M15.7 5l3.3 3.3" />
    </>
  ),
  shell: () => (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 10l3 2.5-3 2.5" />
      <path d="M13 15h4" />
    </>
  ),
  search: () => (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  subagent: () => (
    <>
      <rect x="3" y="4" width="10" height="7" rx="2" />
      <rect x="11" y="13" width="10" height="7" rx="2" />
      <path d="M8 11v5h3" />
    </>
  ),
  ask: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.6a2.6 2.6 0 1 1 3.2 2.6v1.6" />
      <path d="M12.6 17h.01" />
    </>
  ),
  plan: () => (
    <>
      <path d="M3 19V5" />
      <path d="M3 13h4.5l3-6 4 7H21" />
    </>
  ),
  todo: () => (
    <>
      <path d="M4 7h2M9 7h11" />
      <path d="M4 12h2M9 12h11" />
      <path d="M4 17h2M9 17h11" />
    </>
  ),
  skill: () => (
    <>
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
    </>
  ),
  web: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c3 3.6 3 14.4 0 18M12 3c-3 3.6-3 14.4 0 18" />
    </>
  ),
  goal: () => (
    <>
      <path d="M6 21V3" />
      <path d="M6 4h12l-2.5 4L18 12H6" />
    </>
  ),
  generic: () => (
    <>
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),
}

/** Icône d'un outil, choisie par famille. L'infobulle porte le verbe, jamais un nom technique seul. */
export function ToolIcon(props: { tool: string; size?: number }) {
  const size = () => props.size ?? 14
  return (
    <svg
      class="tool-icon"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {SHAPES[toolIcon(props.tool)]()}
    </svg>
  )
}

export function toolHint(tool: string): string {
  return `${toolVerb(tool)} · ${tool}`
}

/* =============================================================================
   Icônes de navigation — même grammaire que ci-dessus, autre usage.

   Le rail distingue trois natures d'objet : un dossier (workspace), une session,
   une entrée de menu. Un glyphe texte (`▾`, `▸`, `⌂`) les confondrait et
   dépendrait de la police du système ; une primitive SVG les sépare pour de bon.
   ============================================================================= */

/** Forme nue : la même enveloppe que `ToolIcon`, sans la table de familles. */
function Glyph(props: { size?: number; children: JSX.Element }) {
  const size = () => props.size ?? 14
  return (
    <svg
      class="glyph"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

/** Dossier : un workspace, un lieu de travail. */
export function FolderIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Glyph>
  )
}

/** Session : une conversation. */
export function SessionIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2z" />
    </Glyph>
  )
}

/** Chevron : l'état de pli. Il tourne, il n'est jamais remplacé par un autre dessin. */
export function ChevronIcon(props: { size?: number; open: boolean }) {
  return (
    <Glyph size={props.size ?? 12}>
      <path d={props.open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
    </Glyph>
  )
}

/** Commande : le signe qui la désigne partout ailleurs. */
export function CommandIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size}>
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
    </Glyph>
  )
}

/** Plugin : une pièce rapportée au harnais. */
export function PluginIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size}>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v2a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </Glyph>
  )
}

/* =============================================================================
   Les trois états d'un geste de copie.

   Un bouton « copier » sans texte ne peut pas se contenter d'une infobulle : il lui faut une forme
   qui dit l'état. Trois dessins, donc — copier, fait, échoué —, jamais un quatrième.
   ============================================================================= */

/** Copier : deux feuilles superposées — la forme que le geste porte partout ailleurs. */
export function CopyIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size ?? 13}>
      <rect x="8" y="8" width="14" height="14" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Glyph>
  )
}

/** Fait : le trait de validation. */
export function CheckIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size ?? 13}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Glyph>
  )
}

/** Échoué : une croix. L'échec se dit, même sans texte (la couleur seule serait muette). */
export function CrossIcon(props: { size?: number }) {
  return (
    <Glyph size={props.size ?? 13}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Glyph>
  )
}

/* =============================================================================
   Icônes de section — les entrées du panneau de réglages.

   Pourquoi en ajouter : dans une colonne de sept libellés, l'œil cherche une **forme** avant de lire
   un mot. Les sections se distinguaient par leur seule position, ce qui oblige à relire la colonne
   entière pour retrouver « Providers » ; une forme se reconnaît sans être lue. C'est la même raison
   qui a donné un dossier et une conversation au rail — la reconnaissance avant la lecture.

   Ce qui les contraint : à 13 px, un dessin de plus de trois éléments devient de la bouillie. Chaque
   section tient donc en une ou trois primitives, trait 1,6 comme partout ailleurs. La forme dit la
   **nature** de ce qu'on règle, jamais l'objet : `tools` montre du code (ce que le formateur et le
   serveur de langage traitent), pas une clé à molette — une clé à molette dirait « outils » comme un
   panneau dirait « choses ».

   `plugins` reprend exactement le dessin de `PluginIcon` : la même chose porte la même forme au rail
   et dans le panneau.
   ============================================================================= */

export type SettingIconName = "general" | "behavior" | "tools" | "providers" | "agents" | "mcp" | "plugins"

const SETTING_SHAPES: Record<SettingIconName, () => JSX.Element> = {
  /** Général : deux réglages — la forme universelle des préférences. */
  general: () => (
    <>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.3" />
      <circle cx="15" cy="16" r="2.3" />
    </>
  ),
  /** Comportement : ce que le harnais fait sans demander — l'éclair dit « de lui-même ». */
  behavior: () => <path d="M13 3L6 13h5l-1 8 7-10h-5z" />,
  /** Outils : du code, ce que le formateur et le serveur de langage traitent. */
  tools: () => (
    <>
      <path d="M9 7l-5 5 5 5" />
      <path d="M15 7l5 5-5 5" />
    </>
  ),
  /** Fournisseurs : une clé — ce qu'on y dépose. */
  providers: () => (
    <>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11.5 11.5L20 20" />
      <path d="M20 20v-3.5h-3.5" />
    </>
  ),
  /** Agents : la tête d'un exécutant — creux, antenne, deux yeux. */
  agents: () => (
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4.5v3.5" />
      <path d="M9.5 13.5h.01M14.5 13.5h.01" />
    </>
  ),
  /** Serveurs MCP : deux baies empilées, à la manière d'une machine. */
  mcp: () => (
    <>
      <rect x="3" y="4.5" width="18" height="6.5" rx="2" />
      <rect x="3" y="13" width="18" height="6.5" rx="2" />
      <path d="M7 7.75h.01M7 16.25h.01" />
    </>
  ),
  /** Plugins : le même dessin que `PluginIcon`, pour que la chose garde sa forme. */
  plugins: () => (
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v2a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </>
  ),
}

/** L'icône d'une section du panneau de réglages. */
export function SettingIcon(props: { name: SettingIconName; size?: number }) {
  return <Glyph size={props.size ?? 13}>{SETTING_SHAPES[props.name]()}</Glyph>
}
