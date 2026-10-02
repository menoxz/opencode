import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { JevSkills } from "@/jev/skills"
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

const skills = [
  { name: "bpmn-cartography-from-srs", description: "BPMN cartography from an SRS" },
  { name: "songsee", description: "Visualise a song or audio signal" },
  { name: "xlsx", description: "Create and edit Excel spreadsheets" },
]

const settings = (base: string) => ({ api_key: "test-key", endpoint: `${base}/v1/systemone` })

describe("jev.skills end to end", () => {
  it.instance("injects exactly the skills Jev affirms, with no fixed cap", () =>
    cleanEnv(
      withServer(
        () =>
          Response.json({
            model: "jev-latest",
            answers: {
              "bpmn-cartography-from-srs": { type: "noul", noul: 0.93 },
              songsee: { type: "noul", noul: 0.04 },
              xlsx: { type: "noul", noul: 0.51 },
            },
          }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const chosen = yield* JevSkills.select(http, settings(base), {
              prompt: "Crée la cartographie BPMN du service à partir du SRS.",
              skills,
            })
            expect(chosen).toEqual(["bpmn-cartography-from-srs", "xlsx"])
          }),
      ),
    ),
  )

  it.instance("Jev may select nothing — a valid total rejection, not an error", () =>
    cleanEnv(
      withServer(
        () =>
          Response.json({
            model: "jev-latest",
            answers: {
              "bpmn-cartography-from-srs": { type: "noul", noul: 0.2 },
              songsee: { type: "noul", noul: 0.1 },
              xlsx: { type: "noul", noul: 0.05 },
            },
          }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const chosen = yield* JevSkills.select(http, settings(base), { prompt: "merci", skills })
            expect(chosen).toEqual([])
          }),
      ),
    ),
  )

  it.instance("an HTTP failure surfaces, so the caller keeps the deterministic ranking", () =>
    cleanEnv(
      withServer(
        () => new Response("boom", { status: 500 }),
        (base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const outcome = yield* JevSkills.select(http, settings(base), { prompt: "x", skills }).pipe(
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
            const outcome = yield* JevSkills.select(http, settings(base), { prompt: "x", skills }).pipe(
              Effect.catch(() => Effect.succeed("error" as const)),
            )
            expect(outcome).toBeUndefined()
          }),
      ),
    ),
  )
})
