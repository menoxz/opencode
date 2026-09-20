import { describe, expect, test } from "bun:test"
import type {
  AssistantMessage,
  FilePart,
  Message,
  Part,
  StepStartPart,
  TextPart,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2/client"
import { buildTrajectory, formatOffset, kindCounts, matchRecords, timelineLayout, timelineTicks, turnWindows } from "./trajectory"

const user = (over: Partial<UserMessage>): UserMessage => ({
  id: "u1",
  sessionID: "s1",
  role: "user",
  time: { created: 1000 },
  agent: "build",
  model: { providerID: "deepseek", modelID: "v4" },
  ...over,
})

const assistant = (over: Partial<AssistantMessage>): AssistantMessage => ({
  id: "a1",
  sessionID: "s1",
  role: "assistant",
  time: { created: 1100, completed: 2000 },
  parentID: "u1",
  modelID: "v4",
  providerID: "deepseek",
  mode: "build",
  agent: "build",
  path: { cwd: "/w", root: "/w" },
  cost: 0.01,
  tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
  ...over,
})

const text = (id: string, messageID: string, value: string): TextPart => ({
  id,
  sessionID: "s1",
  messageID,
  type: "text",
  text: value,
})

const stepStart = (id: string, messageID: string): StepStartPart => ({
  id,
  sessionID: "s1",
  messageID,
  type: "step-start",
})

const file = (id: string, messageID: string): FilePart => ({
  id,
  sessionID: "s1",
  messageID,
  type: "file",
  mime: "image/png",
  filename: "pasted.png",
  url: "file:///pasted.png",
})

const tool = (over: Partial<ToolPart> & Pick<ToolPart, "tool" | "id">): ToolPart => ({
  sessionID: "s1",
  messageID: "a1",
  type: "tool",
  callID: `call-${over.id}`,
  state: { status: "completed", input: {}, output: "ok", title: "t", metadata: {}, time: { start: 1000, end: 1200 } },
  ...over,
})

describe("buildTrajectory", () => {
  test("maps roles and parts to ASSISTANT / TOOL / CONTEXT records with lanes", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut", "u1", "hello")],
      a1: [
        stepStart("ss", "a1"),
        text("at", "a1", "I will read two things."),
        tool({ id: "t-read", tool: "read" }),
        tool({ id: "t-file", tool: "bash" }),
        file("f1", "a1"),
      ],
    }
    const model = buildTrajectory({
      messages: [user({}), assistant({})],
      parts: (id) => parts[id] ?? [],
      childOf: () => undefined,
    })

    expect(model.records.map((record) => record.kind)).toEqual(["user", "assistant", "tool", "tool", "context"])
    expect(model.records.find((record) => record.kind === "assistant")?.details).toBeUndefined()
    expect(model.records.find((record) => record.kind === "context")?.label).toBe("file")
    expect(model.spans.map((span) => span.lane)).toEqual(["input", "model", "tools", "tools", "input"])
    expect(model.stats.calls).toBe(2)
    expect(model.stats.turns).toBe(1)
    expect(model.bounds.start).toBe(1000)
  })

  test("marks an assistant step with no text as a tool-call-only block", () => {
    const parts: Record<string, Part[]> = { u1: [], a1: [stepStart("ss", "a1"), tool({ id: "t1", tool: "glob" })] }
    const model = buildTrajectory({ messages: [user({}), assistant({})], parts: (id) => parts[id] ?? [], childOf: () => undefined })
    expect(model.records.find((record) => record.kind === "assistant")?.details).toBe("(tool call only)")
  })

  test("surfaces a tool error and counts it", () => {
    const parts: Record<string, Part[]> = {
      u1: [],
      a1: [
        stepStart("ss", "a1"),
        tool({
          id: "t1",
          tool: "glob",
          state: {
            status: "error",
            input: { pattern: "**/*" },
            error: "rg: accès refusé",
            time: { start: 1100, end: 1300 },
          },
        }),
      ],
    }
    const model = buildTrajectory({ messages: [user({}), assistant({})], parts: (id) => parts[id] ?? [], childOf: () => undefined })
    const record = model.records.find((item) => item.kind === "tool")
    expect(record?.status).toBe("error")
    expect(record?.error).toBe("rg: accès refusé")
    expect(record?.args).toBe('{"pattern":"**/*"}')
    expect(model.stats.errors).toBe(1)
    expect(model.spans.find((span) => span.kind === "tool")?.error).toBe(true)
  })

  test("nests a task child session's tool calls as SUBTOOL records", () => {
    const childParts: Part[] = [
      stepStart("cs", "cm1"),
      tool({
        id: "c1",
        tool: "read",
        messageID: "cm1",
        sessionID: "child1",
        state: { status: "error", input: { filePath: "a.png" }, error: "boom", time: { start: 1200, end: 1250 } },
      }),
    ]
    const parts: Record<string, Part[]> = {
      u1: [],
      a1: [
        stepStart("ss", "a1"),
        tool({ id: "t1", tool: "task", metadata: { sessionId: "child1" }, state: { status: "completed", input: {}, output: '<task id="child1">', title: "task", metadata: { sessionId: "child1" }, time: { start: 1200, end: 1400 } } }),
      ],
      cm1: childParts,
    }
    const model = buildTrajectory({
      messages: [user({}), assistant({})],
      parts: (id) => parts[id] ?? [],
      childOf: (id) => (id === "child1" ? { sessionID: "child1", messages: [assistant({ id: "cm1", sessionID: "child1", parentID: "t1" })], parts: (mid) => (mid === "cm1" ? childParts : []) } : undefined),
    })

    const subtool = model.records.find((record) => record.kind === "subtool")
    expect(subtool?.label).toBe("read")
    expect(subtool?.status).toBe("error")
    expect(subtool?.error).toBe("boom")
    expect(model.records.find((record) => record.kind === "tool")?.childSessionID).toBe("child1")
    expect(model.childSessions).toEqual(["child1"])
    expect(model.stats.calls).toBe(2)
    expect(model.stats.errors).toBe(1)
  })

  test("merges a user message's text parts into a single USER record", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut1", "u1", "first"), text("ut2", "u1", "second"), file("f1", "u1")],
      a1: [],
    }
    const model = buildTrajectory({
      messages: [user({}), assistant({ id: "a1" })],
      parts: (id) => parts[id] ?? [],
      childOf: () => undefined,
    })
    expect(model.records.map((record) => record.kind)).toEqual(["user", "context"])
    expect(model.records[0]?.args).toBe("first\nsecond")
    expect(model.records[1]?.details).toBe("pasted.png")
  })

  test("returns an empty model for no messages", () => {
    const model = buildTrajectory({ messages: [], parts: () => [], childOf: () => undefined })
    expect(model.records).toEqual([])
    expect(model.stats.turns).toBe(0)
  })
})

