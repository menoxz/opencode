import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

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

/** The body of an outbound request, decoded. `schemaBodyJson` encodes it as bytes. */
const decode = (body: unknown): unknown => {
  const value = body as { _tag?: string; body?: unknown } | undefined
  if (!value) return undefined
  if (value._tag === "Raw") return value.body
  if (value.body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(value.body))
  return value.body
}

/**
 * A fake transport: no socket, no DNS, no credential.
 *
 * `decide` takes its HttpClient as an argument, so the wire contract is asserted
 * on the request the client built, instead of being observed at the far end of a
 * real connection. The old version of this file dialled a local Bun server, which
 * the provider lock now refuses — the call left for the real API and answered
 * HTTP 401 or "insufficient credits".
 */
const fake = (respond: () => Response, capture: Capture) =>
  HttpClient.make((inbound) =>
    Effect.sync(() => {
      capture.url = inbound.url
      capture.method = inbound.method
      capture.authorization = inbound.headers["authorization"]
      capture.body = decode(inbound.body)
      return HttpClientResponse.fromWeb(inbound, respond())
    }),
  )

const ENV_NAMES = [
  "JEV_API_KEY",
  "TYPESAFE_API_KEY",
  "TYPESAFE_BASE_URL",
  "TYPESAFE_MODEL",
  "COMMAND_CODE_API_KEY",
  "CODIV_API_KEY",
  "OPENCODE_GO_API_KEY",
] as const

/** Runs `effect` with every Jev variable cleared, except `vars`. */
const onlyEnv = <A, E, R>(vars: Record<string, string>, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
      for (const name of ENV_NAMES) delete process.env[name]
      for (const [name, value] of Object.entries(vars)) process.env[name] = value
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

const cleanEnv = <A, E, R>(effect: Effect.Effect<A, E, R>) => onlyEnv({}, effect)

const failure = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isSuccess(exit)) throw new Error("expected the effect to fail")
    return Cause.squash(exit.cause) as JevClient.Error
  })

describe("jev.client key precedence", () => {
  test("takes the resolved provider's key from the environment, then the config", () => {
    expect(JevClient.apiKey({ api_key: "from-config" }, { COMMAND_CODE_API_KEY: "from-env" })).toBe("from-env")
    expect(JevClient.apiKey({ api_key: "from-config" }, {})).toBe("from-config")
    expect(JevClient.apiKey(undefined, {})).toBeUndefined()
  })

  test("never authenticates a call with another host's key", () => {
    // Measured, not hypothetical: TYPESAFE_API_KEY answers HTTP 401 on every host.
    expect(JevClient.apiKey(undefined, { TYPESAFE_API_KEY: "typesafe", JEV_API_KEY: "jev" })).toBeUndefined()
    expect(JevClient.apiKey({ provider: "openjev" }, { CODIV_API_KEY: "codiv" })).toBe("codiv")
    expect(JevClient.apiKey({ provider: "openjev" }, { COMMAND_CODE_API_KEY: "code" })).toBeUndefined()
  })
})

describe("jev.client host and model", () => {
  test("defaults to the Command Code host, its route and its model", () => {
    expect(JevClient.baseUrl({}, {})).toBe(JevClient.COMMAND_CODE_BASE_URL)
    expect(JevClient.resolveEndpoint({}, {})).toBe(`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`)
    expect(JevClient.resolveModel({}, {})).toBe(JevClient.COMMAND_CODE_MODEL)
  })

  test("TYPESAFE_* variables no longer pick a host, a route or a model", () => {
    expect(JevClient.baseUrl({}, { TYPESAFE_BASE_URL: JevClient.DEFAULT_BASE_URL })).toBe(
      JevClient.COMMAND_CODE_BASE_URL,
    )
    expect(JevClient.resolveModel({}, { TYPESAFE_MODEL: JevClient.OPENJEV_MODEL })).toBe(JevClient.COMMAND_CODE_MODEL)
    expect(JevClient.resolveEndpoint({}, { TYPESAFE_BASE_URL: `${JevClient.OPENJEV_BASE_URL}/` })).toBe(
      `${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`,
    )
  })

  test("refuses a foreign host instead of dialling it", () => {
    expect(JevClient.baseUrl({ base_url: "https://custom.test" }, {})).toBe(JevClient.COMMAND_CODE_BASE_URL)
    expect(JevClient.resolveEndpoint({ endpoint: "https://custom.test/systemone" }, {})).toBe(
      `${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`,
    )
  })

  test("an explicit model still wins over the preset", () => {
    expect(JevClient.resolveModel({ model: "custom-model" }, { TYPESAFE_MODEL: "ignored" })).toBe("custom-model")
  })
})

