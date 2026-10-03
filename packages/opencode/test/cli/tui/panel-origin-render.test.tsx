/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import type { BoxRenderable } from "@opentui/core"

type App = Awaited<ReturnType<typeof testRender>>
const renderers: App["renderer"][] = []
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy()
})

const COUNT = 8
const TRANSCRIPT = ["TRANSCRIPT-ALPHA", "TRANSCRIPT-BETA"]

// Before/after render proof for the "/" panel origin fix (autocomplete.tsx).
// Layout mirrors the session: a header above, then [transcript, prompt(anchor)].
//   position().y = anchor.y - anchor.parent.y     (parent-relative)
//   OLD height   = min(10, count, max(1, anchor.y))          -> screen-absolute clamp
//   NEW height   = min(10, count, max(1, position().y))      -> parent-relative clamp
//   top          = max(0, position().y - height())
async function render(formula: "old" | "new") {
  let anchor!: BoxRenderable
  let panel!: BoxRenderable
  const app = await testRender(
    () => (
      <box width="100%" height="100%" flexDirection="column">
        <box height={3}>
          <text>HEADER</text>
        </box>
        <box flexGrow={1} flexDirection="column">
          <box height={2}>
            <text>{TRANSCRIPT[0]}</text>
            <text>{TRANSCRIPT[1]}</text>
          </box>
          <box ref={(r: BoxRenderable) => (anchor = r)} width="100%" height={2}>
            <text>PROMPT-ANCHOR</text>
          </box>
          {(() => {
            const positionY = () => anchor.y - (anchor.parent?.y ?? 0)
            const height = () =>
              Math.min(10, COUNT, Math.max(1, formula === "old" ? anchor.y : positionY()))
            return (
              <box
                ref={(r: BoxRenderable) => (panel = r)}
                position="absolute"
                top={Math.max(0, positionY() - height())}
                left={0}
                width={40}
                height={height()}
                zIndex={100}
                backgroundColor={RGBA.fromInts(40, 40, 40)}
              >
                <text>PANEL-/copy</text>
              </box>
            )
          })()}
        </box>
      </box>
    ),
    { width: 60, height: 16 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  await Bun.sleep(30)
  await app.renderOnce()
  return { app, panel: panel!, anchor: anchor! }
}

test("new formula keeps the panel inside its parent, over the prompt", async () => {
  const { app, panel, anchor } = await render("new")
  const parent = anchor.parent
  console.log(`NEW panelY=${panel.y} parentY=${parent?.y} anchorY=${anchor.y}`)
  console.log(app.captureCharFrame())
  // Panel stays within the parent origin, never above it into the transcript/header.
  expect(panel.y).toBeGreaterThanOrEqual(parent?.y ?? 0)
})

test("old formula pushed the panel above its parent, over the agent output", async () => {
  const { panel, anchor } = await render("old")
  const parent = anchor.parent
  const positionY = anchor.y - (parent?.y ?? 0)
  const oldTop = positionY - Math.min(10, COUNT, Math.max(1, anchor.y))
  console.log(`OLD positionY=${positionY} anchorY=${anchor.y} oldTop=${oldTop} parentY=${parent?.y}`)
  // Documents the defect the fix closes: the old clamp yielded a negative top.
  expect(oldTop).toBeLessThan(0)
})
