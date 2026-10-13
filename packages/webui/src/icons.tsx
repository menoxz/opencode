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
