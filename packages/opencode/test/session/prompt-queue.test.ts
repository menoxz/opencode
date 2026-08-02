import { describe, expect, test } from "bun:test"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { MessageV2 } from "../../src/session/message-v2"
import { PromptQueue } from "../../src/session/prompt-queue"

const SID = "ses-queue-test" as unknown as SessionID

function user(id: string, parts: MessageV2.Part[] = []): MessageV2.WithParts {
  return {
    info: {
      id: MessageID.ascending(id),
      role: "user",
      sessionID: SID,
      time: { created: 1 },
      agent: "build",
      model: { providerID: "test" as MessageV2.User["model"]["providerID"], modelID: "test-model" as MessageV2.User["model"]["modelID"] },
    },
    parts,
  }
}

function assistant(id: string, parent: string, opts?: { finish?: string; error?: unknown }): MessageV2.WithParts {
  return {
    info: {
      id: MessageID.ascending(id),
      role: "assistant",
      parentID: MessageID.ascending(parent),
      sessionID: SID,
      mode: "build",
      agent: "build",
      cost: 0,
      path: { cwd: "/", root: "/" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: "test-model" as MessageV2.Assistant["modelID"],
      providerID: "test" as MessageV2.Assistant["providerID"],
      time: { created: 2 },
      ...(opts?.finish !== undefined ? { finish: opts.finish } : {}),
      ...(opts?.error !== undefined ? { error: opts.error } : {}),
    },
    parts: [],
  }
}

const text = (metadata?: { compaction_continue?: boolean }): MessageV2.Part =>
  ({ id: PartID.ascending("prt-t"), type: "text", text: "x", metadata }) as unknown as MessageV2.Part

const compaction = (): MessageV2.Part =>
  ({ id: PartID.ascending("prt-c"), type: "compaction", auto: true }) as unknown as MessageV2.Part

describe("turnClosed", () => {
  test("user with finished assistant is closed", () => {
    const msgs = [user("msg0001"), assistant("msg0101", "msg0001", { finish: "stop" })]
    expect(PromptQueue.turnClosed(msgs, MessageID.ascending("msg0001"))).toBe(true)
  })

  test("user with errored assistant is closed", () => {
    const msgs = [user("msg0001"), assistant("msg0101", "msg0001", { error: { _tag: "Error" } })]
    expect(PromptQueue.turnClosed(msgs, MessageID.ascending("msg0001"))).toBe(true)
  })

  test("user with in-flight assistant (no finish, no error) is not closed", () => {
    const msgs = [user("msg0001"), assistant("msg0101", "msg0001")]
    expect(PromptQueue.turnClosed(msgs, MessageID.ascending("msg0001"))).toBe(false)
  })

  test("user without any assistant is not closed", () => {
    expect(PromptQueue.turnClosed([user("msg0001")], MessageID.ascending("msg0001"))).toBe(false)
  })
})

describe("pendingUserID", () => {
  test("returns undefined when every turn is closed", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002"),
      assistant("msg0102", "msg0002", { finish: "stop" }),
    ]
    expect(PromptQueue.pendingUserID(msgs)).toBeUndefined()
  })

  test("returns the oldest pending user (FIFO over multiple queued prompts)", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002"),
      user("msg0003"),
    ]
    expect(PromptQueue.pendingUserID(msgs)).toBe(MessageID.ascending("msg0002"))
  })

  test("ignores run-internal compaction users", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002", [compaction()]),
      user("msg0003"),
    ]
    expect(PromptQueue.pendingUserID(msgs)).toBe(MessageID.ascending("msg0003"))
  })

  test("skips interrupted turns (errored assistant)", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { error: { _tag: "Error" } }),
      user("msg0002"),
    ]
    expect(PromptQueue.pendingUserID(msgs)).toBe(MessageID.ascending("msg0002"))
  })
})

describe("boundToRun", () => {
  test("drops a queued user message newer than the anchor", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002"),
      assistant("msg0102", "msg0002", { finish: "stop" }),
      user("msg0003"),
    ]
    const view = PromptQueue.boundToRun(msgs, MessageID.ascending("msg0002"))
    const ids = view.map((m) => m.info.id)
    expect(ids).not.toContain("msg0003")
    expect(ids).toContain("msg0001")
    expect(ids).toContain("msg0101")
    expect(ids).toContain("msg0002")
    expect(ids).toContain("msg0102")
  })

  test("keeps run-internal compaction users newer than the anchor", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002"),
      user("msg0003", [compaction()]),
      assistant("msg0103", "msg0003", { finish: "stop" }),
    ]
    const view = PromptQueue.boundToRun(msgs, MessageID.ascending("msg0002"))
    const ids = view.map((m) => m.info.id)
    expect(ids).toContain("msg0003")
    expect(ids).toContain("msg0103")
  })

  test("keeps auto-continue internal users newer than the anchor", () => {
    const msgs = [
      user("msg0001"),
      user("msg0002", [text({ compaction_continue: true })]),
      assistant("msg0102", "msg0002", { finish: "stop" }),
    ]
    const view = PromptQueue.boundToRun(msgs, MessageID.ascending("msg0001"))
    const ids = view.map((m) => m.info.id)
    expect(ids).toContain("msg0002")
    expect(ids).toContain("msg0102")
  })

  test("drops a queued user's assistant when the user is newer than the anchor", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0101", "msg0001", { finish: "stop" }),
      user("msg0002"),
      assistant("msg0102", "msg0002", { finish: "stop" }),
    ]
    const view = PromptQueue.boundToRun(msgs, MessageID.ascending("msg0001"))
    const ids = view.map((m) => m.info.id)
    expect(ids).toEqual(["msg0001", "msg0101"])
  })
})