describe("trajectory view helpers", () => {
  const build = (messages: Message[], parts: Record<string, Part[]>) =>
    buildTrajectory({ messages, parts: (id) => parts[id] ?? [], childOf: () => undefined })

  test("turnWindows derives per-turn windows, calls and errors", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut", "u1", "first")],
      a1: [stepStart("ss1", "a1"), tool({ id: "t1", tool: "read" }), tool({ id: "t2", tool: "bash" })],
      u2: [text("ut2", "u2", "second")],
      a2: [
        stepStart("ss2", "a2"),
        tool({
          id: "t3",
          tool: "glob",
          state: { status: "error", input: {}, error: "boom", time: { start: 3100, end: 3200 } },
        }),
      ],
    }
    const model = build(
      [
        user({}),
        assistant({}),
        user({ id: "u2", time: { created: 3000 } }),
        assistant({ id: "a2", parentID: "u2", time: { created: 3100, completed: 4000 } }),
      ],
      parts,
    )

    const windows = turnWindows(model)
    expect(windows.map((window) => window.turn)).toEqual([1, 2])
    expect(windows[0]?.start).toBe(1000)
    expect(windows[0]?.end).toBe(3000)
    expect(windows[0]?.duration).toBe(2000)
    expect(windows[0]?.calls).toBe(2)
    expect(windows[0]?.errors).toBe(0)
    expect(windows[1]?.calls).toBe(1)
    expect(windows[1]?.errors).toBe(1)
  })

  test("timelineTicks and timelineLayout stay aligned in every mode", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut", "u1", "hello")],
      a1: [stepStart("ss", "a1"), tool({ id: "t1", tool: "read" }), tool({ id: "t2", tool: "bash" })],
    }
    const model = build([user({}), assistant({})], parts)

    expect(timelineTicks(model, "duration").map((tick) => tick.ratio)).toEqual([0, 25, 50, 75, 100])
    expect(timelineTicks(model, "turns").map((tick) => tick.label)).toEqual(["T1"])
    expect(timelineTicks(model, "calls").map((tick) => tick.label)).toEqual(["#1", "#2"])

    expect(timelineLayout(model, "calls").map((item) => item.left)).toEqual([0, 50])

    const duration = timelineLayout(model, "duration")
    expect(duration.every((item) => item.left >= 0 && item.left + item.width <= 100.01)).toBe(true)
    const read = duration.find((item) => item.span.label === "read")
    expect(read?.left).toBe(0)
    expect(read?.width).toBe(20)
  })

  test("matchRecords searches labels, args, results and errors, case-insensitively", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut", "u1", "Investigate the layout")],
      a1: [
        stepStart("ss", "a1"),
        tool({
          id: "t1",
          tool: "read",
          state: {
            status: "completed",
            input: { filePath: "src/app.tsx" },
            output: "export const app = 1",
            title: "read src/app.tsx",
            metadata: {},
            time: { start: 1000, end: 1200 },
          },
        }),
        tool({
          id: "t2",
          tool: "bash",
          state: { status: "error", input: { command: "bun test" }, error: "EXIT 7", time: { start: 1300, end: 1400 } },
        }),
      ],
    }
    const model = build([user({}), assistant({})], parts)

    expect(matchRecords(model.records, "layout")).toEqual([0])
    expect(matchRecords(model.records, "APP.TSX")).toEqual([2])
    expect(matchRecords(model.records, "exit 7")).toEqual([3])
    expect(matchRecords(model.records, "   ")).toEqual([])
    expect(matchRecords(model.records, "nothing-here")).toEqual([])
  })

  test("kindCounts lists only the kinds present, in canonical order", () => {
    const parts: Record<string, Part[]> = {
      u1: [text("ut", "u1", "hi")],
      a1: [stepStart("ss", "a1"), tool({ id: "t1", tool: "read" }), file("f1", "a1")],
    }
    const model = build([user({}), assistant({})], parts)

    expect(kindCounts(model.records)).toEqual([
      { kind: "user", count: 1 },
      { kind: "context", count: 1 },
      { kind: "assistant", count: 1 },
      { kind: "tool", count: 1 },
    ])
    expect(formatOffset(0)).toBe("0s")
    expect(formatOffset(1200)).toBe("1s")
    expect(formatOffset(65_000)).toBe("1m05s")
  })
})

// Guard against silent regressions in the message/part contract this module relies on.
const _contract: Message[] = [user({}), assistant({})]
void _contract
