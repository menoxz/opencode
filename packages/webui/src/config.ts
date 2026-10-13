/**
 * Le panneau de configuration — ce que le serveur expose réellement, relevé sur `GET /config`,
 * `GET /agent`, `GET /mcp`, `GET /provider` :
 *
 *   /config  → { $schema, agent, model: "opencode-go/deepseek-v4.1-flash", small_model, username,
 *                command, mcp, permission, plugin, provider, tasks, tools, lsp, experimental, … }
 *   /agent   → 34 agents, chacun { name, description, mode: "primary"|"subagent"|"all", hidden,
 *                native, permission, color }
 *   /mcp     → 7 serveurs { name: { status: "connected"|"disabled"|"failed" } }
 *
 * Ce que ce module **ne** lit pas, et pourquoi : `GET /provider` rend **6,7 Mo** (228 fournisseurs,
 * 8 775 modèles) pour deux nombres qui ne changent aucune décision. La section « catalogue » a été
 * retirée, et l'appel avec — c'est lui qui gelait l'ouverture de la feuille.
 *
 * Deux règles tenues ici :
 *
 *   1. **Ce qui est sain ne s'annonce pas.** Sept serveurs MCP dont six connectés ne produisent
 *      qu'une ligne : le sixième ne mérite pas d'être nommé. Seuls les serveurs en défaut sont
 *      listés — c'est la même règle que le bandeau de notice du fil.
 *   2. **On ne promet pas ce qu'on n'a pas vérifié.** Ce panneau *consulte* : aucun point
 *      d'écriture n'a été relevé côté serveur, donc aucune bascule n'est proposée.
 */

export type Agent = {
  name?: string
  description?: string
  mode?: string
  hidden?: boolean | null
  native?: boolean
}

export type McpState = { status?: string; error?: string }

export type AgentRow = {
  name: string
  /** Description déjà tronquée — c'est elle qui s'affiche. */
  description?: string
  /** Description d'origine, pour l'infobulle. */
  full?: string
  mode: string
}
export type McpProblem = { name: string; status: string; error?: string }

/**
 * Pluriel français : « principal » → « principaux », pas « principalaux ». Vu à l'écran lors de la
 * vérification — la faute était dans le composant, qui collait « aux » au singulier.
 */
export function agentSummary(counts: { primary: number; subagent: number }): string {
  const primary = `${counts.primary} ${counts.primary > 1 ? "principaux" : "principal"}`
  const subagent = `${counts.subagent} ${counts.subagent > 1 ? "sous-agents" : "sous-agent"}`
  return `${primary} · ${subagent}`
}

/** Tronque à la première phrase utile. Les descriptions d'agents sont des prompts entiers. */
export function truncate(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

const MODE_ORDER: Record<string, number> = { primary: 0, all: 1, subagent: 2 }

/**
 * Agents proposables : les `hidden` ne le sont pas — le serveur les marque comme internes
 * (`compaction`, `eval-runner`, `duplicate-pr` le sont sur ce serveur). Les primaires d'abord,
 * puis les mixtes, puis les sous-agents : c'est l'ordre dans lequel on cherche.
 *
 * La description est **tronquée ici**, pas seulement par le CSS : sur ce serveur, certaines
 * descriptions sont des prompts complets (« You are a general-purpose personal assistant… »), et
 * les laisser entières dans le DOM pour les masquer à l'œil, c'est payer le poids sans le lire.
 * Le texte complet reste dans `full`, pour l'infobulle.
 */
export function agentRows(agents: Agent[]): AgentRow[] {
  return agents
    .filter((agent) => agent.hidden !== true && Boolean(agent.name))
    .map((agent) => ({
      name: agent.name as string,
      description: agent.description ? truncate(agent.description) : undefined,
      full: agent.description,
      mode: agent.mode ?? "subagent",
    }))
    .sort((left, right) => {
      const order = (MODE_ORDER[left.mode] ?? 9) - (MODE_ORDER[right.mode] ?? 9)
      return order !== 0 ? order : left.name.localeCompare(right.name)
    })
}

/** Combien d'agents utilisables, par mode — pour la ligne de résumé. */
export function agentCounts(rows: AgentRow[]): { primary: number; subagent: number } {
  let primary = 0
  let subagent = 0
  for (const row of rows) {
    if (row.mode === "primary") primary += 1
    else subagent += 1
  }
  return { primary, subagent }
}

/**
 * Le mode vient du serveur en anglais (`primary`, `subagent`, `all`). Ce n'est pas un mot d'écran :
 * la même règle que pour les clés d'injection (`core` → « invite système ») et les noms d'outils
 * (`todowrite` → icône « tâches ») s'applique ici. Un mode inconnu garde son nom plutôt que de
 * disparaître — un serveur peut en ajouter un.
 */
const MODE_LABELS: Record<string, string> = {
  primary: "principal",
  subagent: "sous-agent",
  all: "mixte",
}

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}

/** Serveurs connectés : le nombre qui va dans la phrase « 6 serveurs connectés ». */
export function mcpConnectedCount(mcp: Record<string, McpState>): number {
  return Object.values(mcp).filter((entry) => entry?.status === "connected").length
}

/**
 * Serveurs en défaut. `disabled` est un état **voulu** — le serveur est éteint à la demande — mais
 * il reste digne d'être vu : c'est ce qui explique qu'un outil manque. Un serveur connecté, lui,
 * ne produit rien.
 */
export function mcpProblems(mcp: Record<string, McpState>): McpProblem[] {
  return Object.entries(mcp)
    .filter(([, entry]) => entry?.status !== "connected")
    .map(([name, entry]) => ({ name, status: entry?.status ?? "inconnu", error: entry?.error }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/** Tonalité d'un serveur : « off » pour un arrêt voulu, « bad » pour un échec. */
export function mcpTone(status: string): "off" | "bad" {
  return status === "disabled" ? "off" : "bad"
}

/**
 * `model` est une **chaîne** sur ce serveur (`"opencode-go/deepseek-v4.1-flash"`) mais le SDK
 * accepte aussi un objet `{ providerID, modelID }` — les deux formes sont lues, aucune n'est
 * supposée.
 */
export function modelLabel(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const object = value as { providerID?: string; modelID?: string; id?: string }
    if (object.providerID && object.modelID) return `${object.providerID}/${object.modelID}`
    if (object.id) return object.id
  }
  return "défaut du serveur"
}

/**
 * Lignes de la section « général ». Une clé absente ne produit pas de ligne vide : `small_model`
 * n'existe pas sur tous les serveurs, et une ligne « small_model : — » ne dirait rien.
 */
export function generalLines(config: {
  model?: unknown
  small_model?: unknown
  username?: unknown
  instructions?: unknown
}): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = []
  lines.push({ label: "modèle", value: modelLabel(config.model) })
  if (config.small_model) lines.push({ label: "petit modèle", value: modelLabel(config.small_model) })
  if (typeof config.username === "string" && config.username) {
    lines.push({ label: "utilisateur", value: config.username })
  }
  if (Array.isArray(config.instructions) && config.instructions.length > 0) {
    const count = config.instructions.length
    lines.push({ label: "instructions", value: `${count} source${count > 1 ? "s" : ""}` })
  }
  return lines
}
