/**
 * Eval Metrics — collect, aggregate, and compare evaluation metrics.
 *
 * @module eval/metrics
 */

import { Effect, Context, Layer, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { open as openSqlite, type RawSqlite, type RawDrizzleDb } from "#sqlite-raw"
import { eq, desc } from "drizzle-orm"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import type { ScenarioResult } from "./scenario"
import { EvalRunTable, EvalScenarioResultTable } from "./eval.sql"

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
// SQLite persistence helpers
// ---------------------------------------------------------------------------

function getEvalDbPath(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".config")
  const dbDir = path.join(configDir, "opencode")
  fs.mkdirSync(dbDir, { recursive: true })
  return path.join(dbDir, "eval.sqlite")
}

function createEvalTables(sqlite: RawSqlite): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS eval_run (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL,
      suite_name TEXT NOT NULL,
      pass_rate REAL NOT NULL,
      total_scenarios INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      avg_duration_ms REAL NOT NULL,
      total_duration_ms REAL NOT NULL,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_tool_calls INTEGER NOT NULL DEFAULT 0,
      agent TEXT,
      model TEXT,
      created_at INTEGER NOT NULL,
      tags TEXT,
      metadata TEXT
    )
  `)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS eval_scenario_result (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES eval_run(id),
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      passed INTEGER NOT NULL,
      behaviors_matched INTEGER NOT NULL,
      behaviors_total INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      tool_calls INTEGER DEFAULT 0,
      errors TEXT,
      output TEXT,
      created_at INTEGER NOT NULL
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS eval_run_suite_idx ON eval_run(suite_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS eval_run_created_idx ON eval_run(created_at)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS eval_scenario_run_idx ON eval_scenario_result(run_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS eval_scenario_id_idx ON eval_scenario_result(scenario_id)`)
}

/** Rebuild the Ref state from persisted SQLite rows. */
function loadFromDb(
  db: RawDrizzleDb,
  sync: <T>(fn: () => T) => Effect.Effect<T>,
): Effect.Effect<{ reports: EvalRunReport[]; scenarioHistory: Map<string, ScenarioMetrics> }> {
  return Effect.gen(function* () {
    const rows = yield* sync(() =>
      db
        .select()
        .from(EvalRunTable)
        .orderBy(desc(EvalRunTable.created_at))
        .all(),
    )

    const reports: EvalRunReport[] = []
    const allScenarioRuns = new Map<string, ScenarioResult[]>()

    for (const row of rows) {
      const scenarioRows = yield* sync(() =>
        db
          .select()
          .from(EvalScenarioResultTable)
          .where(eq(EvalScenarioResultTable.run_id, row.id))
          .all(),
      )

      const scenarios: ScenarioResult[] = scenarioRows.map((sr) => {
        const completedAt = sr.created_at
        const startedAt = completedAt - sr.duration_ms
        const errors: string[] = sr.errors ? (JSON.parse(sr.errors) as string[]) : []
        return {
          scenarioId: sr.scenario_id,
          scenarioName: sr.scenario_name,
          success: sr.passed,
          durationMs: sr.duration_ms,
          tokensUsed: sr.tokens_used ?? 0,
          toolCalls: sr.tool_calls ?? 0,
          errors,
          behaviorsMatched: sr.behaviors_matched,
          behaviorsTotal: sr.behaviors_total,
          output: sr.output ?? "",
          startedAt,
          completedAt,
        }
      })

      const report: EvalRunReport = {
        runId: row.id,
        suiteId: row.suite_id,
        suiteName: row.suite_name,
        timestamp: row.created_at,
        durationMs: row.total_duration_ms,
        totalScenarios: row.total_scenarios,
        passed: row.passed,
        failed: row.failed,
        passRate: row.pass_rate,
        avgDurationPerScenario: Math.round(row.avg_duration_ms),
        totalTokensUsed: row.total_tokens,
        totalToolCalls: row.total_tool_calls,
        scenarios,
        metrics: buildScenarioMetrics(scenarios),
      }
      reports.push(report)

      // Accumulate scenario results for history
      for (const sc of scenarios) {
        const list = allScenarioRuns.get(sc.scenarioId) ?? []
        list.push(sc)
        allScenarioRuns.set(sc.scenarioId, list)
      }
    }

    // Build scenarioHistory from all accumulated results
    const scenarioHistory = new Map<string, ScenarioMetrics>()
    for (const [id, results] of allScenarioRuns) {
      const entry = buildHistoricalMetrics(id, results)
      if (entry) scenarioHistory.set(id, entry)
    }

    return { reports: reports.reverse(), scenarioHistory }
  })
}

