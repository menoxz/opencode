import { describe, expect, test } from "vitest"
import {
  agentCounts,
  agentRows,
  agentSummary,
  filterAgents,
  mcpConnectedCount,
  mcpProblems,
  mcpTone,
  modeLabel,
  modelLabel,
  truncate,
  type Agent,
  type AgentRow,
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

describe("libellé du mode", () => {
  test("les modes du serveur sont rendus à l'écran, comme les clés d'injection", () => {
    // Le serveur nomme déjà deux modes en clair : ils restent tels quels ; seul `all`, qui n'énonce
    // pas un mode mais un mélange, reçoit un mot d'écran.
    expect(modeLabel("primary")).toBe("primary")
    expect(modeLabel("subagent")).toBe("subagent")
    expect(modeLabel("all")).toBe("mixed")
  })

  test("un mode inconnu garde son nom plutôt que de disparaître", () => {
    expect(modeLabel("experimental")).toBe("experimental")
    expect(modeLabel("")).toBe("")
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
    expect(mcpProblems({ bizarre: {} })).toEqual([{ name: "bizarre", status: "unknown", error: undefined }])
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
    expect(modelLabel(undefined)).toBe("server default")
    expect(modelLabel(null)).toBe("server default")
    expect(modelLabel(42)).toBe("server default")
  })
})

describe("recherche d'agent", () => {
  // Trente-quatre agents : la liste ne se parcourt pas, elle se cherche.
  const ROWS: AgentRow[] = [
    { name: "build", mode: "primary", description: "Writes the code", full: "build" },
    { name: "plan", mode: "primary", description: "Plans the work", full: "plan" },
    { name: "linkedin-content-creation", mode: "subagent", description: "Writes posts", full: "linkedin" },
  ]

  test("la recherche porte sur le nom", () => {
    expect(filterAgents(ROWS, "build").map((row) => row.name)).toEqual(["build"])
  })

  test("la recherche porte aussi sur la description", () => {
    // « posts » n'est que dans la description : l'utilisateur ne connaît pas toujours le nom exact.
    expect(filterAgents(ROWS, "posts").map((row) => row.name)).toEqual(["linkedin-content-creation"])
  })

  test("la casse et les espaces n'ont pas d'importance", () => {
    expect(filterAgents(ROWS, "  BUILD  ").map((row) => row.name)).toEqual(["build"])
  })

  test("une recherche vide rend tout, sans filtrer", () => {
    expect(filterAgents(ROWS, "   ")).toHaveLength(3)
  })

  test("aucun résultat rend une liste vide, jamais une erreur", () => {
    expect(filterAgents(ROWS, "zzz")).toEqual([])
  })

  test("une description absente ne fait pas échouer la recherche", () => {
    expect(filterAgents([{ name: "nu", mode: "primary", full: "nu" }], "nu")).toHaveLength(1)
  })
})

describe("pluriels et troncature", () => {
  test("le résumé suit le pluriel du nombre", () => {
    expect(agentSummary({ primary: 6, subagent: 22 })).toBe("6 primary · 22 subagents")
  })

  test("les singuliers sont corrects", () => {
    expect(agentSummary({ primary: 1, subagent: 1 })).toBe("1 primary · 1 subagent")
    expect(agentSummary({ primary: 0, subagent: 0 })).toBe("0 primary · 0 subagents")
  })

  test("une description courte est rendue telle quelle", () => {
    expect(truncate("Default development agent.")).toBe("Default development agent.")
  })

  test("une description-prompt est coupée sur un mot, pas au milieu", () => {
    const prompt =
      "You are a general-purpose personal assistant working for one person at a time. You get real things done."
    const short = truncate(prompt)
    expect(short.endsWith("…")).toBe(true)
    expect(short.length).toBeLessThanOrEqual(91)
    expect(prompt.startsWith(short.slice(0, -1).trimEnd())).toBe(true)
    // La coupure tombe sur une frontière de mot : pas de mot tranché en deux.
    expect(short.slice(0, -1).trimEnd().split(" ").pop()).toBe(
      prompt.split(" ")[short.slice(0, -1).trimEnd().split(" ").length - 1],
    )
  })

  test("les espaces multiples sont normalisés avant de compter", () => {
    expect(truncate("a   b\n\nc")).toBe("a b c")
  })
})
