import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { JevTools } from "@/jev/tools"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(FetchHttpClient.layer))

const ENV_NAMES = ["JEV_API_KEY", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "TYPESAFE_MODEL", "COMMAND_CODE_API_KEY"] as const

/** Clears the Jev environment so the per-test settings alone decide auth and endpoint. */
const cleanEnv = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
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

const withServer = <A, E, R>(handler: () => Response, fn: (base: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async () => handler() })),
    (server) => fn(server.url.origin),
    (server) => Effect.sync(() => server.stop(true)),
  )

const tools = [
  { id: "bash", description: "Run a shell command" },
  { id: "web-browser_navigate", description: "Open a web page" },
  { id: "vision", description: "Analyse an image with an LLM" },
]

const settings = (base: string) => ({ api_key: "test-key", endpoint: `${base}/v1/systemone` })

describe("jev.tools end to end", () => {
  it.instance("surfaces exactly the tools Jev affirms, with no fixed cap", () =>
    cleanEnv(
      withServer(
        () =>
          Response.json({
            model: "jev-latest",
            answers: {
              bash: { type: "noul", noul: 0.9 },
              "web-browser_navigate": { type: "noul", noul: 0.05 },
              vision: { type: "noul", noul: 0.55 },
            },
          }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const chosen = yield* JevTools.select(http, settings(base), { query: "run the build", tools })
            expect(chosen).toEqual(["bash", "vision"])
          }),
      ),
    ),
  )

  it.instance("Jev may surface nothing — a valid total rejection, not an error", () =>
    cleanEnv(
      withServer(
        () =>
          Response.json({
            model: "jev-latest",
            answers: {
              bash: { type: "noul", noul: 0.2 },
              "web-browser_navigate": { type: "noul", noul: 0.1 },
              vision: { type: "noul", noul: 0.05 },
            },
          }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const chosen = yield* JevTools.select(http, settings(base), { query: "bonjour", tools })
            expect(chosen).toEqual([])
          }),
      ),
    ),
  )

  it.instance("an HTTP failure surfaces, so the caller keeps the lexical ranking", () =>
    cleanEnv(
      withServer(
        () => new Response("boom", { status: 500 }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const outcome = yield* JevTools.select(http, settings(base), { query: "x", tools }).pipe(
              Effect.catch(() => Effect.succeed("fallback" as const)),
            )
            expect(outcome).toBe("fallback")
          }),
      ),
    ),
  )

  it.instance("an unreadable answer abstains, so the caller falls back", () =>
    cleanEnv(
      withServer(
        () => Response.json({ model: "jev-latest", answers: {} }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const outcome = yield* JevTools.select(http, settings(base), { query: "x", tools }).pipe(
              Effect.catch(() => Effect.succeed("error" as const)),
            )
            expect(outcome).toBeUndefined()
          }),
      ),
    ),
  )
})
