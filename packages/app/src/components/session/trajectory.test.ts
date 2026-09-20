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
import { buildTrajectory } from "./trajectory"

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

// Guard against silent regressions in the message/part contract this module relies on.
const _contract: Message[] = [user({}), assistant({})]
void _contract
