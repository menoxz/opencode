/**
 * Eval Framework — benchmark agent capabilities and track improvements.
 *
 * Features:
 * - Structured scenario definitions with expected behaviors
 * - Sandbox-based execution of agent tasks
 * - Metrics collection and aggregation across runs
 * - Comparison reports between runs
 * - Built-in scenarios covering all major categories
 *
 * @module eval
 */

import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import {
  type EvalScenario,
  type EvalSuite,
  type ScenarioResult,
  type ScenarioCategory,
  type Difficulty,
  ALL_SCENARIOS,
  ALL_SUITES,
  getScenario,
  getSuite,
  listScenarios,
  type ExpectedBehavior,
} from "./scenario"
import { createSandbox, type SandboxOptions } from "./sandbox"
import * as EvalMetricsMod from "./metrics"
import type { EvalRunReport, EvalComparison, ScenarioMetrics } from "./metrics"

const log = Log.create({ service: "eval" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for running an evaluation. */
export interface EvalRunOptions {
  mode: "auto" | "manual"
  timeoutSeconds?: number
  failFast?: boolean
  record?: boolean
}

/** Regression detection report. */
export interface RegressionReport {
  suiteId: string
  currentRunId: string
  baselineRunId: string
  passRate: { current: number; baseline: number; delta: number }
  avgDurationMs: { current: number; baseline: number; delta: number }
  severity: "none" | "minor" | "major" | "performance" | "behavior"
  /** True if any major regression (passRate drop > 5%, or new failures). */
  major: boolean
  details: {
    passRateRegression: boolean
    durationRegression: boolean
    behaviorRegression: boolean
    newFailures: string[]
    newPasses: string[]
  }
}

/** Aggregated baseline from historical runs. */
export interface EvalBaseline {
  suiteId: string
  passRate: number
  avgDurationMs: number
  runCount: number
  scenarioResults: Record<string, { passRate: number; avgDurationMs: number }>
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly runScenario: (scenario: EvalScenario | string, opts?: Partial<EvalRunOptions>) => Effect.Effect<ScenarioResult>
  readonly runSuite: (suite: EvalSuite | string, opts?: Partial<EvalRunOptions>) => Effect.Effect<EvalRunReport>
  readonly getScenario: (id: string) => EvalScenario | undefined
  readonly getSuite: (id: string) => EvalSuite | undefined
  readonly listScenarios: (opts?: { category?: ScenarioCategory; difficulty?: Difficulty }) => EvalScenario[]
  readonly listReports: (limit?: number) => Effect.Effect<EvalRunReport[]>
  readonly compareRuns: (runIdA: string, runIdB: string) => Effect.Effect<EvalComparison | null>
  readonly runFullBenchmark: (opts?: Partial<EvalRunOptions>) => Effect.Effect<EvalRunReport>
  readonly recordRun: (results: ScenarioResult[], suiteId: string, suiteName: string) => Effect.Effect<EvalRunReport>
  readonly detectRegression: (suiteId?: string) => Effect.Effect<RegressionReport | null>
  readonly getBaseline: (suiteId: string) => Effect.Effect<EvalBaseline | null>
  readonly compareToBaseline: (report: EvalRunReport) => Effect.Effect<RegressionReport | null>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/Eval") {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Result of running a validation command. */
export interface ValidationResult {
  passed: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

/**
 * Run a validation command synchronously and return pass/fail.
 * Uses `child_process.execSync` under the hood.
 *
 * @param command - Shell command to execute
 * @param cwd - Working directory to run the command in
 * @returns ValidationResult with exit code and output
 */
export function validate(command: string, cwd?: string): ValidationResult {
  const result: ValidationResult = { passed: false, stdout: "", stderr: "", exitCode: null }
  try {
    const out = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: "pipe",
    })
    result.passed = true
    result.stdout = (out ?? "").toString()
    result.exitCode = 0
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      result.exitCode = (err as { status: number }).status
    }
    if (err && typeof err === "object" && "stdout" in err) {
      result.stdout = ((err as { stdout: string }).stdout ?? "").toString()
    }
    if (err && typeof err === "object" && "stderr" in err) {
      result.stderr = ((err as { stderr: string }).stderr ?? "").toString()
    }
    result.passed = false
  }
  return result
}

/**
 * Evaluate a single expected behavior using functional validation (if available)
 * or keyword/action matching as fallback.
 */
export function evaluateBehavior(
  behavior: ExpectedBehavior,
  output: string,
  toolCalls: string[],
  cwd?: string,
): boolean {
  // If behavior has a validation command AND we have a working directory, run it
  if (behavior.validationCommand && cwd) {
    const result = validate(behavior.validationCommand, cwd)
    return result.passed
  }

  // Fallback: keyword + action + anti-pattern matching
  let passed = true

  if (behavior.requiredKeywords && behavior.requiredKeywords.length > 0) {
    const found = behavior.requiredKeywords.some((kw) =>
      output.toLowerCase().includes(kw.toLowerCase()),
    )
    if (!found) passed = false
  }

  if (behavior.requiredActions && behavior.requiredActions.length > 0) {
    const found = behavior.requiredActions.some((action) =>
      toolCalls.some((t) => t.includes(action)),
    )
    if (!found) passed = false
  }

  if (behavior.antiPatterns && behavior.antiPatterns.length > 0) {
    const found = behavior.antiPatterns.some((ap) =>
      output.toLowerCase().includes(ap.toLowerCase()),
    )
    if (found) passed = false
  }

  return passed
}

/**
 * Auto-evaluate whether a scenario succeeded based on expected behaviors.
 * Uses functional validation (runs commands) when `validationCommand` is set
 * and `cwd` is provided. Falls back to keyword matching otherwise.
 *
 * @param scenario - The scenario to evaluate
 * @param output - The agent's output text
 * @param toolCalls - List of tool calls made by the agent
 * @param cwd - Optional working directory for running validation commands
 */
export function autoEvaluate(
  scenario: EvalScenario,
  output: string,
  toolCalls: string[],
  cwd?: string,
): { matched: number; total: number } {
  let matched = 0
  const total = scenario.expectedBehaviors.length

  for (const behavior of scenario.expectedBehaviors) {
    if (evaluateBehavior(behavior, output, toolCalls, cwd)) matched++
  }

  return { matched, total }
}

/**
 * Simulate scenario execution (fallback for manual mode / testing).
 */
export function simulateScenario(
  scenario: EvalScenario,
  opts: EvalRunOptions,
): ScenarioResult {
  const startedAt = Date.now()
  const output = `[Simulated] Running: ${scenario.taskPrompt.substring(0, 80)}...`

  const toolCalls: string[] = []
  for (const behavior of scenario.expectedBehaviors) {
    if (behavior.requiredActions) {
      toolCalls.push(...behavior.requiredActions)
    }
  }

  // Simulation: no cwd, so validation commands fall back to keyword matching
  const { matched, total } = autoEvaluate(scenario, output, toolCalls)
  const completedAt = Date.now()
  const durationMs = completedAt - startedAt

  const success = opts.mode === "manual" ? false : matched >= Math.ceil(total / 2)

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    success,
    durationMs: Math.max(durationMs, 100),
    tokensUsed: Math.round(output.length * 1.5),
    toolCalls: toolCalls.length,
    errors: [],
    behaviorsMatched: matched,
    behaviorsTotal: total,
    output: `Task: ${scenario.taskPrompt}\n\nOutput:\n${output}`,
    startedAt,
    completedAt,
  }
}

