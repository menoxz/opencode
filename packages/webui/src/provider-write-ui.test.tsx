import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { ProviderDetail, ProviderGrid } from "./providers"
import type { Choice, ProviderSummary } from "./settings"

/**
 * L'**écriture** vue depuis l'écran.
 *
 * Ces tests existent parce que la page livrée en premier ne savait qu'afficher : elle montrait un
 * panneau d'identifiants vide et rien pour déclarer un fournisseur, régler son adresse, ajouter un
 * modèle ou en exclure un. Ce qui est vérifié ici n'est donc pas une mise en page mais la **présence
 * des gestes** — et le fait qu'ils disent la vérité sur leurs conséquences.
 */
function mount(component: () => unknown): { container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { container, dispose }
}

const SUMMARIES: ProviderSummary[] = [
  { id: "opencode-go", name: "OpenCode Go", models: 104, ready: true },
  { id: "zebra", name: "Zebra", models: 3, ready: false },
]

const MODELS: Choice[] = [
  { value: "kimi-k2", label: "Kimi K2" },
  { value: "grok-4.3", label: "Grok 4.3" },
]

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

const grid = (over: Record<string, unknown> = {}) =>
  ProviderGrid({
    providers: SUMMARIES,
    catalog: [],
    query: "",
    onQuery: () => {},
    onOpen: () => {},
    ...over,
  } as Parameters<typeof ProviderGrid>[0])

describe("déclarer un fournisseur que le catalogue ignore", () => {
  test("le formulaire est replié au repos, et le bouton dit ce qu'il fait", () => {
    // Un formulaire de déclaration ouvert en permanence occuperait la place d'un geste rare.
    const closed = mount(() => grid())
    expect(closed.container.querySelector(".prov-add")).toBeNull()
    expect(closed.container.textContent).toContain("+ add provider")
    closed.dispose()

    const open = mount(() => grid({ addOpen: true }))
    expect(open.container.querySelector(".prov-add")).not.toBeNull()
    expect(open.container.textContent).toContain("cancel")
    open.dispose()
  })

  test("il demande un identifiant, un paquet npm et une adresse", () => {
    const { container, dispose } = mount(() => grid({ addOpen: true, draft: {} }))
    const labels = [...container.querySelectorAll(".prov-add .set-input")].map((node) =>
      node.getAttribute("aria-label"),
    )
    expect(labels).toEqual(["provider id", "npm package", "base URL"])
    // Le paquet par défaut est **proposé**, pas imposé : c'est celui qui parle `GET /models`.
    expect((container.querySelectorAll(".prov-add .set-input")[1] as HTMLInputElement).value).toBe(
      "@ai-sdk/openai-compatible",
    )
    dispose()
  })

  test("saisir un identifiant remonte la frappe, sans la normaliser à l'écran", () => {
    // La normalisation (`providerId`) appartient à l'écriture : la corriger pendant la frappe
    // effacerait des caractères sous les yeux de qui tape.
    const seen: [string, string][] = []
    const { container, dispose } = mount(() =>
      grid({ addOpen: true, draft: {}, onDraft: (k: string, v: string) => seen.push([k, v]) }),
    )
    const id = container.querySelector(".prov-add .set-input") as HTMLInputElement
    id.value = "My Gateway"
    id.dispatchEvent(new Event("input", { bubbles: true }))
    expect(seen).toEqual([["id", "My Gateway"]])
    dispose()
  })

  test("l'écran dit que l'ajout est sans retour", () => {
    // Aucun `DELETE` n'existe sur les routes de configuration : un geste qu'on ne peut pas défaire
    // se dit **avant** le clic, pas après.
    const { container, dispose } = mount(() => grid({ addOpen: true, draft: {} }))
    expect(container.textContent).toContain("no delete")
    dispose()
  })
})

