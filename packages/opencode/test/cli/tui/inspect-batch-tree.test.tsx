/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
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

test("pending and running preserve targets without inventing child execution", () => {
  const pending = inspectBatchTree({ input: JSON.stringify(input), status: "pending" })
  expect(pending.rows[0].label).toBe("├─ read src/main.ts [offset=10, limit=20]")
  expect(pending.rows[0].detail).toBe("")
  expect(pending.rows[0].icon).toBe("…")
  const running = inspectBatchTree({ input, status: "running" })
  expect(running.rows[1].label).toContain('├─ grep "export" @ src [include=*.ts] · after read #1')
  expect(running.rows[1].icon).toBe("…")
  expect(running.rows[2].label).toContain("after read #1, grep #2")
  expect(JSON.stringify(running)).not.toContain("parallel")
})

test("read parameters and dependencies share exactly one rendered line", async () => {
  const actions = [
    { id: "lookup", type: "grep", pattern: "export", path: "src" },
    { id: "file", type: "read", filePath: "src/main.ts", offset: "10", limit: 20, dependsOn: ["lookup"] },
  ]
  const app = await testRender(
    () => (
      <InspectBatchTree
        input={{ actions }}
        status="completed"
        output={JSON.stringify({ results: actions.map(({ id, type }) => ({ id, type, status: "success" })) })}
        color="#ffffff"
        muted="#888888"
      />
    ),
    { width: 100, height: 8 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const lines = app
    .captureCharFrame()
    .split("\n")
    .filter((line) => line.trim())
  expect(lines).toHaveLength(3)
  expect(lines[2]).toContain("└─ read src/main.ts [offset=10, limit=20] · after grep #1")
  expect(lines[2].trimEnd()).toEndWith("✓")
  // The status icon must sit right after the argument rather than float in a
  // far-right column across the whole width, so the gap stays a single space.
  const row = lines.find((line) => line.includes("· after grep #1"))!
  expect(row).toContain("· after grep #1 ✓")
  expect(/· after grep #1 {2,}✓/.test(row)).toBe(false)
})

test("results join by id and type, retain errors, skipped and truncation without raw dumps", () => {
  const tree = inspectBatchTree({ input, output, status: "completed" })
  expect(tree.title).toBe("inspect_batch · 3 actions")
  expect(tree.rows[0].label).toContain("· truncated")
  expect(tree.rows.map((row) => row.icon)).toEqual(["✓", "✗", "−"])
  expect(tree.rows[1].detail).toBe("File missing")
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
  expect(tree.note).toBe("Batch failed: Denied unsafe")
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

test("large actions, fields, dependencies and output are bounded and sanitized", () => {
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
  expect(tree.rows[15].label).toStartWith("└─")
  expect(tree.rows[0].label).toContain("important.ts")
  expect(tree.rows[0].label).toContain("(+46)")
  expect(tree.rows.every((row) => row.label.length < 180 && row.detail.length < 130)).toBe(true)
  expect(JSON.stringify(tree)).not.toContain("\\u001b")
})

const renderers: Array<{ destroy(): void }> = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

test("real terminal component updates from pending to completed then batch error", async () => {
  const [state, setState] = createSignal<InspectBatchViewInput>({ input, status: "pending" })
  const app = await testRender(() => <InspectBatchTree {...state()} color="#ffffff" muted="#888888" />, {
    width: 120,
    height: 14,
  })
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("├─ read src/main.ts")
  expect(app.captureCharFrame()).not.toContain("no dependencies")
  setState({ input, status: "completed", output })
  await app.renderOnce()
  const frame = app.captureCharFrame()
  expect(frame).toContain("· truncated")
  expect(frame).toContain("after read #1, grep #2")
  expect(frame).toContain('└─ glob "**/*.ts" @ .')
  expect(frame).toContain("File missing")
  const rows = frame.split("\n").filter((line) => /[├└]─/.test(line))
  expect(rows.map((line) => line.trimEnd().slice(-1))).toEqual(["✓", "✗", "−"])
  expect(frame).not.toContain("RAW")
  setState({ input, status: "error", error: "Denied" })
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Batch failed: Denied")
})

test("real narrow terminal keeps long child rows from wrapping into unbounded output", async () => {
  const app = await testRender(
    () => (
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
    ),
    { width: 40, height: 40 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const frame = app.captureCharFrame()
  expect(frame).toContain("└─ read")
  expect(frame.split("\n").filter((line) => line.trim()).length).toBe(17)
  const rows = frame.split("\n").filter((line) => /[├└]─/.test(line))
  expect(rows).toHaveLength(16)
  expect(rows.every((line) => line.trimEnd().endsWith("✓"))).toBe(true)
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
    () => (
      <InspectBatchTree
        input={{ actions }}
        status="completed"
        output={JSON.stringify({ results: actions.map(({ id, type }) => ({ id, type, status: "success" })) })}
        color="#ffffff"
        muted="#888888"
        success="#00ff00"
      />
    ),
    { width: 90, height: 12 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const frame = app.captureCharFrame()
  expect(frame).not.toContain("hidden_id")
  expect(frame).not.toContain("dependencies")
  expect(frame).not.toContain("[success]")
  expect(frame.split("\n").filter((line) => line.trim())).toHaveLength(7)
  expect(frame.split("\n").filter((line) => line.trimEnd().endsWith("✓"))).toHaveLength(6)
})
