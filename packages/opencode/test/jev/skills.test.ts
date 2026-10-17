import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevClient } from "@/jev/client"
import { JevSkills } from "@/jev/skills"

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

/** The body of an outbound request, decoded. `schemaBodyJson` encodes it as bytes. */
const decode = (body: unknown): { questions: Record<string, unknown> } => {
  const value = body as { _tag?: string; body?: unknown } | undefined
  const payload =
    value === undefined
      ? undefined
      : value._tag === "Raw"
        ? value.body
        : value.body instanceof Uint8Array
          ? JSON.parse(new TextDecoder().decode(value.body))
          : value.body
  return (payload ?? { questions: {} }) as { questions: Record<string, unknown> }
}

/**
 * A fake transport: no socket, no DNS, no credential.
 *
 * `JevSkills.select` takes its HttpClient as an argument, so the whole selection
 * runs in memory. The provider lock refuses every host that is not one of its
 * three presets, so a local Bun server can no longer stand in for the endpoint:
 * the call used to leave for the real API with a fake key.
 */
const host = (respond: (body: { questions: Record<string, unknown> }) => Response) => {
  const seen: string[] = []
  const bodies: { questions: Record<string, unknown> }[] = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const body = decode(request.body)
      seen.push(request.url)
      bodies.push(body)
      return HttpClientResponse.fromWeb(request, respond(body))
    }),
  )
  return { client, seen, bodies }
}

const skills = [
  { name: "bpmn-cartography-from-srs", description: "BPMN cartography from an SRS" },
  { name: "songsee", description: "Visualise a song or audio signal" },
  { name: "xlsx", description: "Create and edit Excel spreadsheets" },
]

const settings = { api_key: "test-key" }

describe("jev.skills end to end", () => {
  test("injects exactly the skills Jev affirms, with no fixed cap", () =>
    run(
      Effect.gen(function* () {
        const { client, seen } = host(
          () =>
            Response.json({
              model: "jev-latest",
              answers: {
                "bpmn-cartography-from-srs": { type: "noul", noul: 0.93 },
                songsee: { type: "noul", noul: 0.04 },
                xlsx: { type: "noul", noul: 0.51 },
              },
            }),
        )
        const chosen = yield* JevSkills.select(client, settings, {
          prompt: "Crée la cartographie BPMN du service à partir du SRS.",
          skills,
        })
        expect(chosen).toEqual(["bpmn-cartography-from-srs", "xlsx"])
        expect(seen).toEqual([`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`])
      }),
    ),
  )

  test("Jev may select nothing — a valid total rejection, not an error", () =>
    run(
      Effect.gen(function* () {
        const { client } = host(
          () =>
            Response.json({
              model: "jev-latest",
              answers: {
                "bpmn-cartography-from-srs": { type: "noul", noul: 0.2 },
                songsee: { type: "noul", noul: 0.1 },
                xlsx: { type: "noul", noul: 0.05 },
              },
            }),
        )
        const chosen = yield* JevSkills.select(client, settings, { prompt: "merci", skills })
        expect(chosen).toEqual([])
      }),
    ),
  )

  test("an HTTP failure is contained, so the caller keeps the deterministic ranking", () =>
    run(
      Effect.gen(function* () {
        const { client } = host(() => new Response("boom", { status: 500 }))
        const outcome = yield* JevSkills.select(client, settings, { prompt: "x", skills }).pipe(
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
        const outcome = yield* JevSkills.select(client, settings, { prompt: "x", skills }).pipe(
          Effect.catch(() => Effect.succeed("error" as const)),
        )
        expect(outcome).toBeUndefined()
      }),
    ),
  )

  // Regression: Command Code GOAT rejects "at most 20 questions per call". A
  // ~200-skill catalogue sent as one request always answered HTTP 400, the
  // caller caught it and fell back to the lexical ranking, so Jev filtering was
  // inert in production. The selection must be split instead.
  test("splits a large catalogue into batches of at most 20 questions", () =>
    run(
      Effect.gen(function* () {
        const { client, seen, bodies } = host((body) =>
          Response.json({
            model: "jev-latest",
            answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }])),
          }),
        )
        const many = Array.from({ length: 25 }, (_, index) => ({
          name: `skill-${index}`,
          description: `Skill ${index}`,
        }))
        const chosen = yield* JevSkills.select(client, settings, { prompt: "x", skills: many })
        expect(chosen).toHaveLength(25)
        const sizes = bodies.map((body) => Object.keys(body.questions).length)
        expect(Math.max(...sizes)).toBeLessThanOrEqual(20)
        expect(sizes.reduce((total, size) => total + size, 0)).toBe(25)
        expect(new Set(seen)).toEqual(new Set([`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`]))
      }),
    ),
  )
})
