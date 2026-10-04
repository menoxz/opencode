import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { SessionID } from "./schema"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Effect, Layer, Context, Schema } from "effect"

export const Info = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("idle"),
  }),
  Schema.Struct({
    type: Schema.Literal("retry"),
    attempt: NonNegativeInt,
    message: Schema.String,
    action: Schema.optional(
      Schema.Struct({
        reason: Schema.String,
        provider: Schema.String,
        title: Schema.String,
        message: Schema.String,
        label: Schema.String,
        link: Schema.optional(Schema.String),
      }),
    ),
    next: NonNegativeInt,
  }),
  Schema.Struct({
    type: Schema.Literal("busy"),
  }),
]).annotate({ identifier: "SessionStatus" })
export type Info = Schema.Schema.Type<typeof Info>

export const Event = {
  Status: BusEvent.define(
    "session.status",
    Schema.Struct({
      sessionID: SessionID,
      status: Info,
    }),
  ),
  // deprecated
  Idle: BusEvent.define(
    "session.idle",
    Schema.Struct({
      sessionID: SessionID,
    }),
  ),
}

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Map<SessionID, Info>>
  readonly set: (sessionID: SessionID, status: Info) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionStatus") {}

function sameAction(a: Extract<Info, { type: "retry" }>["action"], b: Extract<Info, { type: "retry" }>["action"]) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.reason === b.reason &&
    a.provider === b.provider &&
    a.title === b.title &&
    a.message === b.message &&
    a.label === b.label &&
    a.link === b.link
  )
}

function sameStatus(a: Info, b: Info) {
  if (a.type !== b.type) return false
  if (a.type === "retry" && b.type === "retry") {
    return a.attempt === b.attempt && a.message === b.message && a.next === b.next && sameAction(a.action, b.action)
  }
  return true
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service

    const state = yield* InstanceState.make(
      Effect.fn("SessionStatus.state")(() => Effect.succeed(new Map<SessionID, Info>())),
    )

    const get = Effect.fn("SessionStatus.get")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      return data.get(sessionID) ?? { type: "idle" as const }
    })

    const transitionAt = new Map<SessionID, number>()

    const list = Effect.fn("SessionStatus.list")(function* () {
      return new Map(yield* InstanceState.get(state))
    })

    const set = Effect.fn("SessionStatus.set")(function* (sessionID: SessionID, status: Info) {
      const data = yield* InstanceState.get(state)
      const previous = data.get(sessionID) ?? { type: "idle" as const }
      const now = Date.now()
      const previousStatusMs = transitionAt.has(sessionID) ? now - transitionAt.get(sessionID)! : undefined
      if (sameStatus(previous, status)) {
        yield* Effect.logDebug("session status unchanged").pipe(
          Effect.annotateLogs({
            sessionID,
            status: status.type,
            unchangedForMs: previousStatusMs,
          }),
        )
        return
      }

      yield* Effect.logDebug("session status transition").pipe(
        Effect.annotateLogs({
          sessionID,
          from: previous.type,
          to: status.type,
          previousStatusMs,
        }),
      )
      yield* bus.publish(Event.Status, { sessionID, status })
      if (status.type === "idle") {
        yield* bus.publish(Event.Idle, { sessionID })
        data.delete(sessionID)
        transitionAt.delete(sessionID)
        return
      }
      data.set(sessionID, status)
      transitionAt.set(sessionID, now)
    })

    return Service.of({ get, list, set })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Bus.layer))

export * as SessionStatus from "./status"
