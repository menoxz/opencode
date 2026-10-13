import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { ProviderDetail, ProviderGrid, ProvidersSection } from "./providers"
import {
  catalogSummaries,
  providerModelChoices,
  providerSummaries,
  scopeKey,
  scopedValues,
  type Choice,
  type ProviderSummary,
} from "./settings"

/** Monte un composant dans un conteneur neuf et renvoie le conteneur. */
function mount(component: () => unknown): { container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { container, dispose }
}

/**
 * Une charge de `/config/providers`, **avec ses secrets** — c'est le point du test.
 *
 * Mesuré sur le serveur : la route rend 7 champs `key`/`apiKey` en clair. Elle est donc projetée dès
 * le chargement, et la projection ne doit rien en garder.
 */
const PAYLOAD = {
  providers: [
    {
      id: "opencode-go",
      name: "OpenCode Go",
      key: "sk-live-do-not-keep-me",
      keys: ["sk-first", "sk-second"],
      options: { apiKey: "sk-nested", baseURL: "https://example.test/v1" },
      models: {
        "kimi-k2": { name: "Kimi K2" },
        "deepseek-v4.1-flash": { name: "DeepSeek V4.1 Flash" },
      },
    },
    { id: "orcarouter", name: "OrcaRouter", models: { "grok/grok-4.3": { name: "Grok 4.3" } } },
  ],
}

const SUMMARIES: ProviderSummary[] = [
  { id: "opencode-go", name: "OpenCode Go", models: 2, ready: true },
  { id: "orcarouter", name: "OrcaRouter", models: 1, ready: false },
]

