import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevHooks } from "@/jev/hooks"

const noise = Array.from({ length: 80 }, (_, i) => `progress line ${i} ${"-".repeat(40)}`).join("\n")
const output = `${noise}\nKEEP C:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:1\n${noise}`

const response = () => ({
  model: "jev-latest",
  answers: {
    correctness: { type: "score", score: 0.9, confidence: 0.8 },
    complexity: { type: "score", score: 0.3, confidence: 0.8 },
    security: { type: "score", score: 0.1, confidence: 0.8 },
    ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`b${i + 1}`, { type: "noul", noul: 0.05 }])),
  },
})

const host = () => {
  const seen: string[] = []
  const client = HttpClient.make((request) => {
    seen.push(request.url)
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(response())))
  })
  return { client, seen }
}

const input = { sessionID: "ses_intake", tool: "bash", args: { command: "bun test" }, output }

describe("jev intake hook", () => {
  test("merges intake into the existing post round-trip", async () => {
    const { client, seen } = host()
    const screening = await Effect.runPromise(
      JevHooks.post(
        client,
        { api_key: "test-key", base_url: "http://jev.test", review: { enabled: true }, intake: { enabled: true } },
        input,
      ),
    )
    expect(seen).toHaveLength(1)
    expect(screening.kept).toBeDefined()
    expect(screening.kept!.length).toBeLessThan(output.length)
    expect(screening.kept!).toContain("intake.ts:1")
  })

  test("uses its own request when intake selects another model", async () => {
    const { client, seen } = host()
    await Effect.runPromise(
      JevHooks.post(
        client,
        {
          api_key: "test-key",
          base_url: "http://jev.test",
          review: { enabled: true },
          intake: { enabled: true, model: "openjev-latest" },
        },
        input,
      ),
    )
    expect(seen).toHaveLength(2)
  })

  test("changes nothing when intake is disabled", async () => {
    const { client, seen } = host()
    const screening = await Effect.runPromise(
      JevHooks.post(client, { api_key: "test-key", base_url: "http://jev.test", intake: { enabled: false } }, input),
    )
    expect(screening.kept).toBeUndefined()
    expect(seen).toHaveLength(0)
  })
})
