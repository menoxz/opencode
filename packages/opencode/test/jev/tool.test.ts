import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent } from "../../src/agent/agent"
import { Config } from "@/config/config"
import { SessionID, MessageID } from "../../src/session/schema"
import { JevTool } from "@/tool/jev"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(FetchHttpClient.layer, Truncate.defaultLayer, Agent.defaultLayer))

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

const withServer = <A, E, R>(handler: () => Response, fn: (base: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => handler(),
      }),
    ),
    (server) => fn(server.url.origin),
    (server) => Effect.sync(() => server.stop(true)),
  )

const withConfig = <A, E, R>(info: Config.Info, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(Config.Service, TestConfig.make({ get: () => Effect.succeed(info) })))

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

const exec = Effect.fn("JevToolTest.exec")(function* (args: Tool.InferParameters<typeof JevTool>) {
  const info = yield* JevTool
  const tool = yield* info.init()
  return yield* tool.execute(args, ctx)
})

const args = {
  state: "The host is up. The user asked to remove old build artifacts from dist/.",
  questions: [
    { id: "cleanup", kind: "choice" as const, prompt: "Which directory should be removed?", options: ["dist", "src"] },
    { id: "risk", kind: "score" as const, prompt: "How risky is this action?" },
  ],
}

describe("tool.jev", () => {
  it.instance("renders typed answers with their calibrated confidence", () =>
    withServer(
      () =>
        Response.json({
          model: "jev-latest",
          answers: [
            { id: "cleanup", kind: "choice", choice: "dist", probabilities: { dist: 0.91, none: 0.09 }, confidence: 0.982 },
            { id: "risk", kind: "score", score: 0.31, confidence: 0.77 },
          ],
        }),
      (base) =>
        Effect.gen(function* () {
          const result = yield* withConfig({ jev: { api_key: "test-key", endpoint: `${base}/v1/systemone` } }, exec(args))
          expect(result.title).toBe("Jev decision (jev-latest)")
          expect(result.output).toContain("[cleanup] choice=dist confidence=0.982 probabilities={dist: 0.910, none: 0.090}")
          expect(result.output).toContain("[risk] score=0.310 confidence=0.770")
        }),
    ),
  )

  it.instance("reports a missing API key without throwing", () =>
    withoutKeys(
      Effect.gen(function* () {
        const result = yield* withConfig({}, exec(args))
        expect(result.title).toBe("Jev decision unavailable")
        expect(result.metadata).toMatchObject({ error: "JevNotConfiguredError" })
        expect(result.output).toContain("JEV_API_KEY")
      }),
    ),
  )

  it.instance("reports an upstream HTTP failure without throwing", () =>
    withServer(
      () => new Response("upstream unavailable", { status: 503 }),
      (base) =>
        Effect.gen(function* () {
          const result = yield* withConfig({ jev: { api_key: "test-key", endpoint: `${base}/v1/systemone` } }, exec(args))
          expect(result.title).toBe("Jev decision unavailable")
          expect(result.metadata).toMatchObject({ error: "JevApiError" })
          expect(result.output).toContain("HTTP 503")
        }),
    ),
  )

  it.instance("reports a malformed upstream payload without throwing", () =>
    withServer(
      () => Response.json({ model: "jev-latest" }),
      (base) =>
        Effect.gen(function* () {
          const result = yield* withConfig({ jev: { api_key: "test-key", endpoint: `${base}/v1/systemone` } }, exec(args))
          expect(result.title).toBe("Jev decision unavailable")
          expect(result.metadata).toMatchObject({ error: "JevDecodeError" })
          expect(result.output).toContain("does not match the System One schema")
        }),
    ),
  )
})
