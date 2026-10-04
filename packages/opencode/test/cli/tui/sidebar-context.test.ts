import { expect, test } from "bun:test"
import type { AssistantMessage, Message, Part, StepFinishPart } from "@opencode-ai/sdk/v2"
import {
  contextMetrics,
  lastCompletedAssistant,
  costTree,
  loadedUsage,
  loadCostSnapshot,
  updateCostRows,
} from "@/cli/cmd/tui/feature-plugins/sidebar/context-metrics"

export function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: "assistant",
    sessionID: "session",
    role: "assistant",
    parentID: "user",
    modelID: "model",
    providerID: "provider",
    mode: "build",
    agent: "build",
    path: { cwd: ".", root: "." },
    time: { created: 1, completed: 2 },
    finish: "stop",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  }
}

export function step(overrides: Partial<StepFinishPart> = {}): StepFinishPart {
  return {
    id: "step",
    sessionID: "session",
    messageID: "assistant",
    type: "step-finish",
    reason: "stop",
    cost: 0,
    tokens: assistant().tokens,
    ...overrides,
  }
}

test("zero output and zero cost are completed usage, not missing data", () => {
  const message = assistant()
  expect(lastCompletedAssistant([message], 10)).toBe(message)
  expect(contextMetrics(message, 100, 0, [step()])).toEqual({
    tokens: 0,
    percent: 0,
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    callCost: 0,
    sessionCost: 0,
  })
})

test("reasoning-only and cache-only completions qualify", () => {
  for (const tokens of [
    { input: 10, output: 0, reasoning: 20, cache: { read: 30, write: 40 } },
    { input: 0, output: 0, reasoning: 0, cache: { read: 100, write: 0 } },
  ]) {
    const message = assistant({ tokens })
    expect(lastCompletedAssistant([assistant(), message], 10)).toBe(message)
    expect(contextMetrics(message, 200, 3).tokens).toBe(100)
    expect(contextMetrics(message, 200, 3).percent).toBe(50)
  }
})

test("partial streams, cleanup errors, absent finish and future timestamps cannot replace completed usage", () => {
  const previous = assistant({ id: "previous", cost: 0.25 })
  const candidates = [
    assistant({
      time: { created: 3 },
      cost: 12,
      tokens: { input: 50, output: 80, reasoning: 1, cache: { read: 0, write: 0 } },
    }),
    assistant({ error: { name: "MessageAbortedError", data: { message: "aborted" } } }),
    assistant({ error: { name: "UnknownError", data: { message: "failed" } } }),
    assistant({ finish: undefined }),
    assistant({ finish: "error" }),
    assistant({ time: { created: 3, completed: 20 } }),
    assistant({ time: { created: 5, completed: 4 } }),
  ]
  for (const candidate of candidates) {
    expect(lastCompletedAssistant([previous, candidate], 10)).toBe(previous)
    expect(lastCompletedAssistant([candidate], 10)).toBeUndefined()
  }
})

test("user messages are ignored and latest completed tool call wins without requiring text", () => {
  const latest = assistant({ id: "latest", finish: "tool-calls" })
  const user: Message = {
    id: "user",
    sessionID: "session",
    role: "user",
    time: { created: 3 },
    agent: "build",
    model: { providerID: "provider", modelID: "model" },
  }
  expect(lastCompletedAssistant([assistant(), latest, user], 10)).toBe(latest)
})

test("latest step in part order supplies both cost and tokens, never accumulated assistant cost", () => {
  const message = assistant({
    cost: 0.375,
    tokens: { input: 999, output: 20, reasoning: 10, cache: { read: 0, write: 0 } },
  })
  const parts: Part[] = [
    step({ id: "z-first", cost: 0.25 }),
    step({
      id: "a-last",
      cost: 0.125,
      tokens: { input: 100, output: 20, reasoning: 10, cache: { read: 60, write: 10 } },
    }),
    { id: "text", messageID: message.id, sessionID: message.sessionID, type: "text", text: "done" },
    step({ messageID: "current-partial", cost: 8 }),
    step({ sessionID: "other-session", cost: 9 }),
  ]
  expect(contextMetrics(message, 1000, 4.5, parts)).toEqual({
    tokens: 200,
    percent: 20,
    input: 100,
    cacheRead: 60,
    cacheWrite: 10,
    callCost: 0.125,
    sessionCost: 4.5,
  })
})

