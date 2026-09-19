import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(FetchHttpClient.layer))

const request: JevSchema.Request = {
  state: "The host is up and the user asked to delete old build artifacts.",
  questions: {
    destructive: {
      type: "noul",
      instructions: "Is the action destructive?",
      criteria: { true: "It deletes unrecoverable data.", false: "It only removes regenerable output." },
    },
  },
}

type Capture = { url: string; method: string; authorization?: string; body: unknown }

const withServer = <A, E, R>(
  handler: () => Response,
  fn: (capture: Capture, base: string) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const capture: Capture = { url: "", method: "", body: undefined }
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: async (inbound) => {
          capture.url = inbound.url
          capture.method = inbound.method
          capture.authorization = inbound.headers.get("authorization") ?? undefined
          capture.body = await inbound.json()
          return handler()
        },
      })
      return { capture, server }
    }),
    ({ capture, server }) => fn(capture, server.url.origin),
    ({ server }) => Effect.sync(() => server.stop(true)),
  )

const ENV_NAMES = ["JEV_API_KEY", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "TYPESAFE_MODEL"] as const

/** Runs `effect` with the Jev environment variables set to the given values. */
const withEnv = <A, E, R>(vars: Record<string, string | undefined>, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
      for (const [name, value] of Object.entries(vars)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
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

const cleanEnv = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withEnv(Object.fromEntries(ENV_NAMES.map((name) => [name, undefined])), effect)

const failure = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isSuccess(exit)) throw new Error("expected the effect to fail")
    return Cause.squash(exit.cause) as JevClient.Error
  })

