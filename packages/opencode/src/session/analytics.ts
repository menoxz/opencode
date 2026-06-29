export * as SessionAnalytics from "./analytics"

import { Effect, Context, Layer, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session.analytics" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolUsage {
  toolName: string
  callCount: number
  totalDurationMs: number
  errorCount: number
}

export interface SessionMetrics {
  sessionId: string
  startTime: number
  endTime?: number
  totalToolCalls: number
  toolUsage: ToolUsage[]
  errors: string[]
  tokensUsed?: number
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly recordToolCall: (toolName: string, durationMs: number, success: boolean) => Effect.Effect<void>
  readonly recordError: (error: string) => Effect.Effect<void>
  readonly getMetrics: () => Effect.Effect<SessionMetrics>
  readonly reset: () => Effect.Effect<void>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionAnalytics") {}

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------

type ToolUsageState = Map<string, { count: number; totalDuration: number; errors: number }>

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const toolUsage = yield* Ref.make<ToolUsageState>(new Map())
    const errors = yield* Ref.make<string[]>([])
    const startTime = Date.now()

    const recordToolCall = Effect.fn("SessionAnalytics.recordToolCall")(function* (
      toolName: string,
      durationMs: number,
      success: boolean,
    ) {
      // No-op guard: ignore empty tool names so aggregates stay clean.
      if (!toolName) {
        log.warn("recordToolCall skipped: empty toolName")
        return
      }
      // Clamp NaN/negative durations to 0 to keep totals trustworthy.
      const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0
      yield* Ref.update(toolUsage, (map) => {
        // Mutate in place: the map is owned by this Ref and never leaked,
        // avoiding an O(n) Map copy on every tool call.
        const existing = map.get(toolName)
        if (existing) {
          existing.count += 1
          existing.totalDuration += duration
          existing.errors += success ? 0 : 1
        } else {
          map.set(toolName, { count: 1, totalDuration: duration, errors: success ? 0 : 1 })
        }
        return map
      })
      log.debug("tool call", { tool: toolName, durationMs: duration, success })
    })

    const recordError = Effect.fn("SessionAnalytics.recordError")(function* (error: string) {
      // No-op guard: skip empty/blank errors.
      if (!error || !error.trim()) return
      yield* Ref.update(errors, (e) => [...e, error])
      log.error("session error recorded", { error })
    })

    const getMetrics = Effect.fn("SessionAnalytics.getMetrics")(function* () {
      const usage = yield* Ref.get(toolUsage)
      const errs = yield* Ref.get(errors)

      const toolUsageList: ToolUsage[] = []
      for (const [name, data] of usage) {
        toolUsageList.push({
          toolName: name,
          callCount: data.count,
          totalDurationMs: data.totalDuration,
          errorCount: data.errors,
        })
      }

      const totalToolCalls = toolUsageList.reduce((sum, t) => sum + t.callCount, 0)
      log.debug("metrics snapshot", {
        tools: toolUsageList.length,
        totalToolCalls,
        errors: errs.length,
        uptimeMs: Date.now() - startTime,
      })

      return {
        sessionId: "current",
        startTime,
        endTime: Date.now(),
        totalToolCalls,
        toolUsage: toolUsageList,
        errors: errs,
      } satisfies SessionMetrics
    })

    const reset = Effect.fn("SessionAnalytics.reset")(function* () {
      yield* Ref.set(toolUsage, new Map())
      yield* Ref.set(errors, [])
      log.info("analytics reset")
    })

    return Service.of({ recordToolCall, recordError, getMetrics, reset })
  }),
)

export const defaultLayer = layer
