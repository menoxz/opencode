import { createSignal } from "solid-js"
import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { GeneralSection, SettingsSheet } from "./settings-sheet"
import { GENERAL_SETTINGS, SETTINGS_SECTIONS, settingGroups, type ChoiceGroup, type SettingSpec } from "./settings"

/** Monte un composant dans un conteneur neuf et renvoie le conteneur et le HTML produit. */
function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const MODELS: ChoiceGroup[] = [
  {
    title: "OpenCode Go",
    choices: [
      { value: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      { value: "opencode-go/kimi-k2", label: "Kimi K2" },
    ],
  },
]
const AGENTS: ChoiceGroup[] = [{ choices: [{ value: "build", label: "build" }, { value: "zx", label: "zx" }] }]
const SHELLS: ChoiceGroup[] = [
  { choices: [{ value: "cmd", label: "cmd" }, { value: "pwsh", label: "pwsh" }] },
]

/** Ce qu'une page reçoit du conteneur — le rendu des lignes ne dépend pas de la section. */
const BASE = {
  groupsOf: (spec: SettingSpec) =>
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

  test("les quatre réglages à ensemble fini sont des `select`, pas des champs", () => {
    // C'est la correction : un champ de texte pour un modèle oblige à aller chercher
    // `opencode-go/deepseek-v4.1-flash` ailleurs et à le recopier sans faute.
    const { container, dispose } = mount(page)
    const rows = [...container.querySelectorAll(".set-row")]
    const control = (label: string) =>
      rows.find((row) => row.querySelector(".set-label")?.textContent === label)?.querySelector(".set-control input, .set-control select")
    expect(GENERAL_SETTINGS.filter((spec) => spec.kind === "select").map((spec) => spec.label)).toEqual([
      "Default model",
      "Small model",
      "Default agent",
      "Shell",
    ])
    for (const label of ["Default model", "Small model", "Default agent", "Shell"]) {
      expect(control(label)?.tagName).toBe("SELECT")
    }
    // Le seul champ restant : l'identité, qui n'a pas d'ensemble fini.
    expect(control("Username")?.tagName).toBe("INPUT")
    dispose()
  })

  test("les modèles viennent de la source, groupés par fournisseur", () => {
    const { container, dispose } = mount(() => page(() => "opencode-go/kimi-k2"))
    const select = container.querySelector("select.set-select")!
    const group = select.querySelector("optgroup")
    expect(group?.getAttribute("label")).toBe("OpenCode Go")
    expect([...(group?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value"))).toEqual([
      "opencode-go/deepseek-v4.1-flash",
      "opencode-go/kimi-k2",
    ])
    expect([...(group?.querySelectorAll("option") ?? [])].map((o) => o.textContent)).toEqual([
      "DeepSeek V4.1 Flash",
      "Kimi K2",
    ])
    dispose()
  })

  test("l'option vide porte « server default » : vide est un état, pas une absence", () => {
    // Mesuré : `config.ts:513` retire la clé quand la valeur écrite est la chaîne vide. L'option
    // vide remet donc réellement le réglage au défaut du serveur.
    const { container, dispose } = mount(page)
    const first = container.querySelector("select.set-select option")
    expect(first?.getAttribute("value")).toBe("")
    expect(first?.textContent).toBe("server default")
    dispose()
  })

  test("une valeur configurée hors de la liste s'affiche quand même", () => {
    // Sinon le contrôle montrerait **une autre valeur que celle réellement écrite**.
    const { container, dispose } = mount(() => page(() => "autre-fournisseur/modele-maison"))
    const values = [...container.querySelectorAll("select.set-select option")].map((o) => o.getAttribute("value"))
    expect(values).toContain("autre-fournisseur/modele-maison")
    dispose()
  })

  test("la liste réapplique la valeur configurée quand ses options changent", () => {
    // Le défaut mesuré **au CDP** (le seul oracle, ici) : `domValue: ""` et `selectedIndex: 0` sur
    // les quatre listes, alors que `opencode-go/deepseek-v4.1-flash` figurait bien dans les 697
    // options. Un `<select>` à qui l'on donne une valeur qu'aucune option ne porte **encore** reste
    // sur la première : la valeur est posée avant que les options soient insérées, et le contrôle
    // affichait « server default » sur une configuration renseignée — un mensonge à l'écran.
    //
    // jsdom ne rejoue pas cette course : il insère les options avant que la valeur soit posée, donc
    // un test « monte puis vérifie » passe même sur le code fautif (mesuré). Celui-ci vise le
    // **mécanisme** : on simule la sélection perdue (ce que fait le navigateur), puis on laisse les
    // options changer — et la valeur doit revenir d'elle-même.
    const [groups, setGroups] = createSignal<ChoiceGroup[]>(MODELS)
    const { container, dispose } = mount(() => (
      <GeneralSection
        blocks={settingGroups(GENERAL_SETTINGS)}
        groupsOf={(spec) => (spec.source === "models" ? groups() : spec.source === "shells" ? SHELLS : AGENTS)}
        draftOf={() => "opencode-go/kimi-k2"}
        checkedOf={() => false}
        onInput={() => {}}
        onCommit={() => {}}
      />
    ))
    const select = container.querySelector("select.set-select") as HTMLSelectElement
    expect(select.value).toBe("opencode-go/kimi-k2")

    select.value = "" // ce que produit la course : la valeur n'a pas trouvé son option
    setGroups([...MODELS, { title: "Autre", choices: [{ value: "autre/a", label: "a" }] }])

    expect(select.value).toBe("opencode-go/kimi-k2")
    dispose()
  })

  test("le pied de page dit où les réglages sont écrits, et quelle version les sert", () => {
    const { html, dispose } = mount(page)
    expect(html).toContain("opencode.jsonc")
    expect(html).toContain("server local")
    dispose()
  })

  test("sans liste déclarée, un `select` aux choix fixes se rend normalement", () => {
    // `behavior` se sert du même composant : ses options sont dans la donnée, pas dans une source.
    const { container } = (() => {
      const mounted = mount(() => (
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
        />
      ))
      return mounted
    })()
    const options = [...container.querySelectorAll("select option")].map((o) => o.getAttribute("value"))
    // Pas d'option vide : un `select` aux choix fixes n'a pas d'état « défaut du serveur ».
    expect(options).toEqual(["manual", "auto"])
  })
})
