import { describe, expect, test } from "bun:test"
import {
  LOOP_COUNTER_MARKER,
  MAX_NUDGES,
  assistantToolCalls,
  batchNudge,
  callsPerStep,
  isLoopNudge,
  lastAssistant,
  nudgeText,
  previousTurnToolCalls,
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

describe("previousTurnToolCalls", () => {
  const turn = (calls: number, text = "answer") => ({
    role: "assistant",
    content: [
      ...Array.from({ length: calls }, (_, index) => ({ type: "tool-call", toolName: `t${index}` })),
      { type: "text", text },
    ],
  })

  test("sums every assistant message of the previous turn, not just the last one", () => {
    // Mesure live : le dernier message assistant est la reponse finale, muette. Lire
    // seulement celui-la donnait 0 appel alors que le tour venait d'en emettre un.
    const messages = [
      { role: "user", content: "tour 1" },
      turn(1),
      { role: "user", content: "tour 2" },
    ]
    expect(previousTurnToolCalls(messages)).toBe(1)
  })

  test("counts a turn split across several assistant messages", () => {
    const messages = [
      { role: "user", content: "tour 1" },
      turn(2),
      turn(3),
      { role: "user", content: "tour 2" },
    ]
    expect(previousTurnToolCalls(messages)).toBe(5)
  })

  test("ignores the turn in progress after the last user message", () => {
    const messages = [
      { role: "user", content: "tour 1" },
      turn(1),
      { role: "user", content: "tour 2" },
      turn(9),
    ]
    expect(previousTurnToolCalls(messages)).toBe(1)
  })

  test("returns zero for a previous turn that called nothing", () => {
    const messages = [
      { role: "user", content: "tour 1" },
      turn(0),
      { role: "user", content: "tour 2" },
    ]
    expect(previousTurnToolCalls(messages)).toBe(0)
  })

  test("returns undefined on the first turn, where there is nothing to compare", () => {
    expect(previousTurnToolCalls([{ role: "user", content: "tour 1" }])).toBeUndefined()
  })

  test("finds the real turn boundary in the exact shape a live run produced", () => {
    // Forme relevee dans dev.log pendant un run reel : quatre system, le prompt, l'appel
    // outil, son resultat, la reponse, le prompt suivant, puis deux cartes injectees en
    // queue. Les cartes se font passer pour le dernier prompt si on ne les ecarte pas —
    // c'est ce qui a fait donner 0 a un run et 1 a l'autre, sans changement de code.
    const live = [
      { role: "system", content: "sys" },
      { role: "system", content: "sys" },
      { role: "system", content: "sys" },
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "Lis package.json" }] },
      { role: "assistant", content: [{ type: "tool-call", toolName: "read" }] },
      { role: "tool", content: [{ type: "tool-result", output: "{}" }] },
      { role: "assistant", content: [{ type: "text", text: "name = opencode" }] },
      { role: "user", content: [{ type: "text", text: "Dis bonjour" }] },
      { role: "user", content: "<system-reminder>working state</system-reminder>" },
      { role: "user", content: "<system-reminder>loop counter</system-reminder>" },
    ]
    expect(previousTurnToolCalls(live)).toBe(1)
  })

  test("ignores an injected card even when it is the only trailing user message", () => {
    const live = [
      { role: "user", content: [{ type: "text", text: "Lis package.json" }] },
      { role: "assistant", content: [{ type: "tool-call", toolName: "read" }] },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      { role: "user", content: [{ type: "text", text: "Encore" }] },
      { role: "user", content: "<!--loop-counter-->\nreminder" },
    ]
    expect(previousTurnToolCalls(live)).toBe(1)
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

describe("assistantToolCalls", () => {
  test("counts tool-call parts, which is the only turn-level signal available", () => {
    expect(
      assistantToolCalls({
        role: "assistant",
        content: [
          { type: "text", text: "looking" },
          { type: "tool-call", toolName: "read" },
          { type: "tool-call", toolName: "grep" },
        ],
      }),
    ).toBe(2)
  })

  test("returns zero for a text-only answer, which is a finished turn", () => {
    expect(assistantToolCalls({ role: "assistant", content: "done" })).toBe(0)
  })

  test("ignores non-object parts instead of throwing", () => {
    expect(assistantToolCalls({ role: "assistant", content: [null, 3, "x"] })).toBe(0)
  })
})

describe("lastAssistant", () => {
  test("finds the most recent assistant message", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]
    expect(lastAssistant(messages)?.content).toBe("b")
  })

  test("returns undefined when the conversation has none", () => {
    expect(lastAssistant([{ role: "user", content: "a" }])).toBeUndefined()
  })
})

describe("batchNudge across turns", () => {
  test("names the turn as the scope when the previous turn only made one call", () => {
    const nudge = batchNudge({ steps: [], nudged: 0, previousTurnCalls: 1 })
    expect(nudge?.scope).toBe("turn")
    expect(nudge?.calls).toBe(1)
  })

  test("names the step as the scope when the shortfall is inside the current turn", () => {
    expect(batchNudge({ steps: [step(1)], nudged: 0 })?.scope).toBe("step")
  })

  test("stays silent when the previous turn called no tool, which ended it", () => {
    expect(batchNudge({ steps: [], nudged: 0, previousTurnCalls: 0 })).toBeUndefined()
  })

  test("stays silent when the previous turn already batched its calls", () => {
    expect(batchNudge({ steps: [], nudged: 0, previousTurnCalls: 5 })).toBeUndefined()
  })

  test("stays silent on the very first turn, where no previous turn exists", () => {
    expect(batchNudge({ steps: [], nudged: 0 })).toBeUndefined()
  })
})
