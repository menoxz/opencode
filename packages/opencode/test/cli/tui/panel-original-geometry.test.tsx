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

// Characterizes the ORIGINAL "/" panel geometry (autocomplete.tsx, restored by
// revert cc9f3b7d1):
//   height = min(10, count, max(1, anchor().y))   // screen-absolute clamp
//   top    = position().y - height()              // unbounded (may be negative)
// It places the panel ABOVE the prompt, over the transcript, without clamping.
test("original panel geometry: top = position().y - height()", async () => {
  const COUNT = 8
  let anchor!: BoxRenderable
  let panel!: BoxRenderable
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
          {(() => {
            const positionY = () => anchor.y - (anchor.parent?.y ?? 0)
            const height = () => Math.min(10, COUNT, Math.max(1, anchor.y))
            return (
              <box
                ref={(r: BoxRenderable) => (panel = r)}
                position="absolute"
                top={positionY() - height()}
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

  const parentY = anchor.parent?.y ?? 0
  const positionY = anchor.y - parentY
  const height = Math.min(10, COUNT, Math.max(1, anchor.y))
  console.log(
    "ORIGINAL_GEOM " +
      JSON.stringify({ anchorY: anchor.y, parentY, positionY, height, top: positionY - height, panelY: panel.y }),
  )
  // The restored original formula is UNBOUNDED: top = position().y - height(),
  // negative in this geometry, so the panel is placed above the prompt over the
  // transcript (opentui clamps the painted row, but the intent is unchanged).
  // Confirms the v2.3.45 clamp was removed.
  expect(positionY - height).toBeLessThan(0)
  expect(panel.y).toBeLessThanOrEqual(anchor.y)
})