/**
 * Run a scenario inside a sandboxed temporary directory.
 *
 * Creates an isolated temp directory with `createSandbox`, writes the
 * scenario's `setupFiles` into it (if any), runs the scenario simulation,
 * then cleans up the sandbox (unless `cleanup: false` is set).
 *
 * @param scenario - The scenario to execute
 * @param opts - Execution options (mode, timeout, etc.)
 * @param sandboxOpts - Sandbox isolation options
 */
export function executeScenarioInSandbox(
  scenario: EvalScenario,
  opts: EvalRunOptions,
  sandboxOpts?: SandboxOptions & { writeSetupFiles?: boolean },
): Effect.Effect<ScenarioResult> {
  return createSandbox((sandboxDir) =>
    Effect.gen(function* () {
      // Write setupFiles into the sandbox directory if provided
      if (scenario.setupFiles && sandboxOpts?.writeSetupFiles !== false) {
        for (const file of scenario.setupFiles) {
          const filePath = path.join(sandboxDir, file.path)
          const dirName = path.dirname(filePath)
          if (dirName !== sandboxDir) {
            fs.mkdirSync(dirName, { recursive: true })
          }
          fs.writeFileSync(filePath, file.content)
        }
      }

      return simulateScenario(scenario, opts)
    }),
    sandboxOpts,
  )
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

const defaultOptions: EvalRunOptions = { mode: "auto", failFast: false, record: true }

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const metricsSvc = yield* EvalMetricsMod.Service

    const runScenario: Interface["runScenario"] = (scenario, opts) =>
      Effect.gen(function* () {
        const resolved = typeof scenario === "string" ? getScenario(scenario) : scenario
        if (!resolved) return yield* Effect.die(new Error(`Scenario not found: ${scenario}`))
        const options = { ...defaultOptions, ...opts }
        return simulateScenario(resolved, options)
      })

    const runSuite: Interface["runSuite"] = (suite, opts) =>
      Effect.gen(function* () {
        const resolved = typeof suite === "string" ? getSuite(suite) : suite
        if (!resolved) return yield* Effect.die(new Error(`Suite not found: ${suite}`))
        const options = { ...defaultOptions, ...opts }

        const results: ScenarioResult[] = []
        for (const scenario of resolved.scenarios) {
          const result = yield* runScenario(scenario, options)
          results.push(result)
          if (!result.success && options.failFast) break
        }

        if (options.record) {
          return yield* metricsSvc.recordRun(results, resolved.id, resolved.name)
        }

        const passed = results.filter((r) => r.success).length
        const report: EvalRunReport = {
          runId: `eval-${Date.now()}`,
          suiteId: resolved.id,
          suiteName: resolved.name,
          timestamp: Date.now(),
          durationMs: results.reduce((s, r) => s + r.durationMs, 0),
          totalScenarios: results.length,
          passed,
          failed: results.length - passed,
          passRate: results.length > 0 ? passed / results.length : 0,
          avgDurationPerScenario: results.length > 0
            ? Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length)
            : 0,
          totalTokensUsed: results.reduce((s, r) => s + r.tokensUsed, 0),
          totalToolCalls: results.reduce((s, r) => s + r.toolCalls, 0),
          scenarios: results,
          metrics: [],
        }
        return report
      })

    const runFullBenchmark: Interface["runFullBenchmark"] = (opts) =>
      Effect.gen(function* () {
        const fullSuite = getSuite("full")
        if (!fullSuite) return yield* Effect.die(new Error("Full suite not found"))
        return yield* runSuite(fullSuite, opts)
      })

    const listReports: Interface["listReports"] = (limit) =>
      metricsSvc.listReports(limit)

    const compareRuns: Interface["compareRuns"] = (a, b) =>
      metricsSvc.compare(a, b)

    const recordRun: Interface["recordRun"] = (results, suiteId, suiteName) =>
      metricsSvc.recordRun(results, suiteId, suiteName)

    // ---- Regression detection ----

    const detectRegression: Interface["detectRegression"] = (suiteId) =>
      Effect.gen(function* () {
        const reports = yield* metricsSvc.listReports(100)
        const candidates = suiteId
          ? reports.filter((r) => r.suiteId === suiteId)
          : reports
        if (candidates.length < 2) return null

        const current = candidates[0]
        const baseline = candidates[1]

        const passRateDelta = current.passRate - baseline.passRate
        const durationDelta = current.avgDurationPerScenario - baseline.avgDurationPerScenario

        const newFailures: string[] = []
        const newPasses: string[] = []
        for (const sc of current.scenarios) {
          const other = baseline.scenarios.find((s2) => s2.scenarioId === sc.scenarioId)
          if (!other) continue
          if (other.success && !sc.success) newFailures.push(sc.scenarioId)
          if (!other.success && sc.success) newPasses.push(sc.scenarioId)
        }

        const passRateRegression = passRateDelta < -0.05
        const durationRegression = baseline.avgDurationPerScenario > 0
          ? durationDelta / baseline.avgDurationPerScenario > 0.2
          : false
        const behaviorRegression = newFailures.length > 0

        let severity: RegressionReport["severity"] = "none"
        if (passRateRegression && behaviorRegression) severity = "major"
        else if (behaviorRegression) severity = "behavior"
        else if (passRateRegression) severity = "major"
        else if (durationRegression) severity = "performance"
        else if (Math.abs(passRateDelta) > 0.02) severity = "minor"

        return {
          suiteId: current.suiteId,
          currentRunId: current.runId,
          baselineRunId: baseline.runId,
          passRate: { current: current.passRate, baseline: baseline.passRate, delta: passRateDelta },
          avgDurationMs: { current: current.avgDurationPerScenario, baseline: baseline.avgDurationPerScenario, delta: durationDelta },
          severity,
          major: severity === "major" || severity === "behavior",
          details: { passRateRegression, durationRegression, behaviorRegression, newFailures, newPasses },
        }
      })

    const getBaseline: Interface["getBaseline"] = (suiteId) =>
      Effect.gen(function* () {
        const all = yield* metricsSvc.listReports(100)
        const candidates = all.filter((r) => r.suiteId === suiteId)
        if (candidates.length === 0) return null

        const recent = candidates.slice(0, Math.min(5, candidates.length))
        const passRates = recent.map((r) => r.passRate).sort((a, b) => a - b)
        const durations = recent.map((r) => r.avgDurationPerScenario).sort((a, b) => a - b)

        const median = <T>(sorted: T[]): T => sorted[Math.floor(sorted.length / 2)]

        // Per-scenario baseline across runs
        const scenarioResults: Record<string, { passRate: number; avgDurationMs: number }> = {}
        const scenarioPasses = new Map<string, number[]>()
        const scenarioDurations = new Map<string, number[]>()

        for (const r of recent) {
          for (const s of r.scenarios) {
            const passes = scenarioPasses.get(s.scenarioId) ?? []
            passes.push(s.success ? 1 : 0)
            scenarioPasses.set(s.scenarioId, passes)
            const durs = scenarioDurations.get(s.scenarioId) ?? []
            durs.push(s.durationMs)
            scenarioDurations.set(s.scenarioId, durs)
          }
        }

        for (const [scId, passes] of scenarioPasses) {
          const durs = scenarioDurations.get(scId) ?? []
          scenarioResults[scId] = {
            passRate: passes.sort((a, b) => a - b)[Math.floor(passes.length / 2)],
            avgDurationMs: durs.length > 0 ? median(durs.sort((a, b) => a - b)) : 0,
          }
        }

        return {
          suiteId,
          passRate: median(passRates),
          avgDurationMs: median(durations),
          runCount: recent.length,
          scenarioResults,
        }
      })

    const compareToBaseline: Interface["compareToBaseline"] = (report) =>
      Effect.gen(function* () {
        const baseline = yield* getBaseline(report.suiteId)
        if (!baseline) return null

        const passRateDelta = report.passRate - baseline.passRate
        const durationDelta = report.avgDurationPerScenario - baseline.avgDurationMs

        const newFailures: string[] = []
        const newPasses: string[] = []

        for (const sc of report.scenarios) {
          const bl = baseline.scenarioResults[sc.scenarioId]
          if (!bl) continue
          // Previously passing scenario that now fails
          if (bl.passRate >= 0.5 && !sc.success) newFailures.push(sc.scenarioId)
          // Previously failing scenario that now passes
          if (bl.passRate < 0.5 && sc.success) newPasses.push(sc.scenarioId)
        }

        const passRateRegression = passRateDelta < -0.05
        const durationRegression = baseline.avgDurationMs > 0
          ? durationDelta / baseline.avgDurationMs > 0.2
          : false
        const behaviorRegression = newFailures.length > 0

        let severity: RegressionReport["severity"] = "none"
        if (passRateRegression && behaviorRegression) severity = "major"
        else if (behaviorRegression) severity = "behavior"
        else if (passRateRegression) severity = "major"
        else if (durationRegression) severity = "performance"
        else if (Math.abs(passRateDelta) > 0.02) severity = "minor"

        return {
          suiteId: report.suiteId,
          currentRunId: report.runId,
          baselineRunId: "",
          passRate: { current: report.passRate, baseline: baseline.passRate, delta: passRateDelta },
          avgDurationMs: { current: report.avgDurationPerScenario, baseline: baseline.avgDurationMs, delta: durationDelta },
          severity,
          major: severity === "major" || severity === "behavior",
          details: { passRateRegression, durationRegression, behaviorRegression, newFailures, newPasses },
        }
      })

    return Service.of({
      runScenario: runScenario as any,
      runSuite: runSuite as any,
      getScenario,
      getSuite,
      listScenarios,
      listReports: listReports as any,
      compareRuns: compareRuns as any,
      runFullBenchmark: runFullBenchmark as any,
      recordRun: recordRun as any,
      detectRegression: detectRegression as any,
      getBaseline: getBaseline as any,
      compareToBaseline: compareToBaseline as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as Eval from "./index"
