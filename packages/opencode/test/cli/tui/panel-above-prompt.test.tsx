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
//   content column                                     routes/session/index.tsx:1615
//     scrollbox transcript flexGrow=1                  routes/session/index.tsx:1619
//     box flexShrink=0 zIndex=1000                     routes/session/index.tsx:1751
//       prompt anchor box                              component/prompt/index.tsx:1540
//       panel absolute (zIndex=100)                    component/prompt/autocomplete.tsx
// The panel hangs above the prompt's top edge, over the transcript, so the transcript
// scrollbox and the panel overlap. The prompt wrapper must carry its own z-index (as
// home.tsx:82 does); without it the scrollbox paints over the panel's upper rows and the
// command list is silently clipped — the bug this test locks out.
async function render() {
  let anchor!: BoxRenderable
  let panel!: BoxRenderable
  const rows = Array.from({ length: 40 }, (_x, i) => `TRANS-${i}`)
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
          <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
            <scrollbox flexGrow={1} minHeight={0} backgroundColor={RGBA.fromInts(0, 0, 0, 255)}>
              {rows.map((t) => (
                <text>{t}</text>
              ))}
            </scrollbox>
            <box flexShrink={0} zIndex={1000}>
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
                    {Array.from({ length: COUNT }, (_x, i) => (
                      <text>{`PANEL-${i}`}</text>
                    ))}
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

test("the '/' panel stays fully visible above the prompt, over the transcript", async () => {
  const { app, panel, anchor } = await render()
  const frame = app.captureCharFrame()
  const visible = (frame.match(/PANEL-\d+/g) ?? []).length
  console.log(`panel.y=${panel.y} panel.h=${panel.height} prompt.y=${anchor.y} visible=${visible}/${COUNT}`)
  console.log(frame)
  // Not collapsed to a single row: the full option list is shown.
  expect(panel.height).toBe(COUNT)
  // Fully above the prompt's top edge (never overlapping the prompt or the response below it).
  expect(panel.y + panel.height).toBeLessThanOrEqual(anchor.y)
  // Suspended above the prompt, not pinned to its first line.
  expect(panel.y).toBeLessThan(anchor.y)
  // Not painted over by the transcript scrollbox: every option row reaches the screen.
  expect(visible).toBe(COUNT)
})
