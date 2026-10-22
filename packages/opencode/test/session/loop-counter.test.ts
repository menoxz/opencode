import { describe, expect, test } from "bun:test"
import {
  LOOP_COUNTER_MARKER,
  MAX_NUDGES,
  batchNudge,
  callsPerStep,
  isLoopNudge,
  nudgeText,
  stripLoopNudge,
} from "@/session/loop-counter"

const step = (calls: number) => ({ toolCalls: Array.from({ length: calls }, (_, index) => ({ index })) })

describe("callsPerStep", () => {
  test("reports one count per executed step", () => {
    expect(callsPerStep([step(1), step(4), step(0)])).toEqual([1, 4, 0])
  })

  test("treats a step without tool calls as zero", () => {
    expect(callsPerStep([{}])).toEqual([0])
  })
})

describe("batchNudge", () => {
  test("says nothing before the first step, where nothing could have been grouped yet", () => {
    expect(batchNudge({ steps: [], nudged: 0 })).toBeUndefined()
  })

  test("fires when the previous loop issued a single call", () => {
    const nudge = batchNudge({ steps: [step(1)], nudged: 0 })
    expect(nudge?.calls).toBe(1)
    expect(nudge?.text).toContain("1 tool call")
  })

  test("stays silent once the previous loop already batched its calls", () => {
    expect(batchNudge({ steps: [step(1), step(3)], nudged: 0 })).toBeUndefined()
  })

  test("stays silent on a loop with no tool call, which ends the turn", () => {
    expect(batchNudge({ steps: [step(0)], nudged: 0 })).toBeUndefined()
  })

  test("stops after the cap so the reminder cannot become the noise it denounces", () => {
    expect(batchNudge({ steps: [step(1)], nudged: MAX_NUDGES - 1 })).toBeDefined()
    expect(batchNudge({ steps: [step(1)], nudged: MAX_NUDGES })).toBeUndefined()
  })

  test("honours a custom threshold", () => {
    expect(batchNudge({ steps: [step(2)], nudged: 0, threshold: 2 })?.calls).toBe(2)
  })
})

describe("nudgeText", () => {
  test("wraps the reminder in the system-reminder envelope the model already knows", () => {
    const text = nudgeText(1)
    expect(text.startsWith("<system-reminder>")).toBe(true)
    expect(text.endsWith("</system-reminder>")).toBe(true)
    expect(text).toContain(LOOP_COUNTER_MARKER)
  })

  test("pluralises the count so the sentence stays readable", () => {
    expect(nudgeText(1)).toContain("1 tool call.")
    expect(nudgeText(2)).toContain("2 tool calls.")
  })

  test("keeps the door open to editing early instead of imposing a waiting turn", () => {
    expect(nudgeText(1)).toContain("editing early is encouraged")
  })
})

describe("stripLoopNudge", () => {
  test("removes a previous reminder carried as plain string content", () => {
    const messages = [
      { role: "user", content: "keep me" },
      { role: "user", content: nudgeText(1) },
    ]
    expect(stripLoopNudge(messages)).toEqual([{ role: "user", content: "keep me" }])
  })

  test("removes a previous reminder carried as content parts", () => {
    const messages = [{ role: "user", content: [{ type: "text", text: nudgeText(2) }] }]
    expect(stripLoopNudge(messages)).toEqual([])
  })

  test("leaves unrelated messages untouched, including a steer reminder", () => {
    const messages = [
      { role: "user", content: "<system-reminder>\nThe user interrupted your work.\n</system-reminder>" },
      { role: "assistant", content: "ok" },
    ]
    expect(stripLoopNudge(messages)).toHaveLength(2)
  })
})

describe("isLoopNudge", () => {
  test("ignores messages without content", () => {
    expect(isLoopNudge({})).toBe(false)
  })

  test("ignores content parts that are not text", () => {
    expect(isLoopNudge({ content: [{ type: "image", data: "..." }] })).toBe(false)
  })
})
