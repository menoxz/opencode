import { describe, expect, test } from "bun:test"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText, wrapLanguageModel, jsonSchema, tool } from "ai"
import { CachePrefix } from "@/session/llm/cache-prefix"
import { CachePrefixAdapters } from "@/session/llm/cache-prefix-adapters"

const payload = (messages: unknown[] = ["hello"]): CachePrefix.Payload => ({
  options: [{ model: "test" }],
  system: ["fixed"],
  tools: [{ name: "test", schema: {} }],
  messages,
})

describe("private prefix snapshots", () => {
  test("F1 undefined properties charge budget; projection and throwing Proxy fail closed", () => {
    const d = CachePrefix.create(() => true)
    const huge = Object.fromEntries(Array.from({ length: 70_000 }, (_, i) => [String(i), undefined]))
    d.observe("a", "native", payload([huge]))
    expect(d.observe("a", "native", payload([huge]))).toMatchObject({ complete: false, status: "bounded" })
    const summaries: CachePrefix.Summary[] = []
    const observe: CachePrefixAdapters.Observer = (boundary, p) => {
      summaries.push(d.observe("b", boundary, p)!)
    }
    CachePrefixAdapters.native(observe, huge)
    CachePrefixAdapters.native(observe, huge)
    expect(summaries[1]).toMatchObject({ complete: false, status: "bounded", items: 0 })
    let enumerations = 0
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          enumerations++
          throw new Error("private")
        },
      },
    )
    CachePrefixAdapters.native(observe, proxy)
    expect(enumerations).toBe(1)
    expect(summaries[2].complete).toBe(false)
    d.observe("a", "native", payload([proxy]))
    expect(d.observe("a", "native", payload([proxy]))).toMatchObject({ complete: false, status: "bounded" })
    CachePrefixAdapters.native(observe, { messages: ["new"] })
    expect(summaries.at(-1)?.status).not.toBe("equal")
    expect(() =>
      CachePrefixAdapters.native(() => {
        throw new Error("log failed")
      }, proxy),
    ).not.toThrow()
    d.dispose()
  })

  test("F3 real AI SDK streams survive diagnostic failures and retain transport errors", async () => {
    for (const failure of [false, true]) {
      let calls = 0
      let observations = 0
      const callbackErrors: unknown[] = []
      const model = createOpenAI({
        apiKey: "offline",
        fetch: Object.assign(
          async () => {
            calls++
            if (failure) return new Response('{"error":{"message":"provider failure"}}', { status: 400 })
            return new Response(
              'data: {"type":"response.completed","response":{"id":"r","model":"gpt-5-mini","output":[]}}\n\ndata: [DONE]\n\n',
              { headers: { "content-type": "text/event-stream" } },
            )
          },
          { preconnect: () => undefined },
        ),
      }).responses("gpt-5-mini")
      const d = CachePrefix.create(() => true)
      const result = streamText({
        model: wrapLanguageModel({
          model,
          middleware: [
            CachePrefixAdapters.aiSDK((boundary, p) => {
              observations++
              const broken = new Proxy(
                {},
                {
                  ownKeys() {
                    throw new Error("hash extraction")
                  },
                },
              )
              expect(d.observe("a", boundary, { ...p, messages: [broken] })?.complete).toBe(false)
              throw new Error("log failure")
            }),
          ],
        }),
        messages: [{ role: "user", content: "hello" }],
        maxRetries: 0,
        onError: ({ error }) => {
          callbackErrors.push(error)
        },
      })
      const errors: unknown[] = []
      for await (const part of result.fullStream) if (part.type === "error") errors.push(part.error)
      expect(calls).toBe(1)
      expect(observations).toBe(1)
      expect(errors.length).toBe(failure ? 1 : 0)
      expect(callbackErrors).toEqual(errors)
      d.dispose()
    }
  })
  test("append, exact equality, system/tool changes, shrinking and order", () => {
    const d = CachePrefix.create(() => true)
    const observe = (p: CachePrefix.Payload) => d.observe("a", "native", p)
    expect(observe(payload())?.status).toBe("baseline")
    expect(observe(payload())?.status).toBe("equal")
    expect(observe(payload(["hello", "next"]))?.status).toBe("append")
    expect(observe(payload())?.status).toBe("changed")
    expect(observe({ ...payload(), system: ["changed"] })?.firstChangedSection).toBe("system")
    observe(payload())
    expect(observe({ ...payload(), tools: [{ name: "other", schema: {} }] })?.firstChangedSection).toBe("tools")
    observe(payload(["a", "b"]))
    expect(observe(payload(["b", "a"]))?.firstChangedSection).toBe("messages")
    observe({ ...payload(), tools: ["a", "b"] })
    expect(observe({ ...payload(), tools: ["b", "a"] })?.firstChangedSection).toBe("tools")
    d.dispose()
  })

  test("framing, Unicode and split requests do not collide", () => {
    const d = CachePrefix.create(() => true)
    for (const [a, b] of [
      ["ab", "a"],
      ["é", "e\u0301"],
      ["\ud800", "\ufffd"],
      ["😀", "😁"],
    ]) {
      d.observe("a", "native", payload([a]))
      expect(d.observe("a", "native", payload([b]))?.status).toBe("changed")
    }
    d.observe("a", "native", payload(["ab", "c"]))
    expect(d.observe("a", "native", payload(["a", "bc"]))?.status).toBe("changed")
    d.observe("a", "native", payload([{ x: "a", y: "b" }]))
    expect(d.observe("a", "native", payload([{ y: "b", x: "a" }]))?.status).toBe("changed")
    d.dispose()
  })

  test("opt-in, session/runtime isolation, deletion, disposal and eviction", () => {
    let enabled = false
    const d = CachePrefix.create(() => enabled)
    expect(d.observe("a", "native", payload())).toBeUndefined()
    enabled = true
    expect(d.observe("a", "native", payload())?.status).toBe("baseline")
    expect(d.observe("b", "native", payload())?.status).toBe("baseline")
    expect(d.observe("a", "ai-sdk", payload())?.status).toBe("baseline")
    d.forget("a")
    expect(d.observe("a", "ai-sdk", payload())?.status).toBe("baseline")
    for (let i = 0; i < 33; i++) d.observe(String(i), "native", payload())
    expect(d.observe("a", "ai-sdk", payload())?.status).toBe("baseline")
    enabled = false
    expect(d.observe("a", "native", payload())).toBeUndefined()
    enabled = true
    expect(d.observe("a", "native", payload())?.status).toBe("baseline")
    d.dispose()
    expect(d.observe("a", "native", payload())).toBeUndefined()
  })

  test("bounded values never claim full equality; output contains no payload or hashes", () => {
    const d = CachePrefix.create(() => true)
    for (const p of [payload(["secret/path/args".repeat(400_000)]), payload(Array(1100).fill("x"))]) {
      expect(d.observe("a", "native", p)?.complete).toBe(false)
      expect(d.observe("a", "native", p)?.status).toBe("bounded")
    }
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(d.observe("a", "native", payload([cycle]))?.complete).toBe(false)
    const summary = d.observe("a", "native", payload(["private/path", { secret: "args" }]))!
    expect(Object.keys(summary).sort()).toEqual([
      "boundary",
      "commonItems",
      "complete",
      "firstChangedSection",
      "items",
      "previousItems",
      "status",
    ])
    expect(JSON.stringify(summary)).not.toMatch(/private|secret|args|[a-f0-9]{64}/)
    d.dispose()
  })

  test("expiry, source mutation and disabling at assembly invalidate retained history", () => {
    let time = 0
    let enabled = true
    const d = CachePrefix.create(
      () => enabled,
      () => time,
    )
    const p = payload()
    d.observe("a", "native", p)
    const message = { text: "before" }
    d.observe("b", "native", payload([message]))
    message.text = "after"
    expect(d.observe("b", "native", payload([message]))?.status).toBe("changed")
    time = 600_000
    expect(d.observe("a", "native", p)?.status).toBe("baseline")
    enabled = false
    expect(d.enabled()).toBe(false)
    enabled = true
    expect(d.observe("a", "native", p)?.status).toBe("baseline")
    d.dispose()
  })

  test("catalog growth without conversation is not conversation append", () => {
    const d = CachePrefix.create(() => true)
    d.observe("a", "native", { ...payload([]), tools: [] })
    expect(d.observe("a", "native", payload([]))).toMatchObject({ status: "changed", firstChangedSection: "tools" })
    d.dispose()
  })

  test("real AI SDK stream boundary sees transformed prompt and lowered schemas, no network", async () => {
    const d = CachePrefix.create(() => true)
    const summaries: CachePrefix.Summary[] = []
    const bodies: unknown[] = []
    const model = createOpenAI({
      apiKey: "offline",
      fetch: Object.assign(
        async (_url: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
          bodies.push(JSON.parse(String(init?.body)))
          return new Response(
            'data: {"type":"response.completed","response":{"id":"r","model":"gpt-5-mini","output":[],"usage":{"input_tokens":1,"output_tokens":0}}}\n\ndata: [DONE]\n\n',
            { headers: { "content-type": "text/event-stream" } },
          )
        },
        { preconnect: () => undefined },
      ),
    }).responses("gpt-5-mini")
    for (const system of ["one", "one", "two"]) {
      const result = streamText({
        model: wrapLanguageModel({
          model,
          middleware: [
            {
              specificationVersion: "v3",
              transformParams: async ({ params }) => ({
                ...params,
                prompt: [{ role: "system", content: system }, ...params.prompt],
              }),
            },
            CachePrefixAdapters.aiSDK((boundary, p) => {
              expect(p.tools).toHaveLength(1)
              expect(p.messages[0]).toMatchObject({ role: "system", content: system })
              summaries.push(d.observe("a", boundary, p)!)
            }),
          ],
        }),
        messages: [{ role: "user", content: "hello" }],
        tools: { test: tool({ description: "test", inputSchema: jsonSchema({ type: "object", properties: {} }) }) },
        maxRetries: 0,
      })
      await result.consumeStream({
        onError: (error) => {
          throw error
        },
      })
    }
    expect(bodies).toHaveLength(3)
    expect(summaries.map((x) => x.status)).toEqual(["baseline", "equal", "changed"])
    expect(summaries[2].firstChangedSection).toBe("system")
    d.dispose()
  })
})
