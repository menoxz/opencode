import { describe, expect, test } from "bun:test"
import { JevCompaction } from "@/jev/compaction"
import type { JevSchema } from "@/jev/schema"
import type { MessageV2 } from "@/session/message-v2"
import { MAX_PRUNABLE_PAIRS, PRUNED_MARKER, heaviestPairs, pruneEvents, rewriteRefuted } from "@/session/compaction"

const tool = (label: string): MessageV2.ToolPart =>
  ({
    id: `prt_${label}`,
    sessionID: "ses_prune",
    messageID: "msg_prune",
    type: "tool",
    callID: `call_${label}`,
    tool: "bash",
    state: {
      status: "completed",
      input: { command: `run ${label}` },
      output: `result of ${label}`,
      title: label,
      metadata: {},
      time: { start: 0, end: 1 },
    },
  }) as unknown as MessageV2.ToolPart

const assistant = (parts: readonly MessageV2.Part[], id = "msg_a1"): MessageV2.WithParts =>
  ({ info: { id, role: "assistant" }, parts: [...parts] }) as unknown as MessageV2.WithParts

/** A head holding one assistant turn whose tool calls are named `labels`. */
const head = (labels: readonly string[]) => {
  const messages = [assistant(labels.map(tool))]
  return { messages, pairs: JevCompaction.pairTurns(pruneEvents(messages)) }
}

const pair = (callId: string, resultSize: number): JevCompaction.ToolPair => ({
  batch: "b1",
  callId,
  tool: "bash",
  call: "bash",
  result: "r".repeat(resultSize),
})

const noul = (value: number): JevSchema.Answer => ({ type: "noul", noul: value })

describe("pruneEvents", () => {
  test("reads assistant tool calls in order, with their batch and verbatim result", () => {
    const events = pruneEvents([assistant([tool("alpha"), tool("beta")])])
    expect(events.map((event) => event.callId)).toEqual(["call_alpha", "call_beta"])
    expect(events[0].batch).toBe("msg_a1")
    expect(events[0].tool).toBe("bash")
    expect(events[0].call).toContain("alpha")
    expect(events[0].result).toBe("result of alpha")
  })

  test("ignores parts that are not assistant tool calls", () => {
    const user = { info: { id: "msg_u1", role: "user" }, parts: [tool("gamma")] } as unknown as MessageV2.WithParts
    const text = { id: "prt_text", type: "text", text: "hello" } as unknown as MessageV2.Part
    expect(pruneEvents([user, assistant([text, tool("delta")])]).map((event) => event.callId)).toEqual(["call_delta"])
  })

  test("leaves a call that never completed without a result", () => {
    const running = {
      ...tool("epsilon"),
      state: { status: "running", input: {}, time: { start: 0 } },
    } as unknown as MessageV2.ToolPart
    expect(pruneEvents([assistant([running])])[0].result).toBeUndefined()
  })

  test("bounds the call rendering it sends to Jev", () => {
    expect(pruneEvents([assistant([tool("z".repeat(5_000))])])[0].call.length).toBeLessThanOrEqual(500)
  })
})

describe("heaviestPairs", () => {
  test("spends the question budget on the heaviest pairs, in transcript order", () => {
    const pairs = [
      pair("a", 1),
      pair("b", 500),
      pair("c", 2),
      pair("d", 400),
      pair("e", 3),
      pair("f", 300),
      pair("g", 4),
      pair("h", 200),
    ]
    expect(heaviestPairs(pairs).map((entry) => entry.callId)).toEqual(["b", "d", "e", "f", "g", "h"])
  })

  test("keeps every pair when the head fits the budget", () => {
    expect(heaviestPairs([pair("a", 1), pair("b", 2)]).map((entry) => entry.callId)).toEqual(["a", "b"])
  })

  test("never exceeds the question budget", () => {
    const many = Array.from({ length: 40 }, (_, index) => pair(`p${index}`, index + 1))
    expect(heaviestPairs(many)).toHaveLength(MAX_PRUNABLE_PAIRS)
  })
})

describe("rewriteRefuted", () => {
  test("drops a fully refuted call and blanks a refuted result, leaving the rest byte-for-byte", () => {
    const { messages, pairs } = head(["keep", "noResult", "both", "never"])
    const originals = [...(messages[0].parts as MessageV2.ToolPart[])]
    const asked = [pairs[0], pairs[1], pairs[2]]
    const kept = [pairs[0], { ...pairs[1], result: undefined }, pairs[3]]
    expect(rewriteRefuted(messages, asked, kept)).toBe(1)
    const parts = messages[0].parts as MessageV2.ToolPart[]
    expect(parts.map((part) => part.callID)).toEqual(["call_keep", "call_noResult", "call_never"])
    expect(parts[0]).toBe(originals[0])
    expect(parts[1].state).toMatchObject({ output: PRUNED_MARKER })
    expect(originals[1].state).toMatchObject({ output: "result of noResult" })
    expect(parts[2]).toBe(originals[3])
  })

  test("keeps a result Jev judged load-bearing", () => {
    const { messages, pairs } = head(["solidaire"])
    const kept = JevCompaction.prune(
      pairs,
      { "call:call_solidaire": noul(1), "result:call_solidaire": noul(1) },
      0.5,
    )
    expect(rewriteRefuted(messages, pairs, kept)).toBe(0)
    expect((messages[0].parts[0] as MessageV2.ToolPart).state).toMatchObject({ output: "result of solidaire" })
  })

  test("falls back to the unchanged transcript when Jev answered nothing", () => {
    const { messages, pairs } = head(["alpha"])
    const before = messages[0].parts[0]
    expect(rewriteRefuted(messages, pairs, JevCompaction.prune(pairs, {}, 0.5))).toBe(0)
    expect(messages[0].parts).toHaveLength(1)
    expect(messages[0].parts[0]).toBe(before)
  })

  test("keeps a call whose arguments alone were refuted", () => {
    const { messages, pairs } = head(["solo"])
    const before = messages[0].parts[0]
    expect(rewriteRefuted(messages, pairs, [{ ...pairs[0], call: "" }])).toBe(0)
    expect(messages[0].parts[0]).toBe(before)
  })

  test("ignores tool calls that were never asked about", () => {
    const { messages } = head(["untouched"])
    const before = messages[0].parts[0]
    expect(rewriteRefuted(messages, [], [])).toBe(0)
    expect(messages[0].parts[0]).toBe(before)
  })

  test("asks two questions per pair, quoting the call and its result", () => {
    const { pairs } = head(["alpha"])
    const questions = JevCompaction.keepQuestions(pairs)
    expect(Object.keys(questions)).toEqual(["call:call_alpha", "result:call_alpha"])
    expect(questions["call:call_alpha"].instructions).toContain("alpha")
    expect(questions["result:call_alpha"].instructions).toContain("result of alpha")
  })
})
