import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Agent } from "../../src/agent/agent"
import { Config } from "@/config/config"
import { JevClient } from "@/jev/client"
import { SessionID, MessageID } from "../../src/session/schema"
import { JevTool } from "@/tool/jev"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

/**
 * A fake transport: no socket, no DNS, no credential.
 *
 * `JevTool` takes its HttpClient from the ambient context instead of receiving
 * one, so the fake is installed as the layer's `HttpClient` and `respond` is
 * swapped per test. The provider lock refuses every host that is not one of its
 * three presets, so a local Bun server can no longer stand in for the endpoint:
 * the call used to leave for the real API with a fake key.
 */
let respond: () => Response = () => new Response("no fake reply configured", { status: 500 })

type Capture = { url: string; authorization?: string; body?: unknown }
const seen: Capture[] = []

const http = HttpClient.make((request) =>
  Effect.sync(() => {
    seen.push({ url: request.url, authorization: request.headers["authorization"], body: decode(request.body) })
    return HttpClientResponse.fromWeb(request, respond())
  }),
)

/** The body of an outbound request, decoded. `schemaBodyJson` encodes it as bytes. */
function decode(body: unknown): unknown {
  const value = body as { _tag?: string; body?: unknown } | undefined
  if (!value) return undefined
  if (value._tag === "Raw") return value.body
  if (value.body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(value.body))
  return value.body
}

const dialled = () => seen[seen.length - 1]

const it = testEffect(Layer.mergeAll(Layer.succeed(HttpClient.HttpClient, http), Truncate.defaultLayer, Agent.defaultLayer))

const ctx = {
  sessionID: SessionID.make("ses_jev"),
  messageID: MessageID.make("msg_jev"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const ENV_NAMES = ["JEV_API_KEY", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "TYPESAFE_MODEL", "COMMAND_CODE_API_KEY"] as const

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

const withConfig = <A, E, R>(info: Config.Info, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(Config.Service, TestConfig.make({ get: () => Effect.succeed(info) })))

const exec = Effect.fn("JevToolTest.exec")(function* (args: Tool.InferParameters<typeof JevTool>) {
  const info = yield* JevTool
  const tool = yield* info.init()
  return yield* tool.execute(args, ctx)
})

const args: Tool.InferParameters<typeof JevTool> = {
  state: "The host is up. The user asked to remove old build artifacts from dist/.",
  questions: {
    cleanup: {
      type: "choice",
      instructions: "Which directory should be removed?",
      criteria: { dist: "Build output that can be regenerated.", src: "Hand written sources." },
    },
    risk: {
      type: "score",
      instructions: "How risky is this action?",
      criteria: ["Safe and reversible.", "Destructive and irreversible."],
    },
  },
}

describe("tool.jev", () => {
  it.instance("renders typed answers with their probabilities and confidence", () =>
    cleanEnv(
      Effect.gen(function* () {
        respond = () =>
          Response.json({
            model: "jev-latest",
            answers: {
              cleanup: { type: "choice", choice: "dist", probabilities: { dist: 0.91, none: 0.09 }, confidence: 0.982 },
              risk: { type: "score", score: 0.31, confidence: 0.77 },
            },
          })
        const result = yield* withConfig({ jev: { api_key: "test-key" } }, exec(args))
        expect(result.title).toBe("Jev decision (jev-latest)")
        expect(result.output).toContain("[cleanup] choice=dist confidence=0.982 probabilities={dist: 0.910, none: 0.090}")
        expect(result.output).toContain("[risk] score=0.310 confidence=0.770")
        expect(dialled()?.url).toBe(`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`)
      }),
    ),
  )

  it.instance("renders a noul answer as a probability with no confidence", () =>
    cleanEnv(
      Effect.gen(function* () {
        respond = () => Response.json({ model: "jev-latest", answers: { destructive: { type: "noul", noul: 0.93 } } })
        const result = yield* withConfig(
          { jev: { api_key: "test-key" } },
          exec({
            state: args.state,
            questions: { destructive: { type: "noul", instructions: "Is the action destructive?" } },
          }),
        )
        expect(result.output).toContain("[destructive] noul=0.930 (probability yes)")
      }),
    ),
  )

  // The environment can no longer choose a host or a model: every provider is a
  // locked preset, and only the resolved provider's own variable authenticates
  // it. With COMMAND_CODE_API_KEY and no config, the tool dials the Command Code
  // endpoint with the preset's model.
  it.instance("dials the locked host with the environment key when config carries no key", () =>
    withEnv(
      { COMMAND_CODE_API_KEY: "env-key" },
      Effect.gen(function* () {
        respond = () =>
          Response.json({ model: JevClient.COMMAND_CODE_MODEL, answers: { cleanup: { type: "choice", choice: "dist", confidence: 0.9 } } })
        const result = yield* withConfig({}, exec(args))
        expect(result.title).toBe(`Jev decision (${JevClient.COMMAND_CODE_MODEL})`)
        expect(result.output).toContain("[cleanup] choice=dist")
        const request = dialled()
        expect(request?.url).toBe(`${JevClient.COMMAND_CODE_BASE_URL}/v1/systemone`)
        expect(request?.authorization).toBe("Bearer env-key")
        expect(request?.body).toMatchObject({ model: JevClient.COMMAND_CODE_MODEL })
      }),
    ),
  )

  it.instance("reports a missing API key without throwing", () =>
    cleanEnv(
      Effect.gen(function* () {
        const result = yield* withConfig({}, exec(args))
        expect(result.title).toBe("Jev decision unavailable")
        expect(result.metadata).toMatchObject({ error: "JevNotConfiguredError" })
        expect(result.output).toContain(JevClient.PROVIDER_ENV_KEY)
      }),
    ),
  )

  it.instance("reports an upstream HTTP failure without throwing", () =>
    cleanEnv(
      Effect.gen(function* () {
        respond = () => new Response("upstream unavailable", { status: 503 })
        const result = yield* withConfig({ jev: { api_key: "test-key" } }, exec(args))
        expect(result.title).toBe("Jev decision unavailable")
        expect(result.metadata).toMatchObject({ error: "JevApiError" })
        expect(result.output).toContain("HTTP 503")
      }),
    ),
  )

  it.instance("reports a malformed upstream payload without throwing", () =>
    cleanEnv(
      Effect.gen(function* () {
        respond = () => Response.json({ model: "jev-latest" })
        const result = yield* withConfig({ jev: { api_key: "test-key" } }, exec(args))
        expect(result.title).toBe("Jev decision unavailable")
        expect(result.metadata).toMatchObject({ error: "JevDecodeError" })
        expect(result.output).toContain("does not match the System One schema")
      }),
    ),
  )
})
