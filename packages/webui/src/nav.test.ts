import { describe, expect, test } from "vitest"
import { pluginEntries, pluginLabel, type PluginList } from "./nav"

describe("libellé d'un plugin", () => {
  test("le spécificateur se réduit à son dernier segment, extension retirée", () => {
    expect(pluginLabel("file:///C:/Users/jeanl/.config/opencode/plugin/failure-journal.mjs")).toBe("failure-journal")
    expect(pluginLabel("file:///C:/jeanluc/opencode-fork/.opencode/plugin/schedule.ts")).toBe("schedule")
    expect(pluginLabel("C:\\jeanluc\\mcp\\server.cjs")).toBe("server")
  })

  test("une extension inconnue reste : mieux vaut un nom complet qu'un nom tronqué à tort", () => {
    expect(pluginLabel("file:///x/y/plugin.weird")).toBe("plugin.weird")
  })

  test("les paramètres et ancres d'URL ne polluent pas le nom", () => {
    expect(pluginLabel("file:///x/y/plugin.ts?cache=1#top")).toBe("plugin")
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
  })

  test("la portée apparaît dans l'infobulle, pas dans le libellé", () => {
    const [entry] = pluginEntries({ origins: [{ spec: "file:///a/x.ts", scope: "global" }] })
    expect(entry.label).toBe("x")
    expect(entry.hint).toContain("portée global")
  })

  test("aucun plugin rend une liste vide : la section ne s'affiche pas du tout", () => {
    // C'est la règle : pas de titre orphelin, pas de « 0 ». Une liste vide = pas de section.
    expect(pluginEntries(undefined)).toEqual([])
    expect(pluginEntries({})).toEqual([])
    expect(pluginEntries({ origins: [] })).toEqual([])
  })

  test("une origine sans spécificateur est écartée plutôt que rendue vide", () => {
    const entries = pluginEntries({ origins: [{ spec: "  " }, { scope: "global" }, { spec: "file:///a/ok.ts" }] })
    expect(entries.map((entry) => entry.label)).toEqual(["ok"])
  })

  test("l'ordre du serveur est conservé, sans tri", () => {
    const entries = pluginEntries({ origins: [{ spec: "file:///z/zzz.ts" }, { spec: "file:///a/aaa.ts" }] })
    expect(entries.map((entry) => entry.label)).toEqual(["zzz", "aaa"])
  })
})
