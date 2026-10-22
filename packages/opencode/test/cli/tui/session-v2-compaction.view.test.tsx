/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { CompactionDisclosure, CompactionPending } from "@/cli/cmd/tui/component/compaction-summary"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

function providers(component: () => unknown) {
  return (
    <TuiConfigProvider config={createTuiResolvedConfig()}>
      <KVProvider>
        <ThemeProvider mode="dark">{component() as never}</ThemeProvider>
      </KVProvider>
    </TuiConfigProvider>
  )
}

function focusToggle(renderer: Awaited<ReturnType<typeof testRender>>["renderer"]) {
  const visit = (node: Renderable): Renderable | undefined => {
    if (node.id === "compaction-summary-toggle") return node
    for (const child of node.getChildren()) {
      if (!isRenderable(child)) continue
      const result = visit(child)
      if (result) return result
    }
  }
  const control = visit(renderer.root)
  if (!control) throw new Error("expected a focusable compaction control")
  control.focus()
}

test("compaction summary is collapsed by default and expands from the keyboard", async () => {
  const app = await testRender(
    () => (
      <CompactionDisclosure label="Auto Compaction" color="#ffffff" muted="#888888">
        <text>Essential compacted state</text>
      </CompactionDisclosure>
    ),
    { width: 60, height: 12 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Auto Compaction")
  expect(app.captureCharFrame()).not.toContain("Essential compacted state")

  focusToggle(app.renderer)
  app.mockInput.pressEnter()
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Auto Compaction")
  expect(app.captureCharFrame()).toContain("Essential compacted state")
})

test("the label is centred between two rules that split the remaining width", async () => {
  const app = await testRender(
    () => (
      <CompactionDisclosure label="Compacted context" color="#ffffff" muted="#888888">
        <text>Essential compacted state</text>
      </CompactionDisclosure>
    ),
    { width: 60, height: 12 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const line = app.captureCharFrame().split("\n")[0]
  // Le libellé est encadré de part et d'autre, et les deux filets ont la même longueur :
  // c'est ce qui prouve le centrage, pas seulement la présence d'un tiret.
  const [left, rest] = line.split("Compacted context")
  expect(left?.trimEnd().length ?? 0).toBeGreaterThan(0)
  expect(rest?.trimEnd().length ?? 0).toBeGreaterThan(0)
  // Les deux filets se partagent le reste : à une colonne près quand ce reste est impair,
  // une cellule ne se coupant pas en deux. C'est le centrage exact possible en terminal.
  const leftRule = (left?.match(/─/g) ?? []).length
  const rightRule = (rest?.match(/─/g) ?? []).length
  expect(Math.abs(leftRule - rightRule)).toBeLessThanOrEqual(1)
  // Plus de flèche de pliage : le libellé seul porte le sens.
  expect(line).not.toContain("▶")
  expect(line).not.toContain("▼")
})

test("left aligned compaction summary keeps the transcript indentation", async () => {
  const app = await testRender(
    () => (
      <CompactionDisclosure label="Compacted context" color="#ffffff" muted="#888888" paddingLeft={3}>
        <text>Essential compacted state</text>
      </CompactionDisclosure>
    ),
    { width: 60, height: 12 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const line = app.captureCharFrame().split("\n")[0] ?? ""
  expect(line).toStartWith("   ")
  expect(line).toContain("Compacted context")
  expect(app.captureCharFrame()).not.toContain("Essential compacted state")
})

test("the pending row shows the same rules so the label does not jump when the summary lands", async () => {
  const app = await testRender(
    () =>
      providers(() => (
        <CompactionPending label="Compacting context" muted="#888888" rule="#888888" paddingLeft={3} />
      )) as never,
    { width: 60, height: 6 },
  )
  renderers.push(app.renderer)
  // Le spinner attend le chargement KV : sans cette attente la premiere trame est vide.
  for (let attempt = 0; attempt < 12; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().includes("Compacting context")) break
  }
  const line = app.captureCharFrame().split("\n")[0] ?? ""
  expect(line).toContain("Compacting context")
  const [left, rest] = line.split("Compacting context")
  expect((left?.match(/─/g) ?? []).length).toBeGreaterThan(0)
  expect((rest?.match(/─/g) ?? []).length).toBeGreaterThan(0)
  expect(Math.abs((left?.match(/─/g) ?? []).length - (rest?.match(/─/g) ?? []).length)).toBeLessThanOrEqual(2)
  expect(line).not.toContain("▶")
})