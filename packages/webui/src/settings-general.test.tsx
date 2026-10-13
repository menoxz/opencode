import { describe, expect, test } from "vitest"
import { render } from "solid-js/web"
import { GeneralSection, SettingsSheet } from "./settings-sheet"
import { GENERAL_SETTINGS, SETTINGS_SECTIONS, settingGroups } from "./settings"

/** Monte un composant dans un conteneur neuf et renvoie le conteneur et le HTML produit. */
function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

/** Ce qu'une page reçoit du conteneur — le rendu des lignes ne dépend pas de la section. */
const BASE = {
  draftOf: () => "",
  checkedOf: () => false,
  onInput: () => {},
  onCommit: () => {},
}

const WORKSPACE = {
  value: "C:\\jeanluc\\opencode-fork",
  known: ["C:\\jeanluc\\opencode-fork", "C:\\jeanluc\\auxiflow"],
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

describe("la page General", () => {
  const page = () => (
    <GeneralSection
      blocks={settingGroups(GENERAL_SETTINGS)}
      afterGroup="Defaults"
      workspace={WORKSPACE}
      footnote="written to C:\\Users\\jeanl\\.config\\opencodev2\\opencode.jsonc · server local"
      {...BASE}
    />
  )

  test("les trois réglages de l'ancienne section « models » s'y trouvent", () => {
    // L'exigence centrale : ce qui était dans Models est dans General, à l'écran et pas seulement
    // dans les données.
    const { html, dispose } = mount(page)
    expect(html).toContain("Default model")
    expect(html).toContain("Small model")
    expect(html).toContain("Default agent")
    dispose()
  })

  test("trois blocs nommés, dans l'ordre : Defaults, Workspace, Identity", () => {
    const { html, dispose } = mount(page)
    const defaults = html.indexOf("Defaults")
    const workspace = html.indexOf("Working directory")
    const identity = html.indexOf("Identity")
    expect(defaults).toBeGreaterThanOrEqual(0)
    expect(workspace).toBeGreaterThan(defaults)
    expect(identity).toBeGreaterThan(workspace)
    dispose()
  })

  test("le dossier de travail est étiqueté, et la complétion porte les workspaces connus", () => {
    // Le champ existait déjà au pied du rail, **sans libellé** : rien ne disait ce qu'on y écrit.
    const { container, dispose } = mount(page)
    const options = container.querySelectorAll("datalist option")
    expect(options.length).toBe(WORKSPACE.known.length)
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(WORKSPACE.known)
    expect(container.textContent).toContain("2 workspaces")
    dispose()
  })

  test("le pied de page dit où les réglages sont écrits, et quelle version les sert", () => {
    // Deux faits qu'aucun autre écran ne donne — et le fichier exact, parce que « enregistré » sans
    // dire où est le défaut qui coûte une heure.
    const { html, dispose } = mount(page)
    expect(html).toContain("opencode.jsonc")
    expect(html).toContain("server local")
    dispose()
  })

  test("sans dossier de travail déclaré, la page n'est qu'un rendu de blocs", () => {
    // `behavior` et `tools` se servent du même composant : rien de « général » ne doit y fuir.
    const { container, html } = (() => {
      const mounted = mount(() => (
        <GeneralSection blocks={settingGroups([{ key: "share", label: "Session sharing", desc: "d", kind: "select" }])} {...BASE} />
      ))
      return mounted
    })()
    expect(container.querySelectorAll(".sheet-section").length).toBe(1)
    expect(html).not.toContain("Working directory")
    expect(html).not.toContain("datalist")
  })
})
