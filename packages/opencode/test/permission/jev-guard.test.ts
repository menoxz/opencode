import { describe, expect } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Bus } from "../../src/bus"
import { Config } from "@/config/config"
import { Permission } from "../../src/permission"
import { InstanceBootstrap } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { SessionID } from "../../src/session/schema"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

// The layer closure reads this binding on every `Config.get()`, so each test
// declares the guard settings it needs before calling `ask`.
let config: Config.Info = {}

const bus = Bus.layer
const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const env = Layer.mergeAll(
  Permission.layer.pipe(Layer.provide(bus)),
  bus,
  CrossSpawnSpawner.defaultLayer,
  InstanceStore.defaultLayer.pipe(Layer.provide(noopBootstrap)),
  FetchHttpClient.layer,
  TestConfig.layer({ get: () => Effect.succeed(config) }),
)
const it = testEffect(env)

const ask = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.ask(input)
  })

const rejectAll = () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    for (const req of yield* permission.list()) {
      yield* permission.reply({ requestID: req.id, reply: "reject" })
    }
  })

const waitForPending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* Effect.gen(function* () {
      while (true) {
        const list = yield* permission.list()
        if (list.length === count) return list
        yield* Effect.sleep("10 millis")
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: "2 seconds",
        orElse: () => Effect.fail(new Error(`timed out waiting for ${count} pending permission request(s)`)),
      }),
    )
  })

const askSilently = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  ask(input).pipe(
    Effect.timeoutOrElse({
      duration: "2 seconds",
      orElse: () => Effect.fail(new Error("ask did not resolve: an action that should have auto-approved was escalated")),
    }),
  )

const askEscalated = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const fiber = yield* ask(input).pipe(Effect.forkScoped)
    const items = yield* waitForPending(1)
    yield* rejectAll()
    yield* Fiber.await(fiber)
    return items
  })

type Decision = { noul?: boolean; confidence?: number; status?: number }

const withJev = <A, E, R>(decision: Decision, fn: (base: string, requests: unknown[]) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const requests: unknown[] = []
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: async (inbound) => {
          const payload = (await inbound.json()) as { state: string; questions: Array<{ id: string; kind: string }> }
          requests.push(payload)
          if (decision.status && decision.status >= 400) return new Response("upstream failure", { status: decision.status })
          return Response.json({
            model: "jev-latest",
            answers: payload.questions.map((question) => ({
              id: question.id,
              kind: question.kind,
              noul: decision.noul,
              confidence: decision.confidence ?? 0.95,
            })),
          })
        },
      })
      return { requests, server }
    }),
    ({ requests, server }) => fn(server.url.origin, requests),
    ({ server }) => Effect.sync(() => server.stop(true)),
  )

const write = {
  sessionID: SessionID.make("ses_jev_guard"),
  permission: "write",
  patterns: ["dist/app.js"],
  metadata: { filePath: "dist/app.js" },
  always: [],
  ruleset: [{ permission: "write", pattern: "*", action: "allow" }],
} as const

describe("permission.jev-guard", () => {
  it.instance(
    "keeps an auto-allowed action silent when the guard is off",
    () =>
      Effect.gen(function* () {
        config = {}
        expect(yield* askSilently(write)).toBeUndefined()
      }),
    { git: true },
  )

  it.instance(
    "keeps an auto-allowed action silent when Jev confidently endorses it",
    () =>
      withJev({ noul: false, confidence: 0.97 }, (base, requests) =>
        Effect.gen(function* () {
          config = { jev: { api_key: "test-key", endpoint: `${base}/v1/systemone`, guard: { enabled: true } } }
          expect(yield* askSilently(write)).toBeUndefined()
          expect(requests).toHaveLength(1)
          expect(requests[0]).toMatchObject({ questions: [{ id: "unsafe_to_auto_approve", kind: "noul" }] })
        }),
      ),
    { git: true },
  )

  it.instance(
    "escalates an auto-allowed action Jev flags as unsafe",
    () =>
      withJev({ noul: true, confidence: 0.99 }, (base) =>
        Effect.gen(function* () {
          config = { jev: { api_key: "test-key", endpoint: `${base}/v1/systemone`, guard: { enabled: true } } }
          const items = yield* askEscalated(write)
          expect(items[0]).toMatchObject({ permission: "write", patterns: ["dist/app.js"] })
        }),
      ),
    { git: true },
  )

  it.instance(
    "escalates an auto-allowed action below the confidence threshold",
    () =>
      withJev({ noul: false, confidence: 0.4 }, (base) =>
        Effect.gen(function* () {
          config = { jev: { api_key: "test-key", endpoint: `${base}/v1/systemone`, guard: { enabled: true } } }
          const items = yield* askEscalated(write)
          expect(items[0].permission).toBe("write")
        }),
      ),
    { git: true },
  )

  it.instance(
    "respects a caller supplied threshold",
    () =>
      withJev({ noul: false, confidence: 0.4 }, (base) =>
        Effect.gen(function* () {
          config = {
            jev: { api_key: "test-key", endpoint: `${base}/v1/systemone`, guard: { enabled: true, threshold: 0.3 } },
          }
          expect(yield* askSilently(write)).toBeUndefined()
        }),
      ),
    { git: true },
  )

  it.instance(
    "falls back to asking when Jev is unreachable",
    () =>
      withJev({ status: 503 }, (base) =>
        Effect.gen(function* () {
          config = { jev: { api_key: "test-key", endpoint: `${base}/v1/systemone`, guard: { enabled: true } } }
          const items = yield* askEscalated(write)
          expect(items[0].permission).toBe("write")
        }),
      ),
    { git: true },
  )

  it.instance(
    "leaves permissions outside the guarded list alone",
    () =>
      Effect.gen(function* () {
        config = { jev: { api_key: "test-key", endpoint: "http://127.0.0.1:1/v1/systemone", guard: { enabled: true } } }
        const result = yield* askSilently({
          sessionID: SessionID.make("ses_jev_guard"),
          permission: "read",
          patterns: ["dist/app.js"],
          metadata: {},
          always: [],
          ruleset: [{ permission: "read", pattern: "*", action: "allow" }],
        })
        expect(result).toBeUndefined()
      }),
    { git: true },
  )
})
