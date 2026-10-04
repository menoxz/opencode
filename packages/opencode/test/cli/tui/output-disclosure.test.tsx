/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import {
  countLines,
  isLargeOutput,
  OutputDisclosure,
  OutputField,
  summarizeOutput,
  toggleAllOutput,
} from "@/cli/cmd/tui/component/output-disclosure"

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

function focusToggle(renderer: Awaited<ReturnType<typeof testRender>>["renderer"], id = "output-disclosure-toggle") {
  const visit = (node: Renderable): Renderable | undefined => {
    if (node.id === id) return node
    for (const child of node.getChildren()) {
      if (!isRenderable(child)) continue
      const result = visit(child)
      if (result) return result
    }
  }
  const control = visit(renderer.root)
  if (!control) throw new Error(`expected a focusable control with id ${id}`)
  control.focus()
}

// ThemeProvider paints asynchronously; render until the frame is non-empty,
// mirroring the settle loop the sibling view tests use.
async function settled(app: { renderOnce(): Promise<void>; captureCharFrame(): string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

test("sizes an output by characters or lines, and summarizes it", () => {
  expect(isLargeOutput("short")).toBe(false)
  expect(isLargeOutput("x".repeat(400))).toBe(true)
  expect(isLargeOutput(Array.from({ length: 9 }, () => "row").join("\n"))).toBe(true)
  expect(countLines("one\ntwo\nthree")).toBe(3)
  expect(countLines("no newline")).toBe(1)
  expect(summarizeOutput("one\ntwo\nthree")).toBe("3 lines · 13 chars")
  expect(summarizeOutput("single")).toBe("1 line · 6 chars")
})

test("a large output is folded by default and unfolds from the keyboard", async () => {
  const value = Array.from({ length: 12 }, (_, i) => `output line ${i}`).join("\n")
  const app = await testRender(
    () => providers(() => <OutputDisclosure id="output-disclosure-toggle" label="output" value={value} />),
    { width: 80, height: 24 },
  )
  renderers.push(app.renderer)
  await settled(app)

  // Folded: the summary and the collapsed marker are visible, the body is not.
  expect(app.captureCharFrame()).toContain("▶ output · 12 lines")
  expect(app.captureCharFrame()).not.toContain("output line 0")

  focusToggle(app.renderer)
  app.mockInput.pressEnter()
  await settled(app)

  // Unfolded: the marker flips and the full untruncated body is present.
  expect(app.captureCharFrame()).toContain("▼ output · 12 lines")
  expect(app.captureCharFrame()).toContain("output line 0")
  expect(app.captureCharFrame()).toContain("output line 11")
})

test("a short output stays inline instead of becoming a disclosure", async () => {
  const app = await testRender(
    () => providers(() => <OutputField label="output" value="ok" />),
    { width: 60, height: 12 },
  )
  renderers.push(app.renderer)
  await settled(app)

  expect(app.captureCharFrame()).toContain("output")
  expect(app.captureCharFrame()).toContain("ok")
  expect(app.captureCharFrame()).not.toContain("▶")
})

test("the global command unfolds and refolds every output at once", async () => {
  const big = Array.from({ length: 12 }, (_, i) => `body ${i}`).join("\n")
  const app = await testRender(
    () =>
      providers(() => (
        <box flexDirection="column">
          <OutputDisclosure id="first" label="first" value={big} />
          <OutputDisclosure id="second" label="second" value={big} />
        </box>
      )),
    { width: 80, height: 30 },
  )
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).toContain("▶ first")
  expect(app.captureCharFrame()).toContain("▶ second")
  expect(app.captureCharFrame()).not.toContain("body 0")

  toggleAllOutput(true)
  await settled(app)
  expect(app.captureCharFrame()).toContain("▼ first")
  expect(app.captureCharFrame()).toContain("▼ second")
  expect(app.captureCharFrame()).toContain("body 0")

  toggleAllOutput(false)
  await settled(app)
  expect(app.captureCharFrame()).toContain("▶ first")
  expect(app.captureCharFrame()).not.toContain("body 0")
})
