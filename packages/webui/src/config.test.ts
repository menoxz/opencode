import { describe, expect, test } from "vitest"
import {
  agentCounts,
  agentRows,
  catalogSize,
  generalLines,
  mcpConnectedCount,
  mcpProblems,
  mcpTone,
  modelLabel,
  type Agent,
} from "./config"

/** Relevé tel quel sur `GET /agent` — les quatre premiers agents de ce serveur. */
const AGENTS: Agent[] = [
  { name: "build", description: "Default development agent.", mode: "primary", native: true, hidden: null },
  { name: "architect", description: "System architect.", mode: "subagent", native: false, hidden: null },
  { name: "autonome", description: "Autonomous problem solver.", mode: "all", native: false, hidden: null },
  { name: "compaction", description: "Compaction agent.", mode: "primary", native: true, hidden: true },
]

/** Relevé tel quel sur `GET /mcp` — 7 serveurs, 6 connectés, 1 désactivé. */
const MCP = {
  "agent-tools": { status: "connected" },
  "computer-use": { status: "connected" },
  "llm-memory-tool": { status: "connected" },
  "mcp-terminal": { status: "connected" },
  sandbox: { status: "disabled" },
  "secret-vault": { status: "connected" },
  "web-browser": { status: "connected" },
}

describe("agents", () => {
  test("un agent caché n'est pas proposé", () => {
    const names = agentRows(AGENTS).map((row) => row.name)
    expect(names).not.toContain("compaction")
    expect(names).toHaveLength(3)
  })

  test("les primaires viennent d'abord, puis les mixtes, puis les sous-agents", () => {
    expect(agentRows(AGENTS).map((row) => row.mode)).toEqual(["primary", "all", "subagent"])
  })

  test("à mode égal, l'ordre est alphabétique", () => {
    const rows = agentRows([
      { name: "zoe", mode: "subagent" },
      { name: "adam", mode: "subagent" },
    ])
    expect(rows.map((row) => row.name)).toEqual(["adam", "zoe"])
  })

  test("un agent sans nom est écarté plutôt que rendu vide", () => {
    expect(agentRows([{ mode: "primary" }])).toHaveLength(0)
  })

  test("les comptes séparent primaires et sous-agents", () => {
    expect(agentCounts(agentRows(AGENTS))).toEqual({ primary: 1, subagent: 2 })
  })
})

describe("serveurs MCP", () => {
  test("seuls les serveurs en défaut sont listés", () => {
    expect(mcpProblems(MCP)).toEqual([{ name: "sandbox", status: "disabled", error: undefined }])
  })

  test("le nombre de connectés est celui de la phrase", () => {
    expect(mcpConnectedCount(MCP)).toBe(6)
  })

  test("un serveur désactivé est un arrêt voulu, pas un échec", () => {
    expect(mcpTone("disabled")).toBe("off")
    expect(mcpTone("failed")).toBe("bad")
    expect(mcpTone("error")).toBe("bad")
  })

  test("un serveur sans état lisible est signalé, pas ignoré", () => {
    expect(mcpProblems({ bizarre: {} })).toEqual([{ name: "bizarre", status: "inconnu", error: undefined }])
  })

  test("tout va bien ⇒ aucune ligne de problème", () => {
    expect(mcpProblems({ a: { status: "connected" } })).toEqual([])
  })
})

describe("modèle", () => {
  test("la chaîne est rendue telle quelle", () => {
    expect(modelLabel("opencode-go/deepseek-v4.1-flash")).toBe("opencode-go/deepseek-v4.1-flash")
  })

  test("la forme objet du SDK est acceptée aussi", () => {
    expect(modelLabel({ providerID: "opencode-go", modelID: "deepseek-v4.1-flash" })).toBe(
      "opencode-go/deepseek-v4.1-flash",
    )
    expect(modelLabel({ id: "seul-id" })).toBe("seul-id")
  })

  test("une valeur absente ne produit pas de faux nom", () => {
    expect(modelLabel(undefined)).toBe("défaut du serveur")
    expect(modelLabel(null)).toBe("défaut du serveur")
    expect(modelLabel(42)).toBe("défaut du serveur")
  })
})

describe("catalogue", () => {
  test("les modèles sont comptés dans tous les fournisseurs", () => {
    const size = catalogSize([
      { id: "a", models: { m1: {}, m2: {} } },
      { id: "b", models: { m3: {} } },
      { id: "c" },
    ])
    expect(size).toEqual({ providers: 3, models: 3 })
  })

  test("un catalogue vide ne divise pas par zéro", () => {
    expect(catalogSize([])).toEqual({ providers: 0, models: 0 })
  })
})

describe("lignes générales", () => {
  test("le modèle est toujours là, les autres seulement s'ils existent", () => {
    const lines = generalLines({ model: "opencode-go/deepseek-v4.1-flash" })
    expect(lines).toEqual([{ label: "modèle", value: "opencode-go/deepseek-v4.1-flash" }])
  })

  test("petit modèle, utilisateur et instructions apparaissent quand ils sont renseignés", () => {
    const lines = generalLines({
      model: "gros",
      small_model: "petit",
      username: "jeanl",
      instructions: ["a.md", "b.md"],
    })
    expect(lines.map((line) => line.label)).toEqual(["modèle", "petit modèle", "utilisateur", "instructions"])
    expect(lines[3]?.value).toBe("2 sources")
  })

  test("une source unique se dit au singulier", () => {
    expect(generalLines({ model: "x", instructions: ["a.md"] })[1]?.value).toBe("1 source")
  })

  test("une chaîne vide n'est pas une valeur", () => {
    expect(generalLines({ model: "x", username: "" }).map((line) => line.label)).toEqual(["modèle"])
  })
})
