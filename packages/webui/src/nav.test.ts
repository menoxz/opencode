import { describe, expect, test } from "vitest"
import {
  commandEntries,
  commandGroups,
  commandLabel,
  filterEntries,
  inertReason,
  pluginEntries,
  pluginLabel,
  sourceLabel,
  type Command,
  type PluginList,
} from "./nav"

const COMMANDS: Command[] = [
  { name: "init", description: "guided AGENTS.md setup", source: "command" },
  { name: "qa-proof", description: "preuve QA", source: "command" },
  { name: "github-triage", description: "triage", source: "mcp" },
  { name: "learn", description: "apprendre", source: "skill" },
]

describe("libellés", () => {
  test("la provenance est traduite, comme les clés d'injection et les modes d'agent", () => {
    expect(sourceLabel("command")).toBe("commandes")
    expect(sourceLabel("mcp")).toBe("serveurs MCP")
    expect(sourceLabel("skill")).toBe("compétences")
  })

  test("une provenance inconnue garde son nom", () => {
    expect(sourceLabel("experimental")).toBe("experimental")
  })

  test("un nom de commande se lit comme un mot d'écran", () => {
    expect(commandLabel("qa-proof")).toBe("qa proof")
    expect(commandLabel("ai_deps")).toBe("ai deps")
    expect(commandLabel("init")).toBe("init")
  })

  test("le spécificateur d'un plugin se réduit à son dernier segment, extension retirée", () => {
    expect(pluginLabel("file:///C:/Users/jeanl/.config/opencode/plugin/failure-journal.mjs")).toBe("failure-journal")
    expect(pluginLabel("file:///C:/jeanluc/opencode-fork/.opencode/plugin/schedule.ts")).toBe("schedule")
    expect(pluginLabel("C:\\jeanluc\\mcp\\server.cjs")).toBe("server")
    // Une extension inconnue reste : mieux vaut un nom complet qu'un nom tronqué à tort.
    expect(pluginLabel("file:///x/y/plugin.weird")).toBe("plugin.weird")
  })
})

describe("entrées de commande", () => {
  test("une entrée sans nom est écartée plutôt que rendue vide", () => {
    const entries = commandEntries([{ name: "ok" }, { name: "   " }, {}, { description: "sans nom" }])
    expect(entries.map((entry) => entry.label)).toEqual(["ok"])
  })

  test("le nom technique reste joignable dans l'infobulle, même sans description", () => {
    const [entry] = commandEntries([{ name: "qa-proof" }])
    expect(entry.run).toBe("qa-proof")
    expect(entry.hint).toBe("qa-proof")
  })

  test("la description sert d'infobulle quand elle existe", () => {
    const [entry] = commandEntries([{ name: "init", description: "guided AGENTS.md setup" }])
    expect(entry.hint).toBe("guided AGENTS.md setup")
  })
})

describe("groupement par provenance", () => {
  test("les trois provenances réelles sont séparées, dans l'ordre d'apparition", () => {
    const groups = commandGroups(COMMANDS)
    expect(groups.map((group) => group.key)).toEqual(["command", "mcp", "skill"])
    expect(groups.map((group) => group.label)).toEqual(["commandes", "serveurs MCP", "compétences"])
    expect(groups[0].entries).toHaveLength(2)
  })

  test("une commande sans provenance est rangée avec les commandes", () => {
    const groups = commandGroups([{ name: "nu" }])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe("command")
  })

  test("l'ordre d'apparition est conservé, sans tri", () => {
    const groups = commandGroups([
      { name: "zzz", source: "mcp" },
      { name: "aaa", source: "command" },
    ])
    expect(groups.map((group) => group.key)).toEqual(["mcp", "command"])
  })
})

describe("entrées de plugin", () => {
  test("le serveur rend un objet : on lit `origins`", () => {
    const list: PluginList = {
      version: 1,
      origins: [
        { spec: "file:///a/failure-journal.mjs", scope: "global" },
        { spec: "file:///b/schedule.ts", scope: "global" },
      ],
    }
    const entries = pluginEntries(list)
    expect(entries.map((entry) => entry.label)).toEqual(["failure-journal", "schedule"])
    expect(entries[0].kind).toBe("plugin")
  })

  test("une réponse absente ou sans origins rend une liste vide, jamais une erreur", () => {
    expect(pluginEntries(undefined)).toEqual([])
    expect(pluginEntries({})).toEqual([])
    expect(pluginEntries({ origins: [] })).toEqual([])
  })

  test("la portée apparaît dans l'infobulle, pas dans le libellé", () => {
    const [entry] = pluginEntries({ origins: [{ spec: "file:///a/x.ts", scope: "global" }] })
    expect(entry.label).toBe("x")
    expect(entry.hint).toContain("portée global")
  })
})

describe("filtre", () => {
  test("la recherche porte sur le libellé et sur le nom technique", () => {
    const entries = commandEntries(COMMANDS)
    expect(filterEntries(entries, "qa").map((entry) => entry.run)).toEqual(["qa-proof"])
    // « triage » n'est que dans l'infobulle.
    expect(filterEntries(entries, "triage").map((entry) => entry.run)).toEqual(["github-triage"])
  })

  test("une recherche vide ne filtre rien", () => {
    const entries = commandEntries(COMMANDS)
    expect(filterEntries(entries, "   ")).toHaveLength(4)
  })
})

describe("raison de l'inertie", () => {
  test("sans session, l'entrée dit pourquoi elle ne répond pas", () => {
    // La cible affirme « inerte et le dit » : une entrée grisée muette ferait croire à une panne.
    expect(inertReason(false)).toBe("ouvrez une session pour exécuter")
  })

  test("avec une session, aucune raison : l'entrée agit", () => {
    expect(inertReason(true)).toBeUndefined()
  })
})
