import { describe, expect, test } from "vitest"
import {
  agentCount,
  currentModel,
  mcpCounts,
  mcpError,
  mcpLabel,
  mcpRows,
  mcpTone,
  summarizeStatus,
  type McpStatus,
} from "./status"

const connected: McpStatus = { status: "connected" }
const disabled: McpStatus = { status: "disabled" }
const failed: McpStatus = { status: "failed", error: "connexion refusée" }
const needsAuth: McpStatus = { status: "needs_auth" }
const needsRegistration: McpStatus = { status: "needs_client_registration", error: "client inconnu" }

describe("libellés et tonalités MCP", () => {
  test("chaque statut a un libellé", () => {
    expect(mcpLabel(connected)).toBe("connecté")
    expect(mcpLabel(disabled)).toBe("désactivé")
    expect(mcpLabel(failed)).toBe("échec")
    expect(mcpLabel(needsAuth)).toBe("authentification requise")
    expect(mcpLabel(needsRegistration)).toBe("enregistrement client requis")
  })

  test("un serveur désactivé n'est pas une erreur", () => {
    // Distinction qui compte : confondre les deux ferait crier l'interface pour rien.
    expect(mcpTone(disabled)).toBe("off")
    expect(mcpTone(failed)).toBe("error")
  })

  test("ce qui demande une action de l'utilisateur est un avertissement", () => {
    expect(mcpTone(needsAuth)).toBe("warn")
    expect(mcpTone(needsRegistration)).toBe("warn")
    expect(mcpTone(connected)).toBe("ok")
  })

  test("seuls deux statuts portent un message d'erreur", () => {
    expect(mcpError(failed)).toBe("connexion refusée")
    expect(mcpError(needsRegistration)).toBe("client inconnu")
    expect(mcpError(connected)).toBeUndefined()
    expect(mcpError(needsAuth)).toBeUndefined()
    expect(mcpError(disabled)).toBeUndefined()
  })
})

describe("mcpCounts", () => {
  test("compte les connectés sur le total", () => {
    expect(mcpCounts({ a: connected, b: failed, c: connected })).toEqual({ connected: 2, total: 3 })
  })

  test("objet vide", () => {
    expect(mcpCounts({})).toEqual({ connected: 0, total: 0 })
  })
})

describe("agentCount et currentModel", () => {
  test("compte les agents déclarés", () => {
    expect(agentCount({ agent: { build: {}, plan: {} } })).toBe(2)
    expect(agentCount({})).toBe(0)
    expect(agentCount(undefined)).toBe(0)
  })

  test("un modèle absent ou vide vaut défaut", () => {
    expect(currentModel({ model: "opencode-go/deepseek" })).toBe("opencode-go/deepseek")
    expect(currentModel({ model: "   " })).toBeUndefined()
    expect(currentModel({})).toBeUndefined()
    expect(currentModel(undefined)).toBeUndefined()
  })
})

describe("summarizeStatus", () => {
  test("serveur joignable : tonalité ok et version affichée", () => {
    const lines = summarizeStatus({ health: { healthy: true, version: "2.4.5" } })
    expect(lines[0]).toEqual({ label: "Serveur", value: "joignable (2.4.5)", tone: "ok" })
  })

  test("serveur injoignable : tonalité erreur", () => {
    const lines = summarizeStatus({})
    expect(lines[0]).toEqual({ label: "Serveur", value: "injoignable", tone: "error" })
  })

  test("une permission en attente devient une ligne, et elle vient tôt", () => {
    const lines = summarizeStatus({ health: { healthy: true, version: "x" }, pendingPermissions: 2 })
    expect(lines[1]).toEqual({ label: "Permissions", value: "2 en attente", tone: "warn" })
  })

  test("aucune permission en attente : pas de ligne du tout", () => {
    const lines = summarizeStatus({ health: { healthy: true, version: "x" }, pendingPermissions: 0 })
    expect(lines.map((line) => line.label)).toEqual(["Serveur", "Modèle", "Agents", "MCP"])
  })

  test("l'ordre est stable : bloquant d'abord, informatif ensuite", () => {
    const lines = summarizeStatus({
      health: { healthy: true, version: "x" },
      config: { model: "m", agent: { a: {} } },
      mcp: { s: connected },
      pendingPermissions: 1,
    })
    expect(lines.map((line) => line.label)).toEqual(["Serveur", "Permissions", "Modèle", "Agents", "MCP"])
  })

  test("modèle absent : affiché comme défaut du serveur, tonalité neutre", () => {
    const lines = summarizeStatus({ health: { healthy: true, version: "x" }, config: {} })
    const model = lines.find((line) => line.label === "Modèle")
    expect(model?.value).toBe("défaut du serveur")
    expect(model?.tone).toBe("off")
  })

  test("aucun agent déclaré n'est pas une erreur", () => {
    const lines = summarizeStatus({ health: { healthy: true, version: "x" }, config: {} })
    expect(lines.find((line) => line.label === "Agents")?.tone).toBe("off")
  })

  test("MCP : résumé connectés/total", () => {
    const lines = summarizeStatus({ mcp: { a: connected, b: connected } })
    expect(lines.find((line) => line.label === "MCP")).toEqual({ label: "MCP", value: "2/2 connectés", tone: "ok" })
  })

  test("MCP : un serveur en échec rend la ligne rouge et le dit", () => {
    const lines = summarizeStatus({ mcp: { a: connected, b: failed } })
    const mcp = lines.find((line) => line.label === "MCP")
    expect(mcp?.tone).toBe("error")
    expect(mcp?.value).toContain("1/2 connectés")
    expect(mcp?.value).toContain("1 en échec")
  })

  test("MCP : un serveur seulement en attente d'authentification avertit sans crier", () => {
    const lines = summarizeStatus({ mcp: { a: connected, b: needsAuth } })
    const mcp = lines.find((line) => line.label === "MCP")
    expect(mcp?.tone).toBe("warn")
    expect(mcp?.value).not.toContain("en échec")
  })

  test("MCP : aucun serveur configuré", () => {
    const lines = summarizeStatus({ mcp: {} })
    expect(lines.find((line) => line.label === "MCP")).toEqual({ label: "MCP", value: "aucun serveur", tone: "off" })
  })
})

describe("mcpRows", () => {
  test("trie par nom, pour que l'affichage ne saute pas d'un rafraîchissement à l'autre", () => {
    const rows = mcpRows({ zeta: connected, alpha: failed, mid: disabled })
    expect(rows.map((row) => row.name)).toEqual(["alpha", "mid", "zeta"])
  })

  test("porte le libellé, la tonalité et l'erreur", () => {
    const rows = mcpRows({ s: failed })
    expect(rows[0]).toEqual({ name: "s", label: "échec", tone: "error", error: "connexion refusée" })
  })

  test("objet vide : aucune ligne", () => {
    expect(mcpRows({})).toEqual([])
  })
})
