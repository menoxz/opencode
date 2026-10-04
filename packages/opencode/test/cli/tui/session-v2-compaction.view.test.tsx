/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { CompactionDisclosure } from "@/cli/cmd/tui/component/compaction-summary"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

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
  expect(app.captureCharFrame()).toContain("▶ Auto Compaction")
  expect(app.captureCharFrame()).not.toContain("Essential compacted state")

  focusToggle(app.renderer)
  app.mockInput.pressEnter()
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("▼ Auto Compaction")
  expect(app.captureCharFrame()).toContain("Essential compacted state")

})

test("left aligned compaction summary keeps the transcript indentation", async () => {
  const app = await testRender(
    () => (
      <CompactionDisclosure
        label="Compacted context"
        color="#ffffff"
        muted="#888888"
        align="left"
        paddingLeft={3}
      >
        <text>Essential compacted state</text>
      </CompactionDisclosure>
    ),
    { width: 60, height: 12 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(app.captureCharFrame().split("\n")[0]).toStartWith("   ▶ Compacted context")
  expect(app.captureCharFrame()).not.toContain("Essential compacted state")
})
