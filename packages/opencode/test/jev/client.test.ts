import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(FetchHttpClient.layer))

const request: JevSchema.Request = {
  state: "The host is up and the user asked to delete old build artifacts.",
  questions: [{ id: "destructive", kind: "noul", prompt: "Is the action destructive?" }],
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

const withoutKeys = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const saved = { jev: process.env.JEV_API_KEY, typesafe: process.env.TYPESAFE_API_KEY }
      delete process.env.JEV_API_KEY
      delete process.env.TYPESAFE_API_KEY
      return saved
    }),
    () => effect,
    (saved) =>
      Effect.sync(() => {
        if (saved.jev !== undefined) process.env.JEV_API_KEY = saved.jev
        if (saved.typesafe !== undefined) process.env.TYPESAFE_API_KEY = saved.typesafe
      }),
  )

const failure = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isSuccess(exit)) throw new Error("expected the effect to fail")
    return Cause.squash(exit.cause) as JevClient.Error
  })

describe("jev.client", () => {
  test("prefers the environment key over the configured one", () => {
    expect(JevClient.apiKey({ api_key: "from-config" }, { JEV_API_KEY: "from-env" })).toBe("from-env")
    expect(JevClient.apiKey({ api_key: "from-config" }, { TYPESAFE_API_KEY: "typesafe" })).toBe("typesafe")
    expect(JevClient.apiKey({ api_key: "from-config" }, {})).toBe("from-config")
    expect(JevClient.apiKey(undefined, {})).toBeUndefined()
  })

  it.instance("posts typed questions with the bearer key and the default model", () =>
    withServer(
      () =>
        Response.json({
          model: "jev-latest",
          answers: [{ id: "destructive", kind: "noul", noul: false, confidence: 0.93 }],
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
          expect(response.answers[0]).toEqual({ id: "destructive", kind: "noul", noul: false, confidence: 0.93 })
        }),
    ),
  )

  it.instance("fails with NotConfiguredError when no key is available", () =>
    withoutKeys(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const error = yield* failure(JevClient.decide(http, request, {}))
        expect(error).toBeInstanceOf(JevClient.NotConfiguredError)
        expect(error.message).toContain("JEV_API_KEY")
      }),
    ),
  )

  it.instance("fails with NotConfiguredError when the configured key is empty", () =>
    withoutKeys(
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
      () => Response.json({ model: "jev-1.13.0", answers: [] }),
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
