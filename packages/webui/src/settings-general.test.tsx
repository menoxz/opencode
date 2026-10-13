import { createSignal } from "solid-js"
import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { GeneralSection, ServerBlock, SettingsSheet } from "./settings-sheet"
import { GENERAL_SETTINGS, SETTINGS_SECTIONS, settingGroups, type Choice, type SettingSpec } from "./settings"

/** Monte un composant dans un conteneur neuf et renvoie le conteneur et le HTML produit. */
function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const MODELS: Choice[] = [
  { value: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash · OpenCode Go" },
  { value: "opencode-go/kimi-k2", label: "Kimi K2 · OpenCode Go" },
]
const AGENTS: Choice[] = [
  { value: "build", label: "build" },
  { value: "zx", label: "zx" },
]
const SHELLS: Choice[] = [
  { value: "cmd", label: "cmd" },
  { value: "pwsh", label: "pwsh" },
]

/** Ce qu'une page reçoit du conteneur — le rendu des lignes ne dépend pas de la section. */
const BASE = {
  choicesOf: (spec: SettingSpec) =>
    spec.source === "models" ? MODELS : spec.source === "shells" ? SHELLS : spec.source === "agents" ? AGENTS : [],
  draftOf: (spec: SettingSpec) => spec.placeholder ?? "",
  checkedOf: () => false,
  onInput: () => {},
  onCommit: () => {},
}

describe("la navigation du panneau", () => {
  test("chaque section porte une icône, et une seule", () => {
    // L'exigence : une icône par entrée de menu. Sept libellés se retrouvent en relisant la
    // colonne ; sept formes se reconnaissent sans être lues.
    const { container, dispose } = mount(() => (
      <SettingsSheet sections={SETTINGS_SECTIONS} active="general" onSelect={() => {}} onClose={() => {}} />
    ))
    const tabs = container.querySelectorAll(".sheet-tab")
    expect(tabs.length).toBe(SETTINGS_SECTIONS.length)
    expect(container.querySelectorAll(".sheet-tab .glyph").length).toBe(SETTINGS_SECTIONS.length)
    dispose()
  })

  test("l'entrée active est marquée pour l'accessibilité", () => {
    const { container, dispose } = mount(() => (
      <SettingsSheet sections={SETTINGS_SECTIONS} active="providers" onSelect={() => {}} onClose={() => {}} />
    ))
    const active = container.querySelectorAll(".sheet-tab.active")
    expect(active.length).toBe(1)
    expect(active[0].getAttribute("aria-current")).toBe("page")
    dispose()
  })
})

/* =============================================================================
   La page General telle qu'elle est rendue.

   Deux exigences, et rien d'autre : les réglages dont l'ensemble des valeurs est connu se
   **choisissent** ; le dossier de travail n'est **pas** ici — il est au premier plan, au pied du
   rail, et un panneau de réglages n'est pas l'endroit d'une action quotidienne.
   ============================================================================= */

describe("la page General", () => {
  const page = (draft: (spec: SettingSpec) => string = BASE.draftOf) =>
    ((props: Partial<Record<string, unknown>>) => (
      <GeneralSection
        blocks={settingGroups(GENERAL_SETTINGS)}
        footnote="written to C:\\Users\\jeanl\\.config\\opencodev2\\opencode.jsonc · server local"
        {...BASE}
        draftOf={draft}
        {...props}
      />
    ))({})

  test("les trois réglages de l'ancienne section « models » s'y trouvent", () => {
    const { html, dispose } = mount(page)
    expect(html).toContain("Default model")
    expect(html).toContain("Small model")
    expect(html).toContain("Default agent")
    dispose()
  })

  test("trois blocs nommés — et **pas** de bloc Workspace", () => {
    // Le dossier de travail a été retiré de cette page : c'est une action de premier plan, et le
    // pied du rail la porte déjà. La remettre ici enterrerait l'action au lieu de la ranger.
    const { container, dispose } = mount(page)
    expect([...container.querySelectorAll(".sheet-section h2")].map((h) => h.textContent)).toEqual([
      "Defaults",
      "Identity",
      "Environment",
    ])
    expect(container.innerHTML).not.toContain("Working directory")
    dispose()
  })

  test("les quatre réglages à ensemble fini se choisissent, ils ne se saisissent pas", () => {
    // C'est la correction : un champ de texte pour un modèle oblige à aller chercher
    // `opencode-go/deepseek-v4.1-flash` ailleurs et à le recopier sans faute.
    const { container, dispose } = mount(page)
    const rows = [...container.querySelectorAll(".set-row")]
    const control = (label: string) =>
      rows.find((row) => row.querySelector(".set-label")?.textContent === label)?.querySelector(".set-control")
    expect(GENERAL_SETTINGS.filter((spec) => spec.kind === "select").map((spec) => spec.label)).toEqual([
      "Default model",
      "Small model",
      "Default agent",
      "Shell",
    ])
    for (const label of ["Default model", "Small model", "Default agent", "Shell"]) {
      // Le contrôle est un **bouton** qui ouvre une liste : il n'y a rien à recopier, donc rien à
      // recopier faux. Et rien à saisir, donc aucun champ au repos.
      expect(control(label)?.querySelector(".pick-trigger")?.tagName).toBe("BUTTON")
      expect(control(label)?.querySelector("input")).toBeNull()
    }
    // Le seul champ restant : l'identité, qui n'a pas d'ensemble fini.
    expect(control("Username")?.querySelector("input")?.tagName).toBe("INPUT")
    dispose()
  })

  /** Ouvre le contrôle de choix d'une ligne : c'est le seul moyen de voir ses entrées. */
  const open = (container: HTMLElement, label: string) => {
    const row = [...container.querySelectorAll(".set-row")].find(
      (entry) => entry.querySelector(".set-label")?.textContent === label,
    )
    const trigger = row?.querySelector(".pick-trigger") as HTMLButtonElement
    trigger.click()
    return {
      labels: [...(row?.querySelectorAll(".pick-row-label") ?? [])].map((node) => node.textContent),
      rows: [...(row?.querySelectorAll(".pick-row") ?? [])] as HTMLElement[],
    }
  }

  test("les modèles viennent de la source, et le libellé porte le fournisseur", () => {
    // Une liste **plate** : le libellé dit tout. Un titre de groupe redirait au-dessus de chaque ligne
    // ce que la ligne dit déjà, et le filtre ne cherche que les libellés — un titre de groupe serait
    // donc introuvable à la frappe.
    const { container, dispose } = mount(() => page(() => "opencode-go/kimi-k2"))
    expect(container.querySelector("optgroup")).toBeNull()
    const { labels } = open(container, "Default model")
    expect(labels).toEqual(["server default", "DeepSeek V4.1 Flash · OpenCode Go", "Kimi K2 · OpenCode Go"])
    dispose()
  })

  test("l'entrée vide est un état, et il se choisit", () => {
    // Mesuré : `config.ts:513` retire la clé quand la valeur écrite est la chaîne vide. L'entrée vide
    // remet donc réellement le réglage au défaut du serveur — et elle doit se **choisir**, pas
    // seulement s'afficher : un `placeholder` se lit, il ne se clique pas.
    const committed: string[] = []
    const { container, dispose } = mount(() => (
      <GeneralSection
        blocks={settingGroups(GENERAL_SETTINGS)}
        {...BASE}
        draftOf={() => "opencode-go/kimi-k2"}
        onCommit={(...args: unknown[]) => committed.push(String(args.at(-1)))}
      />
    ))
    const { labels, rows } = open(container, "Default model")
    expect(labels[0]).toBe("server default")
    rows[0].click()
    expect(committed).toEqual([""])
    dispose()
  })

  test("une valeur configurée hors de la liste s'affiche quand même", () => {
    // Sinon le contrôle montrerait **une autre valeur que celle réellement écrite**. Elle se lit sans
    // même ouvrir la liste : c'est ce que le `select` ne faisait pas.
    const { container, dispose } = mount(() => page(() => "autre-fournisseur/modele-maison"))
    const shown = [...container.querySelectorAll(".pick-label")].map((node) => node.textContent)
    expect(shown).toContain("autre-fournisseur/modele-maison")
    dispose()
  })

  test("la valeur s'affiche même quand les choix arrivent après elle", () => {
    // Le défaut mesuré **au CDP** sur le `<select>` : une valeur donnée avant ses options y retombait
    // sur la première, et l'écran annonçait « server default » sur une configuration renseignée.
    //
    // Le contrôle de choix n'a pas d'état à perdre — le libellé se **lit** à chaque rendu. Ce test
    // vérifie donc les deux temps de la course (avant les choix, puis après) au lieu de simuler une
    // perte de sélection qui ne peut plus se produire : le mécanisme fautif n'existe plus.
    const [choices, setChoices] = createSignal<Choice[]>([])
    const { container, dispose } = mount(() => (
      <GeneralSection
        blocks={settingGroups(GENERAL_SETTINGS)}
        choicesOf={(spec) => (spec.source === "models" ? choices() : spec.source === "shells" ? SHELLS : AGENTS)}
        draftOf={() => "opencode-go/kimi-k2"}
        checkedOf={() => false}
        onInput={() => {}}
        onCommit={() => {}}
      />
    ))
    const shown = () =>
      [...container.querySelectorAll(".set-row")]
        .find((row) => row.querySelector(".set-label")?.textContent === "Default model")
        ?.querySelector(".pick-label")?.textContent

    // Avant les choix : la valeur brute, telle qu'elle est écrite — surtout pas celle d'un autre.
    expect(shown()).toBe("opencode-go/kimi-k2")
    setChoices(MODELS)
    // Après : le libellé de la liste, qui porte le fournisseur.
    expect(shown()).toBe("Kimi K2 · OpenCode Go")
    dispose()
  })

  test("le pied de page dit où les réglages sont écrits, et quelle version les sert", () => {
    const { html, dispose } = mount(page)
    expect(html).toContain("opencode.jsonc")
    expect(html).toContain("server local")
    dispose()
  })

  test("sans liste déclarée, les choix fixes viennent de la donnée", () => {
    // `behavior` se sert du même composant : ses options sont dans la donnée, pas dans une source.
    const { container, dispose } = mount(() => (
      <GeneralSection
        blocks={settingGroups([
          {
            key: "share",
            label: "Session sharing",
            desc: "d",
            kind: "select",
            options: [
              { value: "manual", label: "ask first" },
              { value: "auto", label: "publish automatically" },
            ],
          },
        ])}
        {...BASE}
        draftOf={() => "manual"}
      />
    ))
    // Le libellé est un mot d'écran (« ask first »), jamais la valeur technique (`manual`).
    expect(container.querySelector(".pick-label")?.textContent).toBe("ask first")
    const { labels, rows } = open(container, "Session sharing")
    expect(labels).toEqual(["ask first", "publish automatically"])
    // Pas d'entrée vide : des choix fixes n'ont pas d'état « défaut du serveur ». Et la ligne
    // courante se marque, ce qui est la seule chose que le contrôle fermé ne peut pas dire.
    expect(rows.length).toBe(2)
    expect(rows[0].classList.contains("is-current")).toBe(true)
    dispose()
  })
})

/* =============================================================================
   Le bloc Server — descendu du pied du rail.

   Il y tenait un bouton et un badge permanents (« credentials ✓ ») pour un réglage qu'on touche une
   fois par serveur : de la place au premier plan pour un fait rare. Même règle que le dossier de
   travail, appliquée dans l'autre sens.
   ============================================================================= */

describe("le bloc Server", () => {
  type ServerProps = Parameters<typeof ServerBlock>[0]
  /**
   * `address` n'est **pas** dans la base : dans Solid, `mergeProps` ignore une valeur `undefined`
   * venue d'un spread, donc `{...over}` avec `address: undefined` ne l'écraserait pas et le test
   * croirait vérifier une absence qu'il n'a pas produite.
   */
  const block = (over: Partial<ServerProps> = {}) => (
    <ServerBlock
      username="jeanl"
      password=""
      stored={true}
      onChange={() => {}}
      onSave={() => {}}
      onForget={() => {}}
      {...over}
    />
  )

  test("l'adresse se **lit**, elle ne se saisit pas", () => {
    // Elle vient de `location.origin` ou d'une variable de build : un champ donnerait l'illusion
    // qu'on peut la changer d'ici, alors que rien ne l'écrirait.
    const { container, dispose } = mount(() => block({ address: "http://127.0.0.1:4096" }))
    const row = [...container.querySelectorAll(".set-row")].find(
      (entry) => entry.querySelector(".set-label")?.textContent === "Address",
    )
    expect(row?.querySelector("input")).toBeNull()
    expect(row?.querySelector(".set-value")?.textContent).toBe("http://127.0.0.1:4096")
    dispose()
  })

  test("sans adresse propre, elle dit « same origin » plutôt que rien", () => {
    const { container, dispose } = mount(() => block())
    expect(container.querySelector(".set-value")?.textContent).toBe("same origin")
    dispose()
  })

  test("« Forget » n'existe que s'il y a quelque chose à oublier", () => {
    // Ce qui est rare ne s'affiche pas au repos.
    const stored = mount(() => block({ stored: true }))
    expect(stored.container.textContent).toContain("Forget")
    stored.dispose()

    const empty = mount(() => block({ stored: false }))
    expect(empty.container.textContent).not.toContain("Forget")
    empty.dispose()
  })

  test("un mot de passe ne s'affiche pas en clair", () => {
    const { container, dispose } = mount(() => block({ password: "secret-value" }))
    const field = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(field?.value).toBe("secret-value")
    // Et il ne part pas dans un libellé ou une infobulle.
    expect(container.innerHTML).not.toContain("secret-value</")
    dispose()
  })
})