describe("jev.client", () => {
  test("prefers the environment key over the configured one", () => {
    expect(JevClient.apiKey({ api_key: "from-config" }, { TYPESAFE_API_KEY: "from-env" })).toBe("from-env")
    expect(JevClient.apiKey({ api_key: "from-config" }, { JEV_API_KEY: "typesafe" })).toBe("typesafe")
    expect(JevClient.apiKey({ api_key: "from-config" }, {})).toBe("from-config")
    expect(JevClient.apiKey(undefined, {})).toBeUndefined()
  })

  test("resolves the base URL, endpoint and model from config and environment", () => {
    expect(JevClient.baseUrl({}, {})).toBe(JevClient.DEFAULT_BASE_URL)
    expect(JevClient.baseUrl({}, { TYPESAFE_BASE_URL: "https://api.codiv.ai" })).toBe("https://api.codiv.ai")
    expect(JevClient.baseUrl({ base_url: "https://custom.test" }, { TYPESAFE_BASE_URL: "https://api.codiv.ai" })).toBe(
      "https://custom.test",
    )
    expect(JevClient.resolveEndpoint({}, {})).toBe(`${JevClient.DEFAULT_BASE_URL}/v1/systemone`)
    expect(JevClient.resolveEndpoint({}, { TYPESAFE_BASE_URL: "https://api.codiv.ai/" })).toBe(
      "https://api.codiv.ai/v1/systemone",
    )
    expect(JevClient.resolveEndpoint({ endpoint: "https://custom.test/systemone" }, {})).toBe(
      "https://custom.test/systemone",
    )
    expect(JevClient.resolveModel({}, {})).toBe(JevClient.DEFAULT_MODEL)
    expect(JevClient.resolveModel({}, { TYPESAFE_BASE_URL: JevClient.OPENJEV_BASE_URL })).toBe(JevClient.OPENJEV_MODEL)
    expect(JevClient.resolveModel({}, { TYPESAFE_BASE_URL: "https://api.codiv.ai/" })).toBe(JevClient.OPENJEV_MODEL)
    expect(JevClient.resolveModel({}, { TYPESAFE_MODEL: "openjev-latest" })).toBe("openjev-latest")
    expect(JevClient.resolveModel({ model: "custom-model" }, { TYPESAFE_MODEL: "ignored" })).toBe("custom-model")
  })

  it.instance("posts map questions with the bearer key and the default model", () =>
    cleanEnv(
      withServer(
        () =>
          Response.json({
            model: "jev-latest",
            answers: { destructive: { type: "noul", noul: 0.07 } },
            usage: { input_tokens: 42, output_tokens: 4 },
          }),
        (capture, base) =>
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const response = yield* JevClient.decide(http, request, {
              api_key: "test-key",
              endpoint: `${base}/v1/systemone`,
            })

            expect(capture.method).toBe("POST")
            expect(capture.url).toBe(`${base}/v1/systemone`)
            expect(capture.authorization).toBe("Bearer test-key")
            expect(capture.body).toEqual({ ...request, model: JevClient.DEFAULT_MODEL })
            expect(response.answers.destructive).toEqual({ type: "noul", noul: 0.07 })
            expect(response.usage).toEqual({ input_tokens: 42, output_tokens: 4 })
          }),
      ),
    ),
  )

  it.instance("takes the base URL, key and model from the environment", () =>
    withServer(
      () => Response.json({ model: "openjev-latest", answers: { destructive: { type: "noul", noul: 0.4 } } }),
      (capture, base) =>
        withEnv(
          { TYPESAFE_API_KEY: "env-key", TYPESAFE_BASE_URL: base, TYPESAFE_MODEL: "openjev-latest" },
          Effect.gen(function* () {
            const http = yield* HttpClient.HttpClient
            const response = yield* JevClient.decide(http, request, {})

            expect(capture.url).toBe(`${base}/v1/systemone`)
            expect(capture.authorization).toBe("Bearer env-key")
            expect(capture.body).toMatchObject({ model: "openjev-latest" })
            expect(response.model).toBe("openjev-latest")
          }),
        ),
    ),
  )

  it.instance("fails with NotConfiguredError when no key is available", () =>
    cleanEnv(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const error = yield* failure(JevClient.decide(http, request, {}))
        expect(error).toBeInstanceOf(JevClient.NotConfiguredError)
        expect(error.message).toContain("TYPESAFE_API_KEY")
      }),
    ),
  )

  it.instance("fails with NotConfiguredError when the configured key is empty", () =>
    cleanEnv(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const error = yield* failure(JevClient.decide(http, request, { api_key: "" }))
        expect(error).toBeInstanceOf(JevClient.NotConfiguredError)
      }),
    ),
  )

  it.instance("surfaces upstream status and detail as ApiError", () =>
    withServer(
      () => new Response("invalid token", { status: 401 }),
      (capture, base) =>
        Effect.gen(function* () {
          const http = yield* HttpClient.HttpClient
          const error = yield* failure(JevClient.decide(http, request, { api_key: "bad", endpoint: `${base}/v1/systemone` }))
          expect(error).toBeInstanceOf(JevClient.ApiError)
          if (error instanceof JevClient.ApiError) {
            expect(error.status).toBe(401)
            expect(error.detail).toBe("invalid token")
            expect(error.message).toContain("HTTP 401")
          }
        }),
    ),
  )

  it.instance("rejects a payload that does not match the System One schema", () =>
    withServer(
      () => Response.json({ model: "jev-latest" }),
      (capture, base) =>
        Effect.gen(function* () {
          const http = yield* HttpClient.HttpClient
          const error = yield* failure(JevClient.decide(http, request, { api_key: "test-key", endpoint: `${base}/v1/systemone` }))
          expect(error).toBeInstanceOf(JevClient.DecodeError)
        }),
    ),
  )

  it.instance("honours an explicit model override", () =>
    withServer(
      () => Response.json({ model: "jev-1.13.0", answers: {} }),
      (capture, base) =>
        Effect.gen(function* () {
          const http = yield* HttpClient.HttpClient
          yield* JevClient.decide(http, { ...request, model: "jev-1.13.0" }, {
            api_key: "test-key",
            endpoint: `${base}/v1/systemone`,
          })
          expect(capture.body).toMatchObject({ model: "jev-1.13.0" })
        }),
    ),
  )
})
