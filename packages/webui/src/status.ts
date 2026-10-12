/**
 * Modèle d'affichage du panneau « Statut » — surface n°5 de la charte du workflow
 * (« modèles/providers, MCP, watchers, santé serveur — visible en un clic »), prévue mais jamais
 * construite jusqu'ici.
 *
 * Comme `view-model.ts` et `attachments.ts`, ce fichier ne garde que les décisions pures : ce qui
 * s'affiche, dans quel ordre, avec quelle tonalité. Aucun accès réseau, aucun DOM.
 */

/** Miroir de `McpStatus` (`packages/sdk/js/src/v2/gen/types.gen.ts:1976-2002`). */
export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

export type StatusTone = "ok" | "warn" | "error" | "off"

export type StatusLine = { label: string; value: string; tone: StatusTone }

/** Libellé français d'un statut MCP. Le vocabulaire suit le serveur, pas une traduction libre. */
export function mcpLabel(status: McpStatus): string {
  switch (status.status) {
    case "connected":
      return "connecté"
    case "disabled":
      return "désactivé"
    case "failed":
      return "échec"
    case "needs_auth":
      return "authentification requise"
    case "needs_client_registration":
      return "enregistrement client requis"
  }
}

/**
 * Tonalité d'un statut MCP. `disabled` est `off` et non `error` : un serveur volontairement
 * désactivé n'est pas une panne, et les confondre ferait crier l'interface pour rien.
 */
export function mcpTone(status: McpStatus): StatusTone {
  switch (status.status) {
    case "connected":
      return "ok"
    case "disabled":
      return "off"
    case "needs_auth":
    case "needs_client_registration":
      return "warn"
    case "failed":
      return "error"
  }
}

/** Message d'erreur d'un statut, quand il en porte un. */
export function mcpError(status: McpStatus): string | undefined {
  if (status.status === "failed") return status.error
  if (status.status === "needs_client_registration") return status.error
  return undefined
}

/** Combien de serveurs MCP sont connectés, sur combien. */
export function mcpCounts(statuses: Record<string, McpStatus>): { connected: number; total: number } {
  const values = Object.values(statuses ?? {})
  return { connected: values.filter((item) => item.status === "connected").length, total: values.length }
}

/** Nombre d'agents déclarés dans la configuration. */
export function agentCount(config: { agent?: Record<string, unknown> } | undefined): number {
  return Object.keys(config?.agent ?? {}).length
}

/** Modèle courant, ou `undefined` quand le serveur applique son défaut. */
export function currentModel(config: { model?: string } | undefined): string | undefined {
  const model = config?.model?.trim()
  return model ? model : undefined
}

/**
 * Compose les lignes du panneau, dans un ordre fixe : ce qui peut empêcher de travailler d'abord
 * (serveur, permissions en attente), ce qui informe ensuite (modèle, agents, MCP).
 *
 * Une permission en attente est une **ligne** et non une pastille : c'est bloquant, ça doit se
 * voir même quand le panneau est replié sur un autre onglet.
 */
export function summarizeStatus(input: {
  health?: { healthy: boolean; version: string }
  config?: { model?: string; agent?: Record<string, unknown> }
  mcp?: Record<string, McpStatus>
  pendingPermissions?: number
}): StatusLine[] {
  const lines: StatusLine[] = []

  lines.push(
    input.health?.healthy
      ? { label: "Serveur", value: `joignable (${input.health.version})`, tone: "ok" }
      : { label: "Serveur", value: "injoignable", tone: "error" },
  )

  const pending = input.pendingPermissions ?? 0
  if (pending > 0) {
    lines.push({
      label: "Permissions",
      value: `${pending} en attente`,
      tone: "warn",
    })
  }

  lines.push({
    label: "Modèle",
    value: currentModel(input.config) ?? "défaut du serveur",
    tone: currentModel(input.config) ? "ok" : "off",
  })

  const agents = agentCount(input.config)
  lines.push({ label: "Agents", value: agents > 0 ? String(agents) : "aucun déclaré", tone: agents > 0 ? "ok" : "off" })

  const { connected, total } = mcpCounts(input.mcp ?? {})
  if (total === 0) {
    lines.push({ label: "MCP", value: "aucun serveur", tone: "off" })
  } else {
    const broken = Object.values(input.mcp ?? {}).filter((item) => mcpTone(item) === "error").length
    lines.push({
      label: "MCP",
      value: `${connected}/${total} connectés${broken > 0 ? `, ${broken} en échec` : ""}`,
      tone: broken > 0 ? "error" : connected === total ? "ok" : "warn",
    })
  }

  return lines
}

/** Détail par serveur MCP, pour la liste du panneau. */
export function mcpRows(statuses: Record<string, McpStatus>): Array<{ name: string; label: string; tone: StatusTone; error?: string }> {
  return Object.entries(statuses ?? {})
    .map(([name, status]) => ({
      name,
      label: mcpLabel(status),
      tone: mcpTone(status),
      error: mcpError(status),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
