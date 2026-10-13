import { describe, expect, test } from "vitest"
import {
  agentCounts,
  agentRows,
  agentSummary,
  generalLines,
  mcpConnectedCount,
  mcpProblems,
  mcpTone,
  modeLabel,
  modelLabel,
  truncate,
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

describe("libellé du mode", () => {
  test("les modes du serveur sont traduits, comme les clés d'injection", () => {
    // Vu à l'écran : la colonne affichait « primary », « subagent », « all » en anglais dans une
    // interface entièrement française.
    expect(modeLabel("primary")).toBe("principal")
    expect(modeLabel("subagent")).toBe("sous-agent")
    expect(modeLabel("all")).toBe("mixte")
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

  test("zéro source ne produit pas de ligne « 0 source »", () => {
    // Vu à l'écran : `/config` renvoie `instructions: []`, et la ligne annonçait « 0 source » —
    // un indicateur qui ne dit rien, exactement ce que cette refonte retire.
    expect(generalLines({ model: "x", instructions: [] }).map((line) => line.label)).toEqual(["modèle"])
  })

  test("une chaîne vide n'est pas une valeur", () => {
    expect(generalLines({ model: "x", username: "" }).map((line) => line.label)).toEqual(["modèle"])
  })
})

describe("pluriels et troncature", () => {
  test("« principal » fait « principaux », jamais « principalaux »", () => {
    // Faute relevée à l'écran : le composant collait « aux » au singulier.
    expect(agentSummary({ primary: 6, subagent: 22 })).toBe("6 principaux · 22 sous-agents")
  })

  test("les singuliers sont corrects", () => {
    expect(agentSummary({ primary: 1, subagent: 1 })).toBe("1 principal · 1 sous-agent")
    expect(agentSummary({ primary: 0, subagent: 0 })).toBe("0 principal · 0 sous-agent")
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