/** Build ScenarioMetrics from a list of historical results (no dedup — all runs). */
function buildHistoricalMetrics(scenarioId: string, results: ScenarioResult[]): ScenarioMetrics | null {
  if (results.length === 0) return null
  const successes = results.filter((r) => r.success).length
  return {
    scenarioId,
    scenarioName: results[0].scenarioName,
    runs: results.length,
    successes,
    successRate: successes / results.length,
    avgDurationMs: Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length),
    avgTokensUsed: Math.round(results.reduce((s, r) => s + r.tokensUsed, 0) / results.length),
    avgToolCalls: Math.round(results.reduce((s, r) => s + r.toolCalls, 0) / results.length * 10) / 10,
    totalErrors: results.reduce((s, r) => s + r.errors.length, 0),
    lastRunAt: Math.max(...results.map((r) => r.completedAt)),
  }
}

interface DbFlush {
  run: { id: string; suite_id: string; suite_name: string; pass_rate: number; total_scenarios: number; passed: number; failed: number; avg_duration_ms: number; total_duration_ms: number; total_tokens: number; total_tool_calls: number; created_at: number }
  scenarios: { id: string; run_id: string; scenario_id: string; scenario_name: string; passed: boolean; behaviors_matched: number; behaviors_total: number; duration_ms: number; tokens_used: number; tool_calls: number; errors: string; output: string; created_at: number }[]
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Initialize SQLite database
    const dbPath = getEvalDbPath()
    log.info("opening eval database", { path: dbPath })
    const { sqlite, db } = openSqlite(dbPath) as { sqlite: RawSqlite; db: RawDrizzleDb }
    sqlite.exec("PRAGMA journal_mode = WAL")
    sqlite.exec("PRAGMA synchronous = NORMAL")
    sqlite.exec("PRAGMA busy_timeout = 5000")
    createEvalTables(sqlite)

    const sync = <T>(fn: () => T): Effect.Effect<T> => Effect.sync(() => fn())

    const state = yield* Ref.make<RunState>({ reports: [], scenarioHistory: new Map() })

    // Load persisted data into the in-memory cache
    const persisted = yield* loadFromDb(db, sync)
    yield* Ref.set(state, persisted)
    log.info("eval cache loaded", { reports: persisted.reports.length, scenarios: persisted.scenarioHistory.size })

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

        // Persist to SQLite
        const now = Date.now()
        yield* sync(() =>
          db
            .insert(EvalRunTable)
            .values({
              id: runId,
              suite_id: suiteId,
              suite_name: suiteName,
              pass_rate: report.passRate,
              total_scenarios: results.length,
              passed,
              failed,
              avg_duration_ms: report.avgDurationPerScenario,
              total_duration_ms: totalDuration,
              total_tokens: totalTokens,
              total_tool_calls: totalTools,
              created_at: now,
            })
            .run(),
        )

        for (const sc of results) {
          yield* sync(() =>
            db
              .insert(EvalScenarioResultTable)
              .values({
                id: randomUUID(),
                run_id: runId,
                scenario_id: sc.scenarioId,
                scenario_name: sc.scenarioName,
                passed: sc.success,
                behaviors_matched: sc.behaviorsMatched,
                behaviors_total: sc.behaviorsTotal,
                duration_ms: sc.durationMs,
                tokens_used: sc.tokensUsed,
                tool_calls: sc.toolCalls,
                errors: JSON.stringify(sc.errors),
                output: sc.output,
                created_at: now,
              })
              .run(),
          )
        }

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
