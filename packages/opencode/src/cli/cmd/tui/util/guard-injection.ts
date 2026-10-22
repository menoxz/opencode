import type { Part } from "@opencode-ai/sdk/v2"

/**
 * Les garde-fous injectés dans un tour sont persistés une fois par tour, dans une part
 * **synthétique et ignorée** portant `metadata.injection = "guard"` et `metadata.firings`.
 * Le fil du TUI masque les parts synthétiques (`index.tsx:550`, `636`, `1863`) : sans ce
 * module, un tir n'apparaissait que dans les Logs — jamais dans le chat de session.
 *
 * Même contrat que `instructions-injection` : seules les données **déclarées** dans
 * `metadata.firings` comptent, rien n'est déduit du texte de la part.
 */
export type GuardFiring = {
  /** `global` = répertoire de config, `workspace` = dépôt du projet. */
  origin: "global" | "workspace"
  name: string
  reason?: string
}

/**
 * Glyphe du bloc : zigzag descendant, le reflexe — ce qui se declenche. Hors des plages de double
 * largeur (`0x1F300-0x1F9FF`), donc une seule cellule ; le bouclier emoji y tombait et decalait la
 * ligne d'une colonne dans le fil.
 */
export const GUARD_ICON = "↯"

export function guardFirings(parts: Part[]): GuardFiring[] {
  const carrier = parts.findLast(
    (part): part is Extract<Part, { type: "text" }> =>
      part.type === "text" && part.metadata?.injection === "guard",
  )
  const firings = (carrier?.metadata as { firings?: unknown } | undefined)?.firings
  if (!Array.isArray(firings)) return []

  const result: GuardFiring[] = []
  for (const item of firings) {
    if (!item || typeof item !== "object") continue
    const record = item as { origin?: unknown; name?: unknown; reason?: unknown }
    if (typeof record.name !== "string" || record.name.length === 0) continue
    result.push({
      // Le serveur écrit `project` ; l'affichage dit `workspace`, comme la webui.
      origin: record.origin === "global" ? "global" : "workspace",
      name: record.name,
      reason: typeof record.reason === "string" && record.reason.length > 0 ? record.reason : undefined,
    })
  }
  return result
}

/** En-tête de la ligne : « guards: 2 tirs ». */
export function guardsHeading(count: number): string {
  return count === 1 ? "guards: 1 tir" : `guards: ${count} tirs`
}

/** Une ligne dépliée : `global/proof-before-claim · tool_calls_in_turn>=6 (11)`. */
export function guardLine(firing: GuardFiring): string {
  const suffix = firing.reason ? ` · ${firing.reason}` : ""
  return `${firing.origin}/${firing.name}${suffix}`
}
