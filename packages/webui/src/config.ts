/**
 * Le panneau de configuration — ce que le serveur expose réellement, relevé sur `GET /config`,
 * `GET /agent`, `GET /mcp`, `GET /provider` :
 *
 *   /config  → { $schema, agent, model: "opencode-go/deepseek-v4.1-flash", small_model, username,
 *                command, mcp, permission, plugin, provider, tasks, tools, lsp, experimental, … }
 *   /agent   → 34 agents, chacun { name, description, mode: "primary"|"subagent"|"all", hidden,
 *                native, permission, color }
 *   /mcp     → 7 serveurs { name: { status: "connected"|"disabled"|"failed" } }
 *   /provider → 228 fournisseurs, 8 775 modèles au total
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
export type Provider = { id?: string; name?: string; models?: Record<string, unknown> }

export type AgentRow = { name: string; description?: string; mode: string }
export type McpProblem = { name: string; status: string; error?: string }

const MODE_ORDER: Record<string, number> = { primary: 0, all: 1, subagent: 2 }

/**
 * Agents proposables : les `hidden` ne le sont pas — le serveur les marque comme internes
 * (`compaction`, `eval-runner`, `duplicate-pr` le sont sur ce serveur). Les primaires d'abord,
 * puis les mixtes, puis les sous-agents : c'est l'ordre dans lequel on cherche.
 */
export function agentRows(agents: Agent[]): AgentRow[] {
  return agents
    .filter((agent) => agent.hidden !== true && Boolean(agent.name))
    .map((agent) => ({
      name: agent.name as string,
      description: agent.description,
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

/** Nombre de fournisseurs et de modèles — l'échelle réelle du catalogue. */
export function catalogSize(providers: Provider[]): { providers: number; models: number } {
  let models = 0
  for (const provider of providers) {
    models += provider.models ? Object.keys(provider.models).length : 0
  }
  return { providers: providers.length, models }
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
  if (Array.isArray(config.instructions)) {
    const count = config.instructions.length
    lines.push({ label: "instructions", value: `${count} source${count > 1 ? "s" : ""}` })
  }
  return lines
}