describe("jev.client decide", () => {
  it.instance("posts map questions with the bearer key and the default model", () =>
    cleanEnv(
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(
          () =>
            Response.json({
              model: JevClient.COMMAND_CODE_MODEL,
              answers: { destructive: { type: "noul", noul: 0.07 } },
              usage: { input_tokens: 42, output_tokens: 4 },
            }),
          capture,
        )

        const response = yield* JevClient.decide(http, request, { api_key: "test-key" })

        expect(capture.method).toBe("POST")
        expect(capture.url).toBe(`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`)
        expect(capture.authorization).toBe("Bearer test-key")
        expect(capture.body).toEqual({ ...request, model: JevClient.COMMAND_CODE_MODEL })
        expect(response.answers.destructive).toEqual({ type: "noul", noul: 0.07 })
        expect(response.usage).toEqual({ input_tokens: 42, output_tokens: 4 })
      }),
    ),
  )

  it.instance("routes the openjev preset to Codiv with its own key and model", () =>
    onlyEnv(
      { CODIV_API_KEY: "codiv-key" },
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(() => Response.json({ model: JevClient.OPENJEV_MODEL, answers: {} }), capture)

        const response = yield* JevClient.decide(http, request, { provider: "openjev" })

        expect(capture.url).toBe(`${JevClient.OPENJEV_BASE_URL}/v1/systemone`)
        expect(capture.authorization).toBe("Bearer codiv-key")
        expect(capture.body).toMatchObject({ model: JevClient.OPENJEV_MODEL })
        expect(response.model).toBe(JevClient.OPENJEV_MODEL)
      }),
    ),
  )

  it.instance("honours an explicit model from the request", () =>
    cleanEnv(
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(() => Response.json({ model: "jev-1.13.0", answers: {} }), capture)

        yield* JevClient.decide(http, { ...request, model: "jev-1.13.0" }, { api_key: "test-key" })

        expect(capture.body).toMatchObject({ model: "jev-1.13.0" })
      }),
    ),
  )

  it.instance("honours an explicit model from the settings", () =>
    cleanEnv(
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(() => Response.json({ model: "jev-fast", answers: {} }), capture)

        yield* JevClient.decide(http, request, { api_key: "test-key", model: "jev-fast" })

        expect(capture.body).toMatchObject({ model: "jev-fast" })
      }),
    ),
  )

  it.instance("surfaces upstream status and detail as ApiError", () =>
    cleanEnv(
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(() => new Response("invalid token", { status: 401 }), capture)

        const error = yield* failure(JevClient.decide(http, request, { api_key: "bad" }))

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
    cleanEnv(
      Effect.gen(function* () {
        const capture: Capture = { url: "", method: "", body: undefined }
        const http = fake(() => Response.json({ model: JevClient.COMMAND_CODE_MODEL }), capture)

        const error = yield* failure(JevClient.decide(http, request, { api_key: "test-key" }))

        expect(error).toBeInstanceOf(JevClient.DecodeError)
      }),
    ),
  )

  it.instance("fails with NotConfiguredError when no key is available", () =>
    cleanEnv(
      Effect.gen(function* () {
        const http = fake(() => Response.json({ answers: {} }), { url: "", method: "", body: undefined })

        const error = yield* failure(JevClient.decide(http, request, {}))

        expect(error).toBeInstanceOf(JevClient.NotConfiguredError)
        expect(error.message).toContain("COMMAND_CODE_API_KEY")
      }),
    ),
  )

  it.instance("fails with NotConfiguredError when the configured key is empty", () =>
    cleanEnv(
      Effect.gen(function* () {
        const http = fake(() => Response.json({ answers: {} }), { url: "", method: "", body: undefined })

        const error = yield* failure(JevClient.decide(http, request, { api_key: "" }))

        expect(error).toBeInstanceOf(JevClient.NotConfiguredError)
      }),
    ),
  )
})
