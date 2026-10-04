import { expect, test } from "bun:test"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { wrapResponsesToolSearch } from "../../src/provider/responses-tool-search"

const input = { query: "find café tools", nested: { keep: [1, true, null] } }
const output = { tools: [], extra: "local result" }
function options(): LanguageModelV3CallOptions {
  return {
    providerOptions: { openai: { store: false } },
    tools: [{ type: "function", name: "tool_search", inputSchema: { type: "object" } }],
    toolChoice: { type: "tool", toolName: "tool_search" },
    prompt: [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call_local", toolName: "tool_search", input }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_local",
            toolName: "tool_search",
            output: { type: "json", value: output },
          },
        ],
      },
    ],
  }
}

type Wire = { input: Record<string, unknown>[]; tools: Record<string, unknown>[]; tool_choice: unknown }
function capture(stream = false) {
  const requests: Wire[] = []
  const sdk = createOpenAI({
    apiKey: "test-only",
    fetch: Object.assign(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const wire: Wire = JSON.parse(String(init?.body))
        requests.push(wire)
        const name = String(wire.tools?.find((tool) => tool.type === "function")?.name ?? "unused")
        const item = {
          type: "function_call",
          id: "fc_next",
          call_id: "call_next",
          name,
          arguments: JSON.stringify(input),
        }
        if (!stream) return Response.json({ id: "resp_test", output: [item] })
        const events = [
          { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
          { type: "response.function_call_arguments.delta", item_id: item.id, output_index: 0, delta: item.arguments },
          { type: "response.output_item.done", output_index: 0, item: { ...item, status: "completed" } },
        ]
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        })
      },
      { preconnect: fetch.preconnect },
    ),
  })
  return { model: sdk.responses("gpt-5"), sdk, requests }
}

test("installed SDK reproduces missing arguments; boundary preserves local JSON and nonstream name", async () => {
  const raw = capture()
  await raw.model.doGenerate(options())
  expect(raw.requests[0].input[0]).toMatchObject({ type: "tool_search_call" })
  expect(raw.requests[0].input[0]).not.toHaveProperty("arguments")
  expect(raw.requests[0].input[1].type).toBe("tool_search_output")

  const fixed = capture()
  const original = options()
  const before = structuredClone(original)
  const result = await wrapResponsesToolSearch(fixed.model, "@ai-sdk/openai").doGenerate(original)
  expect(original).toEqual(before)
  expect(fixed.requests[0].tools[0].name).toBe("opencode_tool_search")
  expect(fixed.requests[0].tool_choice).toEqual({ type: "function", name: "opencode_tool_search" })
  expect(fixed.requests[0].input[0]).toMatchObject({
    type: "function_call",
    name: "opencode_tool_search",
    call_id: "call_local",
    arguments: JSON.stringify(input),
  })
  expect(fixed.requests[0].input[1]).toEqual({
    type: "function_call_output",
    call_id: "call_local",
    output: JSON.stringify(output),
  })
  expect(result.content[0]).toMatchObject({ type: "tool-call", toolName: "tool_search", input: JSON.stringify(input) })
})

test("stream restores tool-input-start and tool-call names using real SDK SSE parser", async () => {
  const fixture = capture(true)
  const result = await wrapResponsesToolSearch(fixture.model, "@ai-sdk/openai").doStream(options())
  const parts: LanguageModelV3StreamPart[] = []
  const reader = result.stream.getReader()
  while (true) {
    const part = await reader.read()
    if (part.done) break
    parts.push(part.value)
  }
  expect(parts.filter((part) => part.type === "error")).toEqual([])
  expect(parts).toContainEqual(expect.objectContaining({ type: "tool-input-start", toolName: "tool_search" }))
  expect(parts).toContainEqual(
    expect.objectContaining({ type: "tool-call", toolName: "tool_search", input: JSON.stringify(input) }),
  )
  expect(fixture.requests[0].input[0].arguments).toBe(JSON.stringify(input))
})

test("native tool_search definitions and history remain byte-equivalent", async () => {
  const native = options()
  native.tools = [{ type: "provider", id: "openai.tool_search", name: "tool_search", args: {} }]
  native.prompt = [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "native",
          toolName: "tool_search",
          providerExecuted: true,
          input: { arguments: { query: "native" } },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "native",
          toolName: "tool_search",
          output: { type: "json", value: { tools: [] } },
        },
      ],
    },
  ]
  const raw = capture()
  const fixed = capture()
  await raw.model.doGenerate(native)
  await wrapResponsesToolSearch(fixed.model, "@ai-sdk/openai").doGenerate(native)
  expect(fixed.requests).toEqual(raw.requests)
  expect(fixed.requests[0].input[0]).toMatchObject({ type: "tool_search_call", arguments: { query: "native" } })
  expect(fixed.requests[0].tools[0].type).toBe("tool_search")
})

test("history without current definition is repaired, aliases avoid collisions, scope excludes chat and other SDKs", async () => {
  const fixture = capture()
  const history = options()
  history.tools = [{ type: "function", name: "opencode_tool_search", inputSchema: { type: "object" } }]
  await wrapResponsesToolSearch(fixture.model, "@ai-sdk/openai").doGenerate(history)
  expect(fixture.requests[0].input[0].name).toBe("opencode_tool_search_")
  expect(fixture.requests[0].tools[0].name).toBe("opencode_tool_search")
  expect(wrapResponsesToolSearch(fixture.model, "@ai-sdk/anthropic")).toBe(fixture.model)
  const chat = fixture.sdk.chat("gpt-5")
  expect(wrapResponsesToolSearch(chat, "@ai-sdk/openai")).toBe(chat)
})

test("local and custom-named hosted search coexist without changing hosted history", async () => {
  const fixture = capture()
  const mixed = options()
  mixed.tools!.push({ type: "provider", id: "openai.tool_search", name: "hosted_search", args: {} })
  mixed.prompt.push(
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "hosted",
          toolName: "hosted_search",
          providerExecuted: true,
          input: { arguments: { query: "native" } },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "hosted",
          toolName: "hosted_search",
          output: { type: "json", value: { tools: [] } },
        },
      ],
    },
  )
  await wrapResponsesToolSearch(fixture.model, "@ai-sdk/openai").doGenerate(mixed)
  expect(fixture.requests[0].input[0]).toMatchObject({ type: "function_call", arguments: JSON.stringify(input) })
  expect(fixture.requests[0].input[2]).toMatchObject({ type: "tool_search_call", arguments: { query: "native" } })
  expect(fixture.requests[0].input[3]).toMatchObject({ type: "tool_search_output", tools: [] })
  expect(fixture.requests[0].tools[1].type).toBe("tool_search")
})
