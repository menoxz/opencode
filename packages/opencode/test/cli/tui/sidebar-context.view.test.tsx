/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { createSignal } from "solid-js"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { ContextUsage } from "@/cli/cmd/tui/feature-plugins/sidebar/context-usage"
import { costTree, loadedUsage, lastCompletedAssistant } from "@/cli/cmd/tui/feature-plugins/sidebar/context-metrics"
import { assistant, step } from "./sidebar-context.test"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

function focusDetailsControl(renderer: Awaited<ReturnType<typeof testRender>>["renderer"]) {
  const visit = (node: Renderable): Renderable | undefined => {
    if (node.id === "context-details-toggle") return node
    for (const child of node.getChildren()) {
      if (!isRenderable(child)) continue
      const result = visit(child)
      if (result) return result
    }
  }
  const control = visit(renderer.root)
  if (!control) throw new Error("expected a focusable details control")
  control.focus()
}

for (const width of [40, 24]) {
  test(`real renderer keeps primary context metrics visible and details collapsed at ${width} columns`, async () => {
    const message = assistant({
      cost: 0.375,
      tokens: { input: 999, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    })
    const parts = [
      step({ id: "z-first", cost: 0.25 }),
      step({
        id: "a-last",
        cost: 0.125,
        tokens: { input: 100, output: 0, reasoning: 30, cache: { read: 60, write: 10 } },
      }),
    ]
    const app = await testRender(
      () => <ContextUsage message={message} parts={parts} limit={1000} cost={4.5} color="#ffffff" muted="#888888" />,
      { width, height: 24 },
    )
    renderers.push(app.renderer)
    await app.renderOnce()
    const frame = app.captureCharFrame()
    for (const line of ["Context (last call)", "200 tokens", "20% used", "Cost: $4.50", "▶ Details"])
      expect(frame).toContain(line)
    for (const line of ["Non-cache input", "Cache read", "Cache write", "Last call"]) expect(frame).not.toContain(line)
    expect(frame).not.toMatch(/spent|billed|0\.375|999 tokens/)

    focusDetailsControl(app.renderer)
    app.mockInput.pressEnter()
    await app.renderOnce()
    const expanded = app.captureCharFrame()
    for (const line of ["▼ Details", "Non-cache input: 100", "Cache read: 60", "Cache write: 10", "Last call: $0.125"])
      expect(expanded).toContain(line)
  })

  test(`real renderer preserves completed usage while streaming and updates on completion at ${width} columns`, async () => {
    const [messages, setMessages] = createSignal<Message[]>([])
    const [cost, setCost] = createSignal<number | undefined>()
    const [parts, setParts] = createSignal<Part[]>([])
    const app = await testRender(
      () => (
        <ContextUsage
          message={lastCompletedAssistant(messages(), 10)}
          parts={parts()}
          cost={cost()}
          color="#ffffff"
          muted="#888888"
        />
      ),
      { width, height: 24 },
    )
    renderers.push(app.renderer)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("No completed call")
    expect(app.captureCharFrame()).toContain("Cost: —")
    expect(app.captureCharFrame()).not.toContain("Last call: unavailable")
    setMessages([assistant()])
    setCost(0)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("0 tokens")
    expect(app.captureCharFrame()).toContain("Limit unknown")
    expect(app.captureCharFrame()).toContain("Cost: $0.00")
    expect(app.captureCharFrame()).not.toContain("No step-finish data")
    expect(app.captureCharFrame()).toContain("Context (stored usage)")
    setParts([step()])
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Context (last call)")
    const partial = assistant({
      id: "partial",
      time: { created: 3 },
      cost: 0.125,
      tokens: { input: 20, output: 0, reasoning: 10, cache: { read: 0, write: 0 } },
    })
    setMessages([assistant(), partial])
    setParts([step(), step({ messageID: partial.id, cost: 0.125, tokens: partial.tokens })])
    setCost(0.125)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("0 tokens")
    expect(app.captureCharFrame()).toContain("Cost: $0.125")
    setMessages([assistant(), { ...partial, time: { created: 3, completed: 4 } }])
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("30 tokens")
    expect(app.captureCharFrame()).not.toContain("Last call: $0.125")
    setMessages([
      assistant(),
      {
        ...partial,
        time: { created: 3, completed: 4 },
        error: { name: "MessageAbortedError", data: { message: "aborted" } },
      },
    ])
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("0 tokens")
    expect(app.captureCharFrame()).toContain("Cost: $0.125")
    setMessages([assistant(), assistant({ id: "no-parts", cost: 7 })])
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("Last call: unavailable")
    expect(app.captureCharFrame()).not.toContain("No step-finish data")
    expect(app.captureCharFrame()).not.toContain("$7.00")
  })
}

test("context details toggle with a mouse click", async () => {
  const message = assistant()
  const app = await testRender(
    () => <ContextUsage message={message} parts={[step()]} limit={1000} cost={1.25} color="#ffffff" muted="#888888" />,
    { width: 40, height: 16 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(app.captureCharFrame()).not.toContain("Non-cache input")

  await app.mockMouse.click(1, 4)
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Non-cache input")
})

for (const width of [24, 48]) {
  test(`real cost tree and processed history react at ${width} columns`, async () => {
    const message = assistant()
    const [childCost, setChildCost] = createSignal<number | undefined>(3.99026)
    const [status, setStatus] = createSignal<"loaded" | "error">("loaded")
    const [parts, setParts] = createSignal<Part[]>([
      step({ id: "first", tokens: { input: 94000, output: 0, reasoning: 0, cache: { read: 600000, write: 0 } } }),
      step({ id: "last", cost: 0.1, tokens: { input: 55000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }),
    ])
    const app = await testRender(
      () => (
        <ContextUsage
          message={message}
          parts={parts()}
          history={loadedUsage("session", [message], () => parts())}
          cost={4.637405}
          tree={costTree("session", [{ id: "child", parentID: "session", cost: childCost() }], 4.637405)}
          treeStatus={status()}
          color="#ffffff"
          muted="#888888"
        />
      ),
      { width, height: 60 },
    )
    renderers.push(app.renderer)
    await app.renderOnce()
    const text = () => app.captureCharFrame().replace(/\s+/g, " ")
    for (const label of ["55,000 tokens", "Cost: $4.637405", "▶ Details"]) expect(text()).toContain(label)
    expect(text()).not.toContain("Processed: 749,000")

    focusDetailsControl(app.renderer)
    app.mockInput.pressEnter()
    await app.renderOnce()
    for (const label of [
      "Processed: 749,000",
      "Footprint, not processed",
      "Loaded history: partial",
      "Read/input: 0%",
      "Prev read/input: 86%",
      "$3.99026",
      "$8.627665",
      "Tree: partial snapshot",
    ])
      expect(text()).toContain(label)
    setChildCost(undefined)
    setStatus("error")
    setParts([])
    await app.renderOnce()
    for (const label of [
      "Processed: unavailable",
      "All loaded: unavailable",
      "1 missing cost",
      "Tree: error",
      "Last call: unavailable",
    ])
      expect(text()).toContain(label)
    expect(text()).not.toContain("$8.627665")
    setChildCost(0)
    setParts([step()])
    await app.renderOnce()
    expect(text()).toContain("Processed: 0")
    expect(text()).toContain("Desc. loaded: $0.00")
    setParts([step({ cost: NaN })])
    await app.renderOnce()
    expect(text()).toContain("Context (last call)")
    expect(text()).toContain("Last call: unavailable")
    expect(text()).not.toContain("No step-finish data")
  })
}
