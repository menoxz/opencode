import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import { ProviderTransform } from "@/provider/transform"
import { INJECTED_GUIDANCE_MARKER } from "@/session/prompt-methodology"

const model = {
  id: "anthropic/claude-sonnet-4",
  providerID: "anthropic",
  api: { id: "claude-sonnet-4", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
  name: "Claude Sonnet 4",
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: true,
    toolcall: true,
    input: { text: true, audio: false, image: true, video: false, pdf: true },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0.003, output: 0.015, cache: { read: 0.0003, write: 0.00375 } },
  limit: { context: 200_000, output: 8192 },
  status: "active",
  options: {},
  headers: {},
} as any

const ephemeral = (value: unknown) => JSON.stringify(value ?? {}).includes("ephemeral")

const marked = (msg: any) =>
  ephemeral(msg.providerOptions) ||
  (Array.isArray(msg.content) && msg.content.some((part: any) => ephemeral(part.providerOptions)))

const transform = (msgs: ModelMessage[]) => ProviderTransform.message(msgs, model, {})

const breakpoints = (msgs: ModelMessage[]) =>
  transform(msgs).flatMap((msg, index) => (marked(msg) ? [index] : []))

const turn = (n: number): ModelMessage[] => [
  { role: "user", content: `request ${n}` },
  { role: "assistant", content: [{ type: "tool-call", toolCallId: `call-${n}`, toolName: "read", input: {} }] },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: `call-${n}`,
        toolName: "read",
        output: { type: "text", value: `result ${n}` },
      },
    ],
  },
]

const head: ModelMessage = { role: "system", content: "stable head" }

const injected = (body: string): ModelMessage => ({
  role: "user",
  content: [INJECTED_GUIDANCE_MARKER, body, "</system-reminder>"].join("\n"),
})

const sharedPrefix = (a: unknown[], b: unknown[]) => {
  let index = 0
  while (index < Math.min(a.length, b.length) && JSON.stringify(a[index]) === JSON.stringify(b[index])) index++
  return index
}

describe("ProviderTransform.message - cache breakpoints", () => {
  test("anchors the body of the conversation instead of the two newest messages", () => {
    const msgs: ModelMessage[] = [
      head,
      ...turn(1),
      ...turn(2),
      ...turn(3),
      { role: "user", content: "request 4" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-4", toolName: "read", input: {} }] },
    ]
    // 0 head | 1-3 turn 1 | 4-6 turn 2 | 7-9 turn 3 | 10 request 4 | 11 partial turn 4
    expect(breakpoints(msgs)).toEqual([0, 9, 10, 11])
  })

  test("injected guidance is neither cached nor allowed to move the anchor", () => {
    const msgs: ModelMessage[] = [
      head,
      ...turn(1),
      ...turn(2),
      { role: "user", content: "request 3" },
      injected("context slots"),
      injected("working state"),
    ]
    // 0 head | 1-3 turn 1 | 4-6 turn 2 | 7 request 3 | 8-9 injected tail
    expect(breakpoints(msgs)).toEqual([0, 6, 7])
  })

  test("stays within the four-breakpoint budget on a long history", () => {
    const msgs: ModelMessage[] = [
      head,
      ...Array.from({ length: 25 }, (_, index) => turn(index + 1)).flat(),
      injected("tail"),
    ]
    expect(breakpoints(msgs)).toHaveLength(4)
  })

  test("keeps every cached byte of the previous request identical when only the volatile tail changes", () => {
    const history: ModelMessage[] = [head, ...turn(1), ...turn(2), { role: "user", content: "request 3" }]
    const first: ModelMessage[] = [...history, injected("slots at step 1"), injected("card at step 1")]
    const second: ModelMessage[] = [...history, ...turn(3).slice(1), injected("slots at step 2"), injected("card at step 2")]

    const deepest = Math.max(...breakpoints(first))
    const one = transform(first)
    const two = transform(second)

    expect(sharedPrefix(one, two)).toBeGreaterThan(deepest)
    expect(JSON.stringify(one.slice(0, deepest + 1))).toBe(JSON.stringify(two.slice(0, deepest + 1)))
  })
})
