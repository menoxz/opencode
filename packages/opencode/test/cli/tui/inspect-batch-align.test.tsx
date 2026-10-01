/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { InspectBatchTree } from "@/cli/cmd/tui/component/inspect-batch-tree"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy()
})

async function settled(app: { renderOnce(): Promise<void>; captureCharFrame(): string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

// The session route wraps the inspect_batch block in <box paddingLeft={3}>, the same
// gutter the plain-text part uses. This renders that exact shape and asserts the
// heading and every action row sit at the prose column rather than at the margin.
test("the batch block is indented to the prose gutter and stays one row per action", async () => {
  const actions = Array.from({ length: 3 }, (_, id) => ({ id: String(id), type: "read", filePath: `src/f${id}.ts` }))
  const app = await testRender(
    () => (
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">
            <box flexDirection="column">
              <box paddingLeft={3}>
                <text fg="#ffffff">PLAIN</text>
              </box>
              <box paddingLeft={3} flexShrink={0}>
                <InspectBatchTree
                  input={{ actions }}
                  status="completed"
                  output={JSON.stringify({ results: actions.map(({ id, type }) => ({ id, type, status: "success" })) })}
                  color="#ffffff"
                  muted="#888888"
                  success="#00ff00"
                />
              </box>
            </box>
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    ),
    { width: 50, height: 12 },
  )
  renderers.push(app.renderer)
  await settled(app)
  const lines = app.captureCharFrame().split("\n")
  const heading = lines.find((line) => line.includes("inspect_batch"))
  expect(heading).toBeDefined()
  // Same column as the plain prose, not flush at the margin.
  expect(heading!.indexOf("inspect_batch")).toBe(3)
  const rows = lines.filter((line) => line.includes("✓"))
  expect(rows).toHaveLength(3)
  for (const row of rows) {
    expect(row.indexOf("✓")).toBe(3)
    expect(row.slice(0, 3)).toBe("   ")
  }
})
