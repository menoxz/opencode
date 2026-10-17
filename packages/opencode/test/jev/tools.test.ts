import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevClient } from "@/jev/client"
import { JevTools } from "@/jev/tools"

const ENV_NAMES = ["JEV_API_KEY", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "TYPESAFE_MODEL", "COMMAND_CODE_API_KEY"] as const

/** Clears the Jev environment so the per-test settings alone decide auth. */
const cleanEnv = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
      for (const name of ENV_NAMES) delete process.env[name]
      return saved
    }),
    () => effect,
    (saved) =>
      Effect.sync(() => {
        for (const [name, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[name]
          else process.env[name] = value
        }
      }),
  )

/** `select` takes its transport as an argument, so the test runs it on the live clock. */
const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(cleanEnv(effect))

/**
 * A fake transport: no socket, no DNS, no credential.
 *
 * `JevTools.select` takes its HttpClient as an argument, so the whole selection
 * runs in memory. The provider lock refuses every host that is not one of its
 * three presets, so a local Bun server can no longer stand in for the endpoint:
 * the call used to leave for the real API with a fake key.
 */
const host = (respond: () => Response) => {
  const seen: string[] = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      seen.push(request.url)
      return HttpClientResponse.fromWeb(request, respond())
    }),
  )
  return { client, seen }
}

const tools = [
  { id: "bash", description: "Run a shell command" },
  { id: "web-browser_navigate", description: "Open a web page" },
  { id: "vision", description: "Analyse an image with an LLM" },
]

const settings = { api_key: "test-key" }

describe("jev.tools end to end", () => {
  test("surfaces exactly the tools Jev affirms, with no fixed cap", () =>
    run(
      Effect.gen(function* () {
        const { client, seen } = host(
          () =>
            Response.json({
              model: "jev-latest",
              answers: {
                bash: { type: "noul", noul: 0.9 },
                "web-browser_navigate": { type: "noul", noul: 0.05 },
                vision: { type: "noul", noul: 0.55 },
              },
            }),
        )
        const chosen = yield* JevTools.select(client, settings, { query: "run the build", tools })
        expect(chosen).toEqual(["bash", "vision"])
        expect(seen).toEqual([`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`])
      }),
    ),
  )

  test("Jev may surface nothing — a valid total rejection, not an error", () =>
    run(
      Effect.gen(function* () {
        const { client } = host(
          () =>
            Response.json({
              model: "jev-latest",
              answers: {
                bash: { type: "noul", noul: 0.2 },
                "web-browser_navigate": { type: "noul", noul: 0.1 },
                vision: { type: "noul", noul: 0.05 },
              },
            }),
        )
        const chosen = yield* JevTools.select(client, settings, { query: "bonjour", tools })
        expect(chosen).toEqual([])
      }),
    ),
  )

  test("an HTTP failure is contained, so the caller keeps the lexical ranking", () =>
    run(
      Effect.gen(function* () {
        const { client } = host(() => new Response("boom", { status: 500 }))
        const outcome = yield* JevTools.select(client, settings, { query: "x", tools }).pipe(
          Effect.catch(() => Effect.succeed("failed" as const)),
        )
        expect(outcome).toBeUndefined()
      }),
    ),
  )

  test("an unreadable answer abstains, so the caller falls back", () =>
    run(
      Effect.gen(function* () {
        const { client } = host(() => Response.json({ model: "jev-latest", answers: {} }))
        const outcome = yield* JevTools.select(client, settings, { query: "x", tools }).pipe(
          Effect.catch(() => Effect.succeed("error" as const)),
        )
        expect(outcome).toBeUndefined()
      }),
    ),
  )
})