describe("la connexion d'un fournisseur", () => {
  test("elle montre ce que le fichier porte — les deux magasins séparés", () => {
    const { container, dispose } = mount(() =>
      detail({ connection: { baseURL: "https://api.example.test/v1", npm: "@ai-sdk/openai-compatible" } }),
    )
    const fields = [...container.querySelectorAll(".prov-pane .set-input")] as HTMLInputElement[]
    expect(fields[0].value).toBe("https://api.example.test/v1")
    expect(fields[1].value).toBe("@ai-sdk/openai-compatible")
    dispose()
  })

  test("la sauvegarde est un geste à part — la clé ne passe pas par le même magasin", () => {
    let saves = 0
    const { container, dispose } = mount(() => detail({ onConnectionSave: () => (saves += 1) }))
    const save = [...container.querySelectorAll("button")].find((node) => node.textContent === "Save")
    expect(save).toBeDefined()
    ;(save as HTMLButtonElement).click()
    expect(saves).toBe(1)
    dispose()
  })

  test("la découverte reflète l'état du fichier et sait se décocher", () => {
    const seen: boolean[] = []
    const { container, dispose } = mount(() => detail({ discover: true, onDiscover: (on: boolean) => seen.push(on) }))
    const box = container.querySelector(".prov-switch input") as HTMLInputElement
    expect(box.checked).toBe(true)
    box.click()
    expect(seen).toEqual([false])
    dispose()
  })

  test("elle dit **quand** la découverte agit, parce que ce n'est pas au clic", () => {
    // Mesuré : `discover` s'exécute quand le serveur charge ses fournisseurs (provider.ts:1570),
    // pas à la requête. Une case qui laisserait croire l'inverse ferait chercher un défaut ailleurs.
    const { container, dispose } = mount(() => detail())
    expect(container.textContent).toContain("next server start")
    dispose()
  })

  test("un fournisseur sans méthode déclarée le dit, au lieu de laisser un panneau muet", () => {
    // C'est le défaut mesuré : `/provider/auth` ne déclare que 8 fournisseurs, et pour tous les
    // autres le panneau ne rendait **rien** — pas même la note de repli, qui vivait dans la boucle.
    const { container, dispose } = mount(() => detail({ methods: [] }))
    expect(container.textContent).toContain("no sign-in method")
    dispose()
  })
})

describe("les modèles d'un fournisseur", () => {
  test("on ajoute un modèle à la main — le cas que la découverte ne sait pas décrire", () => {
    const added: string[] = []
    const { container, dispose } = mount(() => detail({ onAddModel: (id: string) => added.push(id) }))
    const field = container.querySelector(".prov-model-add .set-input") as HTMLInputElement
    field.value = "kimi-k2-turbo"
    field.dispatchEvent(new Event("input", { bubbles: true }))
    const add = [...container.querySelectorAll(".prov-model-add button")][0] as HTMLButtonElement
    add.click()
    expect(added).toEqual(["kimi-k2-turbo"])
    // Le champ se vide : on en ajoute souvent plusieurs d'affilée.
    expect(field.value).toBe("")
    dispose()
  })

  test("le bouton reste inactif tant que rien n'est tapé", () => {
    const { container, dispose } = mount(() => detail())
    const add = [...container.querySelectorAll(".prov-model-add button")][0] as HTMLButtonElement
    expect(add.disabled).toBe(true)
    dispose()
  })

  test("exclure un modèle, et le remettre, sans jamais passer par un statut", () => {
    // `ModelStatus` vaut `alpha|beta|deprecated|active` : il n'existe pas de « désactivé ». Le seul
    // levier est `blacklist`, et c'est ce que le test tient.
    const calls: [string, boolean][] = []
    const { container, dispose } = mount(() =>
      detail({ excluded: ["kimi-k2"], onExclude: (id: string, out: boolean) => calls.push([id, out]) }),
    )
    const rows = [...container.querySelectorAll(".prov-model")]
    expect(rows[0].classList.contains("is-excluded")).toBe(true)
    expect((rows[0].querySelector(".prov-model-action") as HTMLElement).textContent).toBe("restore")
    ;(rows[0].querySelector(".prov-model-action") as HTMLButtonElement).click()
    expect(calls).toEqual([["kimi-k2", false]])

    // La ligne non exclue propose l'inverse.
    expect(rows[1].classList.contains("is-excluded")).toBe(false)
    ;(rows[1].querySelector(".prov-model-action") as HTMLButtonElement).click()
    expect(calls[1]).toEqual(["grok-4.3", true])
    dispose()
  })
})
