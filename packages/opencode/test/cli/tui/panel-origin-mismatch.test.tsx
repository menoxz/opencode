/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { BoxRenderable } from "@opentui/core"

type App = Awaited<ReturnType<typeof testRender>>
const renderers: App["renderer"][] = []
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy()
})

// Reproduces the geometry of the real session: a top region above the session
// column (navbar), then [transcript, prompt]. The "/" panel uses the component's
// exact memos:
//   position().y = anchor.y - anchor.parent.y              (parent-relative)
//   height()     = min(10, count, max(1, anchor.y))         (SCREEN-absolute clamp)
//   top          = position().y - height()
// The two origins differ, so `top` can go negative when the prompt's parent
// starts below the screen top — the panel is drawn ABOVE the prompt, over the
// agent's output.
test("origin mismatch: position() is parent-relative but height() clamps to screen y", async () => {
  const COUNT = 8
  let anchor!: BoxRenderable
  const app = await testRender(
    () => (
      <box width="100%" height="100%" flexDirection="column">
        <box height={3}>
          <text>NAVBAR</text>
        </box>
        <box flexGrow={1} flexDirection="column">
          <box height={2}>
            <text>TRANSCRIPT-1</text>
            <text>TRANSCRIPT-2</text>
          </box>
          <box ref={(r: BoxRenderable) => (anchor = r)} width="100%" height={2}>
            <text>PROMPT-ANCHOR</text>
          </box>
        </box>
      </box>
    ),
    { width: 50, height: 20 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  await Bun.sleep(30)
  await app.renderOnce()

  const parent = anchor.parent
  const positionY = anchor.y - (parent?.y ?? 0)
  const currentHeight = Math.min(10, COUNT, Math.max(1, anchor.y))
  const fixedHeight = Math.min(10, COUNT, Math.max(1, positionY))
  const currentTop = positionY - currentHeight
  const fixedTop = positionY - fixedHeight
  console.log(
    "GEOM " +
      JSON.stringify({ anchorY: anchor.y, parentY: parent?.y, positionY, COUNT, currentHeight, currentTop, fixedHeight, fixedTop }),
  )

  // The current clamp lets `top` go negative: the panel is placed above its parent,
  // over the transcript/agent output.
  expect(currentTop).toBeLessThan(0)
  // Clamping to the parent-relative space keeps the panel fully above the prompt.
  expect(fixedTop).toBeGreaterThanOrEqual(0)
})
