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

// Faithful reproduction of the real "/" panel geometry in the session route:
//   root column
//     header (top region)
//     row flexGrow=1                       (session body, routes/session/index.tsx)
//       navbar column                      (SessionNavBar)
//       content column flexGrow            (transcript + prompt)
//         transcript box
//         flexShrink=0                     (prompt wrapper)
//           prompt anchor box              (component/prompt/index.tsx)
//           panel absolute                 (component/prompt/autocomplete.tsx)
// The prompt is the FIRST child of the wrapper, so anchor.parent.y === anchor.y and
// position().y === 0. The fixed component sizes the panel with min(10, count) only
// and places top = position().y - height(), suspending it just above the prompt.
async function render() {
  let anchor!: BoxRenderable
  let panel!: BoxRenderable
  const rows = Array.from({ length: 18 }, (_x, i) => `TRANS-${i}`)
  const app = await testRender(
    () => (
      <box width="100%" height="100%" flexDirection="column">
        <box height={1}>
          <text>HEADER</text>
        </box>
        <box flexDirection="row" flexGrow={1} minHeight={0}>
          <box width={10}>
            <text>NAVBAR</text>
          </box>
          <box flexGrow={1} minHeight={0} flexDirection="column" paddingLeft={2} paddingRight={2}>
            <box height={18} flexDirection="column">
              {rows.map((t) => (
                <text>{t}</text>
              ))}
            </box>
            <box flexShrink={0}>
              <box ref={(r: BoxRenderable) => (anchor = r)} width="100%" height={3}>
                <text>PROMPT-L1</text>
                <text>PROMPT-L2</text>
              </box>
              {(() => {
                const positionY = () => anchor.y - (anchor.parent?.y ?? 0)
                const height = () => Math.min(10, COUNT)
                return (
                  <box
                    ref={(r: BoxRenderable) => (panel = r)}
                    position="absolute"
                    top={positionY() - height()}
                    left={0}
                    width={30}
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
        </box>
      </box>
    ),
    { width: 60, height: 30 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  await Bun.sleep(30)
  await app.renderOnce()
  return { app, panel, anchor }
}

test("the '/' panel is suspended directly above the prompt, multi-row", async () => {
  const { app, panel, anchor } = await render()
  console.log(`panel.y=${panel.y} panel.h=${panel.height} prompt.y=${anchor.y}`)
  console.log(app.captureCharFrame())
  // Not collapsed to a single row: the full option list is shown.
  expect(panel.height).toBe(COUNT)
  // Fully above the prompt's top edge (never overlapping the prompt or the response below it).
  expect(panel.y + panel.height).toBeLessThanOrEqual(anchor.y)
  // Suspended above the prompt, not pinned to its first line.
  expect(panel.y).toBeLessThan(anchor.y)
})
