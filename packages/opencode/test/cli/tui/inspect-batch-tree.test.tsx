/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, type JSX } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { InspectBatchTree } from "@/cli/cmd/tui/component/inspect-batch-tree"
import { inspectBatchTree, type InspectBatchViewInput } from "@/cli/cmd/tui/util/inspect-batch-tree"

const input = {
  actions: [
    { id: "source", type: "read", filePath: "src/main.ts", offset: "10", limit: 20 },
    { id: "search", type: "grep", pattern: "export", path: "src", include: "*.ts", dependsOn: ["source"] },
    { id: "files", type: "glob", pattern: "**/*.ts", dependsOn: ["source", "search"] },
  ],
}
const output = JSON.stringify({
  rounds: 3,
  results: [
    { id: "files", type: "glob", status: "skipped", error: "RAW ERROR" },
    { id: "source", type: "read", status: "success", output: "RAW FILE", truncated: true },
    { id: "search", type: "grep", status: "error", error: "File missing\n at RAW STACK" },
  ],
})

function withProviders(component: () => JSX.Element) {
  return (
    <TuiConfigProvider config={createTuiResolvedConfig()}>
      <KVProvider>
        <ThemeProvider mode="dark">{component()}</ThemeProvider>
      </KVProvider>
    </TuiConfigProvider>
  )
}