test("no step means unavailable call cost and stored token fallback, never an older message's step", () => {
  const message = assistant({ cost: 7, tokens: { input: 42, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
  const text: Part = { id: "text", messageID: message.id, sessionID: message.sessionID, type: "text", text: "done" }
  for (const parts of [undefined, [], [text], [step({ messageID: "older" })]]) {
    expect(contextMetrics(message, 100, 9, parts).callCost).toBeUndefined()
    expect(contextMetrics(message, 100, 9, parts).tokens).toBe(42)
  }
  expect(contextMetrics(undefined, 100, 9, [step()]).callCost).toBeUndefined()
})

test("missing usage and unknown model limits are not presented as zero", () => {
  expect(contextMetrics(undefined, 100, undefined).tokens).toBeUndefined()
  expect(contextMetrics(undefined, 100, undefined).callCost).toBeUndefined()
  expect(contextMetrics(undefined, 100, undefined).sessionCost).toBeUndefined()
  for (const limit of [undefined, 0, -1]) expect(contextMetrics(assistant(), limit, 9).percent).toBeUndefined()
  expect(
    contextMetrics(assistant({ tokens: { input: 150, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }), 100, 9)
      .percent,
  ).toBe(150)
})

test("bounded session event updates include new children and remove deleted ones", () => {
  const initial = [{ id: "child", parentID: "parent", cost: 1 }]
  const updated = updateCostRows(initial, { id: "child", parentID: "parent", cost: 2 })
  const added = updateCostRows(updated, { id: "grandchild", parentID: "child", cost: 3 })
  expect(costTree("parent", added, 4).combined).toBe(9)
  expect(costTree("parent", updateCostRows(added, added[1], true), 4).combined).toBe(6)
  expect(
    updateCostRows(
      Array.from({ length: 250 }, (_, n) => ({ id: String(n) })),
      { id: "latest" },
    ),
  ).toHaveLength(200)
})

test("parent + child = 8.627665; grandchildren, cycles and duplicate rows count once", () => {
  const rows = [
    { id: "parent", parentID: "grandchild", cost: 4.637405 },
    { id: "child", parentID: "parent", cost: 3.99026 },
    { id: "child", parentID: "parent", cost: 3.99026 },
    { id: "unrelated", cost: 100 },
  ]
  expect(costTree("parent", rows, 4.637405)).toMatchObject({
    count: 1,
    cost: 3.99026,
    combined: 8.627665,
    duplicates: 1,
  })
  expect(costTree("parent", [...rows, { id: "grandchild", parentID: "child", cost: 2 }], 4.637405)).toMatchObject({
    count: 2,
    cost: 5.99026,
    combined: 10.627665,
  })
})

test("unknown descendant and parent costs are not zero; zero is valid", () => {
  expect(costTree("p", [], 5).combined).toBeUndefined()
  expect(costTree("p", [{ id: "c", parentID: "p" }], 5)).toMatchObject({
    missing: 1,
    cost: undefined,
    combined: undefined,
  })
  expect(costTree("p", [{ id: "c", parentID: "p", cost: 0 }], 0)).toMatchObject({ cost: 0, combined: 0 })
  expect(costTree("p", [{ id: "c", parentID: "p", cost: 2 }]).combined).toBeUndefined()
  for (const cost of [NaN, Infinity, -1]) {
    expect(costTree("p", [{ id: "c", parentID: "p", cost }], 0).cost).toBeUndefined()
    expect(contextMetrics(assistant(), 100, cost, [step({ cost })]).callCost).toBeUndefined()
  }
})

test("loaded history sums every step, deduplicates rows, and distinguishes 55k footprint from 749k processed", () => {
  const message = assistant({ cost: 900 })
  const first = step({
    id: "first",
    tokens: { input: 94000, output: 0, reasoning: 0, cache: { read: 600000, write: 0 } },
  })
  const last = step({
    id: "last",
    cost: 0.5,
    tokens: { input: 55000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const history = loadedUsage("session", [message, message, assistant({ id: "missing" })], (id) =>
    id === "assistant" ? [first, first, last, step({ messageID: "alien" })] : [],
  )
  expect(history).toMatchObject({
    calls: 2,
    duplicates: 2,
    missing: 1,
    processed: 749000,
    readRatio: 0,
    previousReadRatio: 86,
  })
  expect(contextMetrics(message, 100000, 9, [history.last!.step]).tokens).toBe(55000)
})

test("recorded steps survive errors and streaming; no records means unknown, not zero", () => {
  const message = assistant({
    error: { name: "UnknownError", data: { message: "failed after usage" } },
    time: { created: 1 },
  })
  expect(loadedUsage("session", [message], () => [step()])).toMatchObject({
    calls: 1,
    processed: 0,
    readRatio: undefined,
  })
  expect(loadedUsage("session", [message], () => [])).toMatchObject({ calls: 0, processed: undefined, missing: 1 })
})

test("bounded snapshots preserve explicit errors and never invent empty totals", async () => {
  expect(await loadCostSnapshot(async () => ({ error: "failed" }))).toEqual({ sessions: [], status: "error" })
  expect(await loadCostSnapshot(() => Promise.reject(new Error("offline")))).toEqual({ sessions: [], status: "error" })
  expect(
    (await loadCostSnapshot(async () => ({ data: Array.from({ length: 201 }, (_, id) => ({ id: String(id) })) })))
      .sessions,
  ).toHaveLength(200)
})
