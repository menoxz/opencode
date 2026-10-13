/**
 * Les menus principaux — tout ce qui n'est pas une session.
 *
 * Relevé sur le serveur :
 *
 *   - `GET /command` rend **210 entrées**, chacune portant sa provenance (`source`) :
 *     `command` (définie par l'utilisateur), `mcp` (apportée par un serveur MCP), `skill`.
 *   - `GET /plugin` rend un **objet** `{ version, runtime, origins, hooks }` — pas un tableau —
 *     avec 4 origines (`{ spec, scope }`) et la liste des accroches enregistrées.
 *
 * Deux conséquences pour le dessin, et c'est tout l'intérêt de ce module :
 *
 *   - 210 entrées ne se déplient pas. La section se replie et se filtre ; elle ne s'impose jamais.
 *   - `source` n'est pas décoratif : il sépare trois façons réelles pour le harnais de proposer un
 *     menu. Les confondre effacerait la seule information utile de cette liste.
 */

export type Command = {
  name?: string
  description?: string
  /** `command` | `mcp` | `skill` — d'où vient l'entrée. */
  source?: string
  template?: string
  hints?: string[]
}

export type PluginOrigin = { spec?: string; scope?: string }
export type PluginList = { origins?: PluginOrigin[]; hooks?: string[]; version?: number }

export type NavEntry = {
  key: string
  label: string
  hint: string
  kind: "command" | "plugin"
  /** Pour une commande : le nom exact à envoyer au serveur. Absent pour un plugin. */
  run?: string
}

export type NavGroup = { key: string; label: string; entries: NavEntry[] }

/**
 * La provenance, traduite — un nom technique n'est pas un mot d'écran (même règle que pour les clés
 * d'injection et les modes d'agent). Une provenance inconnue garde son nom : un serveur peut en
 * ajouter une.
 */
const SOURCE_LABELS: Record<string, string> = {
  command: "commandes",
  mcp: "serveurs MCP",
  skill: "compétences",
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** Un nom de commande se lit comme un mot d'écran : `qa-proof` → « qa proof ». */
export function commandLabel(name: string): string {
  return name.replace(/[-_]+/g, " ").trim()
}

/** Dernier segment d'un spécificateur : `file:///…/schedule.ts` → `schedule`. */
export function pluginLabel(spec: string): string {
  const clean = spec.split("?")[0].split("#")[0]
  const parts = clean.split(/[\\/]/).filter(Boolean)
  const leaf = parts[parts.length - 1] ?? clean
  return leaf.replace(/\.(ts|mjs|cjs|js|json)$/i, "") || clean
}

function commandEntry(command: Command): NavEntry | undefined {
  const name = command.name?.trim()
  if (!name) return undefined
  return {
    key: `command:${name}`,
    label: commandLabel(name),
    hint: command.description?.trim() || name,
    kind: "command",
    run: name,
  }
}

/** Toutes les commandes, dans l'ordre du serveur. */
export function commandEntries(commands: Command[]): NavEntry[] {
  return commands.map(commandEntry).filter((entry): entry is NavEntry => Boolean(entry))
}

/**
 * Regroupe par provenance en conservant l'ordre d'apparition. Un tri alphabétique ferait remonter
 * une provenance au-dessus d'une autre à chaque rafraîchissement : la liste bougerait sous le
 * curseur.
 */
export function commandGroups(commands: Command[]): NavGroup[] {
  const groups: NavGroup[] = []
  const index = new Map<string, NavGroup>()
  for (const command of commands) {
    const entry = commandEntry(command)
    if (!entry) continue
    const source = (command.source ?? "").trim() || "command"
    let group = index.get(source)
    if (!group) {
      group = { key: source, label: sourceLabel(source), entries: [] }
      index.set(source, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

/** Les plugins chargés. Le serveur rend un objet : on lit `origins`, jamais la réponse entière. */
export function pluginEntries(list: PluginList | undefined): NavEntry[] {
  const origins = list?.origins
  if (!Array.isArray(origins)) return []
  return origins
    .filter((origin): origin is PluginOrigin & { spec: string } => typeof origin?.spec === "string" && Boolean(origin.spec.trim()))
    .map((origin) => {
      const spec = origin.spec.trim()
      return {
        key: `plugin:${spec}`,
        label: pluginLabel(spec),
        hint: origin.scope ? `${spec} · portée ${origin.scope}` : spec,
        kind: "plugin" as const,
      }
    })
}

/**
 * Filtre une liste d'entrées sur une recherche. Insensible à la casse, porte sur le libellé et
 * l'infobulle (donc sur le nom technique aussi) — chercher « qa » doit trouver `qa-proof`.
 */
export function filterEntries(entries: NavEntry[], query: string): NavEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter(
    (entry) => entry.label.toLowerCase().includes(needle) || entry.hint.toLowerCase().includes(needle),
  )
}

/**
 * Pourquoi une entrée de commande ne peut pas s'exécuter — `undefined` quand elle le peut.
 *
 * Une entrée grisée **muette** laisse deviner : on croit à une panne ou à un droit manquant, alors
 * qu'il manque seulement une session. La cible dit « inerte et le dit » ; ce module porte la phrase,
 * le composant ne fait que l'afficher.
 */
export function inertReason(hasSession: boolean): string | undefined {
  return hasSession ? undefined : "ouvrez une session pour exécuter"
}