async function settled(app: { renderOnce(): Promise<void>; captureCharFrame(): string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

test("pending and running preserve targets without inventing child execution", () => {
  const pending = inspectBatchTree({ input: JSON.stringify(input), status: "pending" })
  expect(pending.rows[0].label).toBe("Read src/main.ts [offset=10, limit=20]")
  expect(pending.rows[0].icon).toBe("…")
  expect(pending.rows[0].spinning).toBe(true)
  const running = inspectBatchTree({ input, status: "running" })
  expect(running.rows[1].label).toContain('Grep "export" in src [include=*.ts]')
  expect(running.rows[1].icon).toBe("…")
  expect(running.rows.every((row) => row.spinning)).toBe(true)
  expect(JSON.stringify(running)).not.toContain("parallel")
})

test("each action takes exactly one row, with its parameters inline and no tree glyph", async () => {
  const actions = [
    { id: "lookup", type: "grep", pattern: "export", path: "src" },
    { id: "file", type: "read", filePath: "src/main.ts", offset: "10", limit: 20, dependsOn: ["lookup"] },
  ]
  const app = await testRender(
    () =>
      withProviders(() => (
        <InspectBatchTree
          input={{ actions }}
          status="completed"
          output={JSON.stringify({ results: actions.map(({ id, type }) => ({ id, type, status: "success" })) })}
          color="#ffffff"
          muted="#888888"
        />
      )),
    { width: 100, height: 8 },
  )
  renderers.push(app.renderer)
  await settled(app)
  const lines = app
    .captureCharFrame()
    .split("\n")
    .filter((line) => line.trim())
  expect(lines).toHaveLength(3)
  expect(lines[1]).toContain('Grep "export" in src')
  expect(lines[2]).toContain("Read src/main.ts [offset=10, limit=20]")
  const frame = lines.join("\n")
  expect(frame).not.toContain("├─")
  expect(frame).not.toContain("└─")
  expect(frame).not.toContain("after")
})

test("results join by id and type, mark errors/skips without exposing their text", () => {
  const tree = inspectBatchTree({ input, output, status: "completed" })
  expect(tree.title).toBe("inspect_batch · 3 actions")
  expect(tree.rows[0].label).toContain("· truncated")
  expect(tree.rows.map((row) => row.icon)).toEqual(["✓", "✗", "−"])
  expect(tree.rows.map((row) => row.spinning)).toEqual([false, false, false])
  expect(JSON.stringify(tree)).not.toContain("File missing")
  expect(JSON.stringify(tree)).not.toContain("RAW")
})

test("empty is a result, not an error; absent results are never success", () => {
  const tree = inspectBatchTree({
    input,
    status: "completed",
    output: JSON.stringify({
      results: [
        { id: "source", type: "read", status: "empty" },
        { id: "search", type: "glob", status: "success" },
      ],
    }),
  })
  expect(tree.rows[0].label).toContain("· empty")
  expect(tree.rows.map((row) => row.icon)).toEqual(["✓", "?", "?"])
})

test("incomplete input, malformed output and metadata do not throw or dump data", () => {
  for (const value of [
    undefined,
    null,
    [],
    4,
    '{"actions":',
    { actions: [null, {}, { id: "x", type: "shell" }, { type: { toString: null } }] },
  ]) {
    const tree = inspectBatchTree({ input: value, status: "completed", output: "{RAW", metadata: null })
    expect(tree.note).toContain("Child results unavailable")
    expect(JSON.stringify(tree)).not.toContain("RAW")
  }
  expect(inspectBatchTree({ input: "{", status: "pending" }).note).toBe("Waiting for actions")
  expect(inspectBatchTree({ input: "{", status: "pending" }).title).toContain("? actions")
  expect(inspectBatchTree({ input: null, status: "completed", metadata: { actions: 3 } }).title).toContain("3 actions")
})

test("batch failure and outer truncation do not fabricate child failure or completion", () => {
  const tree = inspectBatchTree({
    input,
    status: "error",
    error: "Denied\n\u001b[31munsafe",
    metadata: { truncated: ["source"] },
  })
  expect(tree.rows[0].icon).toBe("?")
  expect(tree.rows[0].label).toContain("· truncated")
  expect(tree.note).toBe("Batch failed")
  const truncated = inspectBatchTree({
    input,
    status: "completed",
    output: "partial",
    metadata: { truncated: true },
  })
  expect(truncated.note).toContain("Batch output truncated")
  expect(truncated.rows.every((row) => row.icon === "?")).toBe(true)
})

test("ambiguous duplicate ids, duplicate results and unknown statuses stay unavailable", () => {
  const duplicate = inspectBatchTree({
    input: { actions: [input.actions[0], input.actions[0]] },
    output,
    status: "completed",
  })
  expect(duplicate.rows.every((row) => row.icon === "?")).toBe(true)
  for (const results of [
    [{ id: "source", type: "read", status: "invented" }],
    [{ id: "source", type: "read", status: { toString: null } }],
    [
      { id: "source", type: "read", status: "success" },
      { id: "source", type: "read", status: "error" },
    ],
  ])
    expect(inspectBatchTree({ input, output: JSON.stringify({ results }), status: "completed" }).rows[0].icon).toBe("?")
})

test("large actions, fields and output are bounded and sanitized", () => {
  const tree = inspectBatchTree({
    status: "completed",
    output: "x".repeat(2_000_001),
    input: {
      actions: Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        type: "read",
        filePath: "\u001b[31m\n" + "long/".repeat(10_000) + "important.ts",
        dependsOn: Array.from({ length: 50 }, () => "dependency".repeat(50)),
      })),
    },
  })
  expect(tree.rows).toHaveLength(16)
  expect(tree.note).toContain("+14 actions hidden")
  expect(tree.rows[0].label).toStartWith("Read ")
  expect(tree.rows[0].label).toContain("important.ts")
  expect(tree.rows.every((row) => !row.label.includes("├") && !row.label.includes("└"))).toBe(true)
  expect(tree.rows.every((row) => row.label.length < 180)).toBe(true)
  expect(JSON.stringify(tree)).not.toContain("\\u001b")
})

const renderers: Array<{ destroy(): void }> = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

