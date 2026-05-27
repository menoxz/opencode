/**
 * Eval Metrics — collect, aggregate, and compare evaluation metrics.
 *
 * @module eval/metrics
 */

import { Effect, Context, Layer, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import type { ScenarioResult } from "./scenario"

const log = Log.create({ service: "eval.metrics" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated metrics for a single scenario across multiple runs. */
export interface ScenarioMetrics {
  scenarioId: string
  scenarioName: string
  runs: number
  successes: number
  successRate: number
  avgDurationMs: number
  avgTokensUsed: number
  avgToolCalls: number
  totalErrors: number
  lastRunAt: number
}

/** Aggregate metrics for an entire eval suite. */
export interface EvalRunReport {
  runId: string
  suiteId: string
  suiteName: string
  timestamp: number
  durationMs: number
  totalScenarios: number
  passed: number
  failed: number
  passRate: number
  avgDurationPerScenario: number
  totalTokensUsed: number
  totalToolCalls: number
  scenarios: ScenarioResult[]
  metrics: ScenarioMetrics[]
}

/** Comparison between two eval runs. */
export interface EvalComparison {
  baseline: { runId: string; timestamp: number; passRate: number; avgDurationMs: number }
  current: { runId: string; timestamp: number; passRate: number; avgDurationMs: number }
  passRateDelta: number
  durationDelta: number
  improved: string[]
  regressed: string[]
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly recordRun: (results: ScenarioResult[], suiteId: string, suiteName: string) => Effect.Effect<EvalRunReport>
  readonly getScenarioMetrics: (scenarioId: string) => Effect.Effect<ScenarioMetrics | null>
  readonly listReports: (limit?: number) => Effect.Effect<EvalRunReport[]>
  readonly getReport: (runId: string) => Effect.Effect<EvalRunReport | null>
  readonly compare: (runIdA: string, runIdB: string) => Effect.Effect<EvalComparison | null>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/EvalMetrics") {}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface RunState {
  reports: EvalRunReport[]
  scenarioHistory: Map<string, ScenarioMetrics>
}

function generateRunId(): string {
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildScenarioMetrics(scenarios: ScenarioResult[]): ScenarioMetrics[] {
  const byId = new Map<string, { name: string; results: ScenarioResult[] }>()
  for (const s of scenarios) {
    const entry = byId.get(s.scenarioId) ?? { name: s.scenarioName, results: [] }
    entry.results.push(s)
    byId.set(s.scenarioId, entry)
  }

  const metrics: ScenarioMetrics[] = []
  for (const [id, entry] of byId) {
    const successes = entry.results.filter((r) => r.success).length
    metrics.push({
      scenarioId: id,
      scenarioName: entry.name,
      runs: entry.results.length,
      successes,
      successRate: entry.results.length > 0 ? successes / entry.results.length : 0,
      avgDurationMs: Math.round(
        entry.results.reduce((s, r) => s + r.durationMs, 0) / entry.results.length,
      ),
      avgTokensUsed: Math.round(
        entry.results.reduce((s, r) => s + r.tokensUsed, 0) / entry.results.length,
      ),
      avgToolCalls: Math.round(
        (entry.results.reduce((s, r) => s + r.toolCalls, 0) / entry.results.length) * 10,
      ) / 10,
      totalErrors: entry.results.reduce((s, r) => s + r.errors.length, 0),
      lastRunAt: Math.max(...entry.results.map((r) => r.completedAt)),
    })
  }

  return metrics
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* Ref.make<RunState>({ reports: [], scenarioHistory: new Map() })

    const recordRun: Interface["recordRun"] = (results, suiteId, suiteName) =>
      Effect.gen(function* () {
        const runId = generateRunId()
        const passed = results.filter((r) => r.success).length
        const failed = results.length - passed
        const totalDuration = results.reduce((s: number, r: ScenarioResult) => s + r.durationMs, 0)
        const totalTokens = results.reduce((s: number, r: ScenarioResult) => s + r.tokensUsed, 0)
        const totalTools = results.reduce((s: number, r: ScenarioResult) => s + r.toolCalls, 0)

        const metrics = buildScenarioMetrics(results)

        const report: EvalRunReport = {
          runId,
          suiteId,
          suiteName,
          timestamp: Date.now(),
          durationMs: totalDuration,
          totalScenarios: results.length,
          passed,
          failed,
          passRate: results.length > 0 ? passed / results.length : 0,
          avgDurationPerScenario: results.length > 0 ? Math.round(totalDuration / results.length) : 0,
          totalTokensUsed: totalTokens,
          totalToolCalls: totalTools,
          scenarios: results,
          metrics,
        }

        yield* Ref.update(state, (s: RunState) => {
          const nextHistory = new Map(s.scenarioHistory)
          for (const m of metrics) {
            const existing = nextHistory.get(m.scenarioId)
            if (existing) {
              nextHistory.set(m.scenarioId, {
                ...m,
                runs: existing.runs + m.runs,
                successes: existing.successes + m.successes,
                successRate: (existing.successes + m.successes) / (existing.runs + m.runs),
                avgDurationMs: Math.round(
                  (existing.avgDurationMs * existing.runs + m.avgDurationMs * m.runs) /
                    (existing.runs + m.runs),
                ),
                avgTokensUsed: Math.round(
                  (existing.avgTokensUsed * existing.runs + m.avgTokensUsed * m.runs) /
                    (existing.runs + m.runs),
                ),
                avgToolCalls:
                  Math.round(
                    ((existing.avgToolCalls * existing.runs + m.avgToolCalls * m.runs) /
                      (existing.runs + m.runs)) * 10,
                  ) / 10,
                totalErrors: existing.totalErrors + m.totalErrors,
                lastRunAt: Math.max(existing.lastRunAt, m.lastRunAt),
              })
            } else {
              nextHistory.set(m.scenarioId, m)
            }
          }
          return { reports: [...s.reports, report], scenarioHistory: nextHistory }
        })

        log.info("recorded eval run", {
          runId,
          suite: suiteName,
          passRate: `${(report.passRate * 100).toFixed(0)}%`,
          scenarios: results.length,
        })

        return report
      })

    const getScenarioMetrics: Interface["getScenarioMetrics"] = (scenarioId) =>
      Effect.gen(function* () {
        const s = yield* Ref.get(state)
        return s.scenarioHistory.get(scenarioId) ?? null
      })

    const listReports: Interface["listReports"] = (limit = 20) =>
      Effect.gen(function* () {
        const s = yield* Ref.get(state)
        return s.reports.slice(-limit).reverse()
      })

    const getReport: Interface["getReport"] = (runId) =>
      Effect.gen(function* () {
        const s = yield* Ref.get(state)
        return s.reports.find((r) => r.runId === runId) ?? null
      })

    const compare: Interface["compare"] = (runIdA, runIdB) =>
      Effect.gen(function* () {
        const s = yield* Ref.get(state)
        const reportA = s.reports.find((r) => r.runId === runIdA)
        const reportB = s.reports.find((r) => r.runId === runIdB)
        if (!reportA || !reportB) return null

        const improved: string[] = []
        const regressed: string[] = []

        for (const sc of reportA.scenarios) {
          const other = reportB.scenarios.find((s2) => s2.scenarioId === sc.scenarioId)
          if (!other) continue
          if (other.success && !sc.success) regressed.push(sc.scenarioId)
          if (!other.success && sc.success) improved.push(sc.scenarioId)
        }

        const comparison: EvalComparison = {
          baseline: {
            runId: runIdB,
            timestamp: reportB.timestamp,
            passRate: reportB.passRate,
            avgDurationMs: reportB.avgDurationPerScenario,
          },
          current: {
            runId: runIdA,
            timestamp: reportA.timestamp,
            passRate: reportA.passRate,
            avgDurationMs: reportA.avgDurationPerScenario,
          },
          passRateDelta: reportA.passRate - reportB.passRate,
          durationDelta: reportA.avgDurationPerScenario - reportB.avgDurationPerScenario,
          improved,
          regressed,
        }
        return comparison
      })

    return Service.of({
      recordRun: recordRun as any,
      getScenarioMetrics: getScenarioMetrics as any,
      listReports: listReports as any,
      getReport: getReport as any,
      compare: compare as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as EvalMetrics from "./metrics"
