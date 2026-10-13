/**
 * Les plugins — la seule section « hors session » du rail.
 *
 * Relevé : `GET /plugin` rend un **objet** `{ version, runtime, origins, hooks }` (pas un tableau),
 * avec 4 origines `{ spec, scope }`. Il pèse **708 octets** : il se charge au montage sans coût.
 *
 * Ce module ne connaît **pas** les commandes. `GET /command` rend 210 entrées (12 commandes,
 * 198 compétences) et pèse 736 669 octets compressés — mais un skill ne se consulte pas, il
 * s'injecte, et l'utilisateur ne navigue pas son catalogue. Une section « menus » construite sur
 * cette route a été retirée : l'existence d'une API n'est pas une raison d'afficher.
 */

export type PluginOrigin = { spec?: string; scope?: string }
export type PluginList = { origins?: PluginOrigin[]; hooks?: string[]; version?: number }

/** Une entrée de la section plugins : un bouton d'accès. */
export type PluginEntry = {
  key: string
  label: string
  hint: string
}

/** Dernier segment d'un spécificateur : `file:///…/schedule.ts` → `schedule`. */
export function pluginLabel(spec: string): string {
  const clean = spec.split("?")[0].split("#")[0]
  const parts = clean.split(/[\\/]/).filter(Boolean)
  const leaf = parts[parts.length - 1] ?? clean
  return leaf.replace(/\.(ts|mjs|cjs|js|json)$/i, "") || clean
}

/**
 * Les plugins chargés, dans l'ordre du serveur. Le serveur rend un objet : on lit `origins`, jamais
 * la réponse entière. Une réponse absente ou malformée rend une liste vide, jamais une erreur —
 * et une liste vide signifie « pas de section », pas « section vide ».
 */
export function pluginEntries(list: PluginList | undefined): PluginEntry[] {
  const origins = list?.origins
  if (!Array.isArray(origins)) return []
  return origins
    .filter((origin): origin is PluginOrigin & { spec: string } =>
      typeof origin?.spec === "string" && Boolean(origin.spec.trim()),
    )
    .map((origin) => {
      const spec = origin.spec.trim()
      return {
        key: `plugin:${spec}`,
        label: pluginLabel(spec),
        hint: origin.scope ? `${spec} · scope ${origin.scope}` : spec,
      }
    })
}