test("real terminal component updates from pending to completed then batch error", async () => {
  const [state, setState] = createSignal<InspectBatchViewInput>({ input, status: "pending" })
  const app = await testRender(() => withProviders(() => <InspectBatchTree {...state()} color="#ffffff" muted="#888888" />), {
    width: 120,
    height: 14,
  })
  renderers.push(app.renderer)
  await settled(app)
  const pendingFrame = app.captureCharFrame()
  expect(pendingFrame).toContain("inspect_batch")
  expect(pendingFrame).toContain("Read src/main.ts")
  const pendingRow = pendingFrame.split("\n").find((line) => line.includes("Read src/main.ts"))!
  expect(pendingRow).toMatch(/•\s+\S/)
  expect(pendingRow).not.toContain("•  Read")
  expect(pendingFrame).not.toContain("├─")
  expect(pendingFrame).not.toContain("└─")
  setState({ input, status: "completed", output })
  await settled(app)
  const frame = app.captureCharFrame()
  expect(frame).toContain("· truncated")
  expect(frame).toContain('Glob "**/*.ts"')
  expect(frame).not.toContain("after")
  expect(frame).not.toContain("File missing")
  const rows = frame.split("\n").filter((line) => line.includes("• "))
  expect(rows).toHaveLength(3)
  // The state glyph now leads the argument, so its column comes first.
  expect(rows[0].indexOf("✓")).toBeLessThan(rows[0].indexOf("Read src/main.ts"))
  expect(rows[1].indexOf("✗")).toBeLessThan(rows[1].indexOf('Grep "export" in src'))
  expect(rows[2].indexOf("−")).toBeLessThan(rows[2].indexOf('Glob "**/*.ts"'))
  expect(frame).not.toContain("RAW")
  setState({ input, status: "error", error: "Denied" })
  await settled(app)
  const errorFrame = app.captureCharFrame()
  expect(errorFrame).toContain("Batch failed")
  expect(errorFrame).not.toContain("Denied")
})

test("real narrow terminal keeps long child rows from wrapping into unbounded output", async () => {
  const app = await testRender(
    () =>
      withProviders(() => (
        <InspectBatchTree
          input={{
            actions: Array.from({ length: 16 }, (_, id) => ({
              id: String(id),
              type: "read",
              filePath: "界📂/".repeat(100),
            })),
          }}
          status="completed"
          output={JSON.stringify({
            results: Array.from({ length: 16 }, (_, id) => ({ id: String(id), type: "read", status: "success" })),
          })}
          color="#ffffff"
          muted="#888888"
        />
      )),
    { width: 40, height: 40 },
  )
  renderers.push(app.renderer)
  await settled(app)
  const frame = app.captureCharFrame()
  expect(frame).toContain("Read ")
  expect(frame.split("\n").filter((line) => line.trim()).length).toBe(17)
  const rows = frame.split("\n").filter((line) => line.includes("• "))
  expect(rows).toHaveLength(16)
  expect(rows.every((line) => line.includes("✓"))).toBe(true)
})

test("six successful actions need only a heading and six rows", async () => {
  const actions = ["dataSP", "download", "Data", "sys.ini", "SiderAddons", "Data/dt4*.cpk"].map((target, index) => ({
    id: `hidden_id_${index}`,
    type: index === 5 ? "glob" : "read",
    filePath: `D:\\Games\\SP Football Life 2026\\${target}`,
    pattern: target,
    path: "D:\\Games\\SP Football Life 2026",
    dependsOn: [],
  }))
  const app = await testRender(
    () =>
      withProviders(() => (
        <InspectBatchTree
          input={{ actions }}
          status="completed"
          output={JSON.stringify({ results: actions.map(({ id, type }) => ({ id, type, status: "success" })) })}
          color="#ffffff"
          muted="#888888"
          success="#00ff00"
        />
      )),
    { width: 90, height: 12 },
  )
  renderers.push(app.renderer)
  await settled(app)
  const frame = app.captureCharFrame()
  expect(frame).not.toContain("hidden_id")
  expect(frame).not.toContain("dependencies")
  expect(frame).not.toContain("[success]")
  expect(frame).not.toContain("├─")
  expect(frame).not.toContain("└─")
  expect(frame.split("\n").filter((line) => line.trim())).toHaveLength(7)
  expect(frame.split("\n").filter((line) => line.includes("• ✓"))).toHaveLength(6)
})
