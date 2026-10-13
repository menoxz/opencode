/**
 * Charpente de DSH — solveur de colonnes, repris de `@deepseek-ai/dsh-client-ui-layout`.
 *
 * Source : `lib/types/client/columns.d.ts` (v0.1.1-rc.2), paquet installé localement sous
 * `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`.
 *
 * La doc du paquet décrit la **chaîne de concession**, et c'est le cœur du composant :
 * « keep center >= CENTER_MIN by shrinking details, then auto-closing it (derived zero width —
 * preferred width preferences are never rewritten, so widening the window restores them). The
 * sidebar never concedes: its rendered width is always the drag preference (or the collapsed
 * rail), and center absorbs any remaining deficit as the last resort. »
 *
 * Trois propriétés en découlent, et ce sont elles que les tests protègent :
 *   1. la sidebar ne cède jamais — sa largeur rendue est sa préférence (ou le rail replié) ;
 *   2. les préférences ne sont jamais réécrites — un rétrécissement est **dérivé**, donc
 *      ré-élargir la fenêtre restaure l'état antérieur sans mémoire ;
 *   3. `details` à 0 veut dire « visuellement fermé », jamais « démonté ».
 */

/** Largeur du centre en dessous de laquelle la concession s'enclenche. */
export const CENTER_MIN = 640
/** Bornes de glissement de la sidebar. */
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
/** Largeur de la sidebar avant tout glissement. */
export const SIDEBAR_DEFAULT = 280
/** Rail de sidebar fermée : une colonne d'icônes de 24px entre 16px de marge. */
export const SIDEBAR_COLLAPSED = 56
/** En dessous de cette largeur de fenêtre, la sidebar se replie d'elle-même. */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Bornes de glissement du panneau de détails. */
export const DETAILS_MIN = 300
export const DETAILS_MAX = 520
/** Largeur des détails avant tout glissement. */
export const DETAILS_DEFAULT = 360

export type Columns = { sidebar: number; center: number; details: number }

/** Contraint une largeur dans sa plage contractuelle. */
export function clampWidth(px: number, min: number, max: number): number {
  if (!Number.isFinite(px)) return min
  return Math.min(Math.max(px, min), max)
}

/**
 * Résout les trois largeurs pour une fenêtre donnée. **Pure** : aucune hystérésis, la sortie est
 * une fonction de (fenêtre, préférences) seulement — c'est ce qui rend la restauration au
 * ré-élargissement automatique, sans état à mémoriser.
 *
 * @param viewport largeur disponible en px.
 * @param sidebar préférence de sidebar (0 = fermée → rail).
 * @param details préférence de détails (0 = fermée → largeur nulle).
 */
export function computeColumns(viewport: number, sidebar: number, details: number): Columns {
  const largeur = Number.isFinite(viewport) ? Math.max(0, viewport) : 0

  // La sidebar ne cède jamais : fermée, elle garde son rail ; ouverte, elle est bornée à sa plage.
  const sidebarRendue = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)

  // Les détails fermés valent zéro — « visuellement fermé », pas « démonté ».
  const detailsVoulus = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)

  // Première étape de la chaîne : le centre est servi en priorité.
  let detailsRendus = detailsVoulus
  let center = largeur - sidebarRendue - detailsRendus

  if (center < CENTER_MIN) {
    // Deuxième étape : les détails cèdent, jusqu'à se fermer. On ne touche pas à la préférence,
    // seulement à la largeur rendue — c'est ce qui permet la restauration au ré-élargissement.
    const detailsPossibles = Math.max(0, largeur - sidebarRendue - CENTER_MIN)
    detailsRendus = Math.min(detailsRendus, detailsPossibles)
    center = largeur - sidebarRendue - detailsRendus
  }

  // Dernier recours : si même détails fermés le centre reste sous son plancher, le centre absorbe.
  // La sidebar, elle, n'a jamais cédé.
  return { sidebar: sidebarRendue, center, details: detailsRendus }
}

/**
 * Décide la préférence effective de sidebar avant résolution. `columns.d.ts` précise que le
 * solveur reste **sans point de rupture** : c'est `AppFrame` qui consomme le seuil. Cette
 * fonction sépare donc proprement les deux responsabilités.
 *
 * Un basculement manuel sous le seuil ré-étend la sidebar par-dessus le centre comprimé —
 * comportement documenté sous le nom `narrowExpanded`.
 */
export function effectiveSidebarPreference(viewport: number, preference: number, manuallyExpanded: boolean): number {
  if (preference === 0) return 0
  if (viewport < SIDEBAR_AUTO_COLLAPSE && !manuallyExpanded) return 0
  return preference
}