const MODELS: Choice[] = [
  { value: "kimi-k2", label: "Kimi K2" },
  { value: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
]

describe("les projections d'un fournisseur", () => {
  test("un résumé ne garde aucun secret, il n'en garde que la présence", () => {
    // C'est la règle du projet, et elle se vérifie au bon endroit : si `providerSummaries` laissait
    // passer une clé, elle entrerait dans un signal, puis dans le DOM.
    const summaries = providerSummaries(PAYLOAD)
    const serialized = JSON.stringify(summaries)
    expect(serialized).not.toContain("sk-")
    expect(summaries).toEqual([
      { id: "opencode-go", name: "OpenCode Go", models: 2, ready: true },
      { id: "orcarouter", name: "OrcaRouter", models: 1, ready: false },
    ])
    // `ready` est un booléen : le fait qu'un identifiant existe, jamais sa valeur.
    expect(typeof summaries[0].ready).toBe("boolean")
  })

  test("un fournisseur sans identifiant se dit prêt à faux, pas à vide", () => {
    // Un champ absent et un champ vide sont deux façons de dire « pas de clé » : les deux doivent
    // rendre `false`, sinon la tuile afficherait « ready » sur un fournisseur inutilisable.
    const summaries = providerSummaries({
      providers: [{ id: "a", name: "A", key: "", keys: [], options: { apiKey: "  " } }],
    })
    expect(summaries[0].ready).toBe(false)
  })

  test("les modèles d'un fournisseur sont triés, et leur libellé ne répète pas le fournisseur", () => {
    // Dans le détail, le fournisseur **est** le contexte : le suffixe redirait ce que l'en-tête vient
    // de dire. La règle « un libellé identifie sa valeur » vaut pour un choix **global**.
    expect(providerModelChoices(PAYLOAD, "opencode-go")).toEqual([
      { value: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      { value: "kimi-k2", label: "Kimi K2" },
    ])
    expect(providerModelChoices(PAYLOAD, "inconnu")).toEqual([])
  })

  test("le catalogue se lit dans `all`, quelle que soit la forme que le serveur lui donne", () => {
    expect(catalogSummaries({ all: [{ id: "x", name: "X", models: {} }] })).toEqual([
      { id: "x", name: "X", models: 0, ready: false },
    ])
    // Une charge inattendue rend une liste vide, jamais une exception : une recherche ne doit pas
    // casser la page parce que le serveur a changé de forme.
    expect(catalogSummaries(undefined)).toEqual([])
    expect(catalogSummaries({})).toEqual([])
  })

  test("une clé tapée pour un fournisseur ne se montre pas dans le champ d'un autre", () => {
    // Défaut silencieux : les méthodes déclarent les mêmes noms de champ (`key`, `apiKey`) pour tous
    // les fournisseurs, donc une carte plate les confondrait sans rien signaler.
    const values = { [scopeKey("opencode-go", "key")]: "sk-aaa", [scopeKey("orcarouter", "key")]: "sk-bbb" }
    expect(scopedValues(values, "opencode-go")).toEqual({ key: "sk-aaa" })
    expect(scopedValues(values, "orcarouter")).toEqual({ key: "sk-bbb" })
    expect(scopedValues(values, "inconnu")).toEqual({})
    // Le préfixe est un séparateur, pas un préfixe de chaîne : `open` ne doit pas capter `opencode-go`.
    expect(scopedValues({ "opencode-go:x": "1" }, "open")).toEqual({})
  })
})

describe("la grille des fournisseurs", () => {
  test("au repos, elle montre ce qu'on a — pas les 228 du catalogue", () => {
    const { container, dispose } = mount(() => (
      <ProviderGrid
        providers={SUMMARIES}
        catalog={[]}
        query=""
        onQuery={() => {}}
        onOpen={() => {}}
      />
    ))
    const tiles = [...container.querySelectorAll(".prov-tile-name")].map((node) => node.textContent)
    expect(tiles).toEqual(["OpenCode Go", "OrcaRouter"])
    expect(container.querySelector(".prov-count")?.textContent).toContain("yours")
    dispose()
  })

  test("chercher fait entrer le catalogue, et ce qu'on a passe devant", () => {
    const { container, dispose } = mount(() => (
      <ProviderGrid
        providers={SUMMARIES}
        catalog={[
          { id: "zebra", name: "Zebra", models: 3, ready: false },
          { id: "orcarouter", name: "OrcaRouter", models: 122, ready: false },
        ]}
        query="r"
        onQuery={() => {}}
        onOpen={() => {}}
      />
    ))
    const tiles = [...container.querySelectorAll(".prov-tile-name")].map((node) => node.textContent)
    // `orcarouter` est à nous **et** dans le catalogue : il ne doit pas apparaître deux fois.
    expect(tiles).toEqual(["OrcaRouter", "Zebra"])
    expect(container.querySelector(".prov-count")?.textContent).toContain("the catalog")
    dispose()
  })

  test("l'état se lit en un mot, jamais par la couleur seule", () => {
    const { container, dispose } = mount(() => (
      <ProviderGrid providers={SUMMARIES} catalog={[]} query="" onQuery={() => {}} onOpen={() => {}} />
    ))
    const states = [...container.querySelectorAll(".prov-state")].map((node) => node.textContent?.trim())
    expect(states).toEqual(["ready", "no key"])
    dispose()
  })

  test("un clic ouvre le fournisseur cliqué", () => {
    const opened: string[] = []
    const { container, dispose } = mount(() => (
      <ProviderGrid
        providers={SUMMARIES}
        catalog={[]}
        query=""
        onQuery={() => {}}
        onOpen={(id) => opened.push(id)}
      />
    ))
    ;(container.querySelector(".prov-tile") as HTMLButtonElement).click()
    expect(opened).toEqual(["opencode-go"])
    dispose()
  })
})

describe("le détail d'un fournisseur", () => {
  const detail = (over: Record<string, unknown> = {}) =>
    ProviderDetail({
      summary: SUMMARIES[0],
      methods: [],
      values: {},
      onInput: () => {},
      onSubmit: () => {},
      models: MODELS,
      defaultModel: "",
      defaultModelChoices: MODELS,
      onDefaultModel: () => {},
      onBack: () => {},
      connection: {},
      onConnection: () => {},
      onConnectionSave: () => {},
      discover: false,
      onDiscover: () => {},
      excluded: [],
      onAddModel: () => {},
      onExclude: () => {},
      ...over,
    } as Parameters<typeof ProviderDetail>[0])

  test("il montre les modèles — le « n » de la relation", () => {
    // C'est ce que l'ancien accordéon ne montrait nulle part : la raison d'être du fournisseur.
    const { container, dispose } = mount(detail)
    const names = [...container.querySelectorAll(".prov-model-name")].map((node) => node.textContent)
    expect(names).toEqual(["Kimi K2", "DeepSeek V4.1 Flash"])
    // Trois panneaux portent la même classe de titre : on vise **celui des modèles**, en le
    // reconnaissant à sa barre de recherche — un rang se casserait au prochain panneau ajouté,
    // et c'est exactement ce qui vient d'arriver en ajoutant `Connection`.
    const models = container.querySelector(".prov-models-head")?.closest(".prov-pane")
    expect(models?.querySelector(".prov-pane-title")?.textContent).toContain("2 models")
    dispose()
  })

  test("il nomme la portée du modèle par défaut, parce qu'elle est globale", () => {
    // Mesuré : `Config.model` est une seule clé — il n'existe **pas** de défaut par fournisseur. Le
    // contrôle reste utile ici, mais un contrôle qui mentirait sur sa portée serait pire qu'absent.
    const { container, dispose } = mount(detail)
    expect(container.textContent).toContain("Default for new sessions")
    expect(container.textContent).toContain("global")
    dispose()
  })

  test("le retour nomme ce qu'on quitte", () => {
    const { container, dispose } = mount(detail)
    expect(container.querySelector(".prov-back-name")?.textContent).toBe("OpenCode Go")
    dispose()
  })

  test("un fournisseur sans modèle déclaré le dit, au lieu de montrer une liste vide", () => {
    const { container, dispose } = mount(() => detail({ models: [] }))
    expect(container.textContent).toContain("declares no models")
    dispose()
  })
})

describe("la section", () => {
  const section = (over: Record<string, unknown> = {}) =>
    ProvidersSection({
      providers: SUMMARIES,
      catalog: [],
      query: "",
      onQuery: () => {},
      onSelect: () => {},
      methods: [],
      values: {},
      onInput: () => {},
      onSubmit: () => {},
      models: MODELS,
      defaultModel: "",
      defaultModelChoices: MODELS,
      onDefaultModel: () => {},
      connection: {},
      onConnection: () => {},
      onConnectionSave: () => {},
      discover: false,
      onDiscover: () => {},
      excluded: [],
      onAddModel: () => {},
      onExclude: () => {},
      ...over,
    } as Parameters<typeof ProvidersSection>[0])

  test("sans sélection, la grille ; avec, le détail", () => {
    const grid = mount(() => section())
    expect(grid.container.querySelector(".prov-grid")).not.toBeNull()
    expect(grid.container.querySelector(".prov-detail")).toBeNull()
    grid.dispose()

    const detail = mount(() => section({ selected: "opencode-go" }))
    expect(detail.container.querySelector(".prov-detail")).not.toBeNull()
    expect(detail.container.querySelector(".prov-grid")).toBeNull()
    detail.dispose()
  })

  test("le retour rend la grille", () => {
    const picked: (string | undefined)[] = []
    const { container, dispose } = mount(() =>
      section({ selected: "opencode-go", onSelect: (id: string | undefined) => picked.push(id) }),
    )
    ;(container.querySelector(".prov-back") as HTMLButtonElement).click()
    expect(picked).toEqual([undefined])
    dispose()
  })

  test("un fournisseur du catalogue s'ouvre même s'il n'est pas configuré", () => {
    // Sinon la recherche serait une impasse : on trouverait un fournisseur sans pouvoir lui écrire
    // une clé — c'est-à-dire sans pouvoir l'ajouter.
    const { container, dispose } = mount(() => (
      <ProvidersSection
        providers={SUMMARIES}
        catalog={[{ id: "zebra", name: "Zebra", models: 3, ready: false }]}
        query="zebra"
        onQuery={() => {}}
        selected="zebra"
        onSelect={() => {}}
        methods={[]}
        values={{}}
        onInput={() => {}}
        onSubmit={() => {}}
        models={[]}
        defaultModel=""
        defaultModelChoices={[]}
        onDefaultModel={() => {}}
        connection={{}}
        onConnection={() => {}}
        onConnectionSave={() => {}}
        discover={false}
        onDiscover={() => {}}
        excluded={[]}
        onAddModel={() => {}}
        onExclude={() => {}}
      />
    ))
    expect(container.querySelector(".prov-back-name")?.textContent).toBe("Zebra")
    dispose()
  })
})
