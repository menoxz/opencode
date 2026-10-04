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
  type Verdict,
  UNVERIFIED_PREFIX,
} from "./scenario"
import { createSandbox, type SandboxOptions } from "./sandbox"
import { runScenarioReal, commandExecutor, headlessSessionExecutor } from "./real-runner"
import * as EvalMetricsMod from "./metrics"
import type { EvalRunReport, EvalComparison, ScenarioMetrics } from "./metrics"
import { EvalRegression } from "./regression"

const log = Log.create({ service: "eval" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for running an evaluation. */
export interface EvalRunOptions {
  mode: "auto" | "manual" | "real"
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
  /**
   * Detect a regression that has *persisted* across several runs, by comparing
   * against the historical baseline rather than against the previous run.
   *
   * `detectRegression` above is blind to a uniformly broken suite: when every
   * run fails identically the run-over-run delta is zero. That is how a 33 %
   * pass rate survived 36 consecutive runs and 58 hours unnoticed. See
   * eval/regression.ts.
   */
  readonly detectSustainedRegression: (suiteId?: string) => Effect.Effect<EvalRegression.Alert | null>
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
  /**
   * True when the command produced a verdict of its own (it ran to a real exit
   * code). False when the child could never be started (a spawn refusal), so the
   * artifact was never actually judged and the result must not be read as a
   * failure of the agent's work.
   */
  executed: boolean
}

/** Attempts made while a validation command keeps failing on an execution refusal. */
const VALIDATION_ATTEMPTS = 5
/** Exponential backoff before a retry; a refused child start clears within a few hundred ms. */
const VALIDATION_BACKOFF_MS = 50
const VALIDATION_BACKOFF_MAX_MS = 400
/**
 * Exit code 5 (`ERROR_ACCESS_DENIED`) that a Windows shell can return when it cannot
 * launch the child; observed here as errorlevel 1 plus a localized "access denied"
 * message, both treated as a refusal rather than the command's own verdict.
 */
const SHELL_ACCESS_DENIED = 5

/**
 * Run a validation command synchronously and return pass/fail.
 * Uses `child_process.execSync` under the hood.
 *
 * On Windows a child start is occasionally refused (`uv_spawn` EPERM, a killed
 * `cmd.exe` that leaves no status, or a bare ACCESS_DENIED exit 5). That is an
 * execution error, not a verdict on the artifact: it is retried so a flaky child
 * start cannot grade a correct artifact as failed. A command that actually ran and
 * exited with its own non-zero code is a real failure and is returned as-is.
 *
 * @param command - Shell command to execute
 * @param cwd - Working directory to run the command in
 * @returns ValidationResult with exit code and output
 */
export function validate(command: string, cwd?: string): ValidationResult {
  let best = execValidationCommand(command, cwd)
  for (let attempt = 1; attempt < VALIDATION_ATTEMPTS && !best.passed && isExecutionRefusal(best); attempt++) {
    blockSync(Math.min(VALIDATION_BACKOFF_MS * 2 ** (attempt - 1), VALIDATION_BACKOFF_MAX_MS))
    const retry = execValidationCommand(command, cwd)
    if (retry.passed || !isExecutionRefusal(retry)) best = retry
  }
  return best
}

/**
 * Localized "access denied" texts the Windows shell prints when the OS refuses to
 * create the child process (EPERM, typically an EDR/AV race). The target program
 * never runs, so this is a refusal, not the command's own verdict.
 */
const SHELL_DENIED_PATTERNS = [
  /acc[eè]s refus[eé]/i, // fr
  /access is denied/i, // en
  /zugriff verweigert/i, // de
  /acceso denegado/i, // es
  /accesso negato/i, // it
  /acesso negado/i, // pt
]

/** True when an attempt produced no verdict of its own: the child never ran or was killed. */
export function isExecutionRefusal(result: ValidationResult): boolean {
  // `execSync` leaves `status` null (or undefined) when it could not start the child,
  // e.g. EPERM from the OS or ENOENT for a missing cwd: the command produced no verdict.
  if (typeof result.exitCode !== "number") return true
  // The shell reports a denied child start with its own localized text and no output
  // of its own; the command produced no verdict, so it must be retried, not graded.
  if (result.exitCode === 1 && result.stdout.trim().length === 0 && isShellDeniedMessage(result.stderr)) return true
  return process.platform === "win32" && result.exitCode === SHELL_ACCESS_DENIED
}

function isShellDeniedMessage(stderr: string): boolean {
  const text = stderr.trim()
  return text.length > 0 && SHELL_DENIED_PATTERNS.some((re) => re.test(text))
}

/** `/bin/sh` semantics do not apply here: a synchronous sleep keeps `validate` sync. */
function blockSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function execValidationCommand(command: string, cwd?: string): ValidationResult {
  const result: ValidationResult = { passed: false, stdout: "", stderr: "", exitCode: null, executed: false }
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
    result.executed = true
  } catch (err: unknown) {
    if (err && typeof err === "object") {
      const status = (err as { status?: unknown }).status
      if (typeof status === "number") result.exitCode = status
    }
    if (err && typeof err === "object" && "stdout" in err) {
      result.stdout = ((err as { stdout: string }).stdout ?? "").toString()
    }
    if (err && typeof err === "object" && "stderr" in err) {
      result.stderr = ((err as { stderr: string }).stderr ?? "").toString()
    }
    result.passed = false
    // A refusal (no status, or Windows ERROR_ACCESS_DENIED) means the command
    // never ran; only a real non-zero exit code is a verdict on the artifact.
    result.executed = !isExecutionRefusal(result)
  }
  return result
}

/**
 * Reduce a validation result to a verdict.
 *
 * A command that ran and exited non-zero is a real failure. A command that was
 * refused before it could start (`executed === false`) produced no verdict at
 * all: grading that as a failure turns a Windows spawn flake, or a missing
 * shell, into a phantom capability regression. It is reported as `unverified`
 * so the scenario is excluded from the pass rate instead of counted as a loss.
 */
export function verdictFromValidation(result: ValidationResult): Verdict {
  if (result.passed) return "pass"
  return result.executed ? "fail" : "unverified"
}

/**
 * Grade a single expected behavior.
 *
 * A behavior that declares a `validationCommand` is graded ONLY by running that
 * command. When it cannot be run — no working directory, or a refused child
 * start — the behavior is `unverified`. It is never silently downgraded to
 * keyword matching, which would grade the agent on its prose instead of on the
 * artifact it had to produce, and let a scenario claim success while its
 * functional contract was never executed.
 */
export function gradeBehavior(
  behavior: ExpectedBehavior,
  output: string,
  toolCalls: string[],
  cwd?: string,
): Verdict {
  if (behavior.validationCommand) {
    if (!cwd) return "unverified"
    return verdictFromValidation(validate(behavior.validationCommand, cwd))
  }
  return heuristicMatch(behavior, output, toolCalls) ? "pass" : "fail"
}

/** Keyword / action / anti-pattern matching, used only when no validation command exists. */
function heuristicMatch(behavior: ExpectedBehavior, output: string, toolCalls: string[]): boolean {
  const text = output.toLowerCase()
  if (
    behavior.requiredKeywords?.length &&
    !behavior.requiredKeywords.some((kw) => text.includes(kw.toLowerCase()))
  )
    return false
  if (
    behavior.requiredActions?.length &&
    !behavior.requiredActions.some((action) => toolCalls.some((t) => t.includes(action)))
  )
    return false
  return !behavior.antiPatterns?.some((ap) => text.includes(ap.toLowerCase()))
}

/**
 * Evaluate a single expected behavior. Boolean projection of `gradeBehavior`:
 * only an actually verified pass counts as `true`.
 */
export function evaluateBehavior(
  behavior: ExpectedBehavior,
  output: string,
  toolCalls: string[],
  cwd?: string,
): boolean {
  return gradeBehavior(behavior, output, toolCalls, cwd) === "pass"
}

/**
 * Decide the verdict of a whole scenario.
 *
 * A scenario passes only when every declared behavior was actually checked and
 * passed. The previous rule, `matched >= ceil(total / 2)`, reported green while
 * half of the declared expectations failed.
 */
export function scenarioVerdict(
  grade: { matched: number; total: number; unverified: number },
  errors: string[],
): Verdict {
  if (grade.total === 0) return "unverified"
  if (errors.length > 0) return "fail"
  if (grade.total - grade.matched - grade.unverified > 0) return "fail"
  return grade.unverified > 0 ? "unverified" : "pass"
}

/**
 * Auto-evaluate whether a scenario succeeded based on expected behaviors.
 * Runs `validationCommand` when `cwd` is provided, otherwise reports those
 * behaviors as unverified.
 *
 * @param scenario - The scenario to evaluate
 * @param output - The agent's output text
 * @param toolCalls - List of tool calls made by the agent
 * @param cwd - Working directory for running validation commands
 */
export function autoEvaluate(
  scenario: EvalScenario,
  output: string,
  toolCalls: string[],
  cwd?: string,
): { matched: number; total: number; unverified: number } {
  const grades = scenario.expectedBehaviors.map((b) => gradeBehavior(b, output, toolCalls, cwd))
  return {
    matched: grades.filter((g) => g === "pass").length,
    total: grades.length,
    unverified: grades.filter((g) => g === "unverified").length,
  }
}

/**
 * Pass rate over the scenarios that produced an actual verdict.
 *
 * An `unverified` scenario — a transient spawn/provider failure, or a behavior
 * whose validation command could not run — is no evidence about the agent.
 * Counting it as a failure turns an environmental flake into a phantom
 * capability regression, so it is excluded from both numerator and denominator.
 * Returns `null` when the run verified nothing at all.
 */
export function verifiedPassRate(scenarios: readonly ScenarioResult[]): number | null {
  const verified = scenarios.filter((s) => s.verdict !== "unverified")
  if (verified.length === 0) return null
  return verified.filter((s) => s.verdict === "pass").length / verified.length
}

/**
 * Compare a run report against a historical baseline, ignoring scenarios that
 * produced no verdict.
 *
 * Unverified scenarios are excluded from the pass rate and from the
 * new-failure/new-pass tallies; a run that verified nothing returns `null`.
 * Without this, one hourly headless timeout taking one scenario to `unverified`
 * while the rest pass was reported as a major regression (incident
 * eval-regression-sanity) even though the harness had no failing verdict.
 */
export function compareReportToBaseline(
  report: EvalRunReport,
  baseline: EvalBaseline,
): RegressionReport | null {
  const currentPassRate = verifiedPassRate(report.scenarios)
  if (currentPassRate === null) return null

  const passRateDelta = currentPassRate - baseline.passRate
  const durationDelta = report.avgDurationPerScenario - baseline.avgDurationMs

  const newFailures: string[] = []
  const newPasses: string[] = []
  for (const sc of report.scenarios) {
    if (sc.verdict === "unverified") continue
    const bl = baseline.scenarioResults[sc.scenarioId]
    if (!bl) continue
    // Previously passing scenario that now fails
    if (bl.passRate >= 0.5 && sc.verdict === "fail") newFailures.push(sc.scenarioId)
    // Previously failing scenario that now passes
    if (bl.passRate < 0.5 && sc.verdict === "pass") newPasses.push(sc.scenarioId)
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
    passRate: { current: currentPassRate, baseline: baseline.passRate, delta: passRateDelta },
    avgDurationMs: { current: report.avgDurationPerScenario, baseline: baseline.avgDurationMs, delta: durationDelta },
    severity,
    major: severity === "major" || severity === "behavior",
    details: { passRateRegression, durationRegression, behaviorRegression, newFailures, newPasses },
  }
}

/**
 * Simulate scenario execution — a dry run that executes no agent.
 *
 * It therefore verifies nothing and can never report success. The previous
 * implementation seeded `toolCalls` from the scenario's own `requiredActions`
 * and then asserted those same actions against them, so every action-based
 * expectation passed by construction and the suite was mathematically unable to
 * go red. Use `mode: "real"` to actually verify a scenario.
 */
export function simulateScenario(
  scenario: EvalScenario,
  _opts: EvalRunOptions,
): ScenarioResult {
  const startedAt = Date.now()
  const completedAt = Date.now()

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    success: false,
    verdict: "unverified",
    durationMs: Math.max(completedAt - startedAt, 1),
    tokensUsed: 0,
    toolCalls: 0,
    errors: [
      `${UNVERIFIED_PREFIX} simulation executed no agent, so none of the ${scenario.expectedBehaviors.length} expected behaviors of "${scenario.id}" were checked — run with mode "real" to verify`,
    ],
    behaviorsMatched: 0,
    behaviorsTotal: scenario.expectedBehaviors.length,
    output: `Task: ${scenario.taskPrompt}\n\n[Simulated] No agent was executed and nothing was verified.`,
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
        if (options.mode === "real") {
          // Prefer a REAL opencode headless LLM session when the scenario has a prompt.
          if (resolved.taskPrompt?.trim()) {
            return yield* runScenarioReal(resolved, headlessSessionExecutor(), {
              timeoutSeconds: options.timeoutSeconds,
            })
          }
          // Fallback: deterministic shell command in the sandbox.
          const command = process.env.OPENCODE_EVAL_REAL_COMMAND
          if (!command)
            return yield* Effect.die(
              new Error(
                "Real eval mode requires a scenario taskPrompt or OPENCODE_EVAL_REAL_COMMAND (runs in scenario sandbox)",
              ),
            )
          return yield* runScenarioReal(resolved, commandExecutor(command), {
            timeoutSeconds: options.timeoutSeconds,
          })
        }
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

        // Verdictless runs must not read as a regression: compare only what each
        // run actually verified (see compareReportToBaseline).
        const currentPassRate = verifiedPassRate(current.scenarios)
        const baselinePassRate = verifiedPassRate(baseline.scenarios)
        if (currentPassRate === null || baselinePassRate === null) return null
        const passRateDelta = currentPassRate - baselinePassRate
        const durationDelta = current.avgDurationPerScenario - baseline.avgDurationPerScenario

        const newFailures: string[] = []
        const newPasses: string[] = []
        for (const sc of current.scenarios) {
          if (sc.verdict === "unverified") continue
          const other = baseline.scenarios.find((s2) => s2.scenarioId === sc.scenarioId)
          if (!other || other.verdict === "unverified") continue
          if (other.verdict === "pass" && sc.verdict === "fail") newFailures.push(sc.scenarioId)
          if (other.verdict === "fail" && sc.verdict === "pass") newPasses.push(sc.scenarioId)
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

    const detectSustainedRegression: Interface["detectSustainedRegression"] = (suiteId) =>
      Effect.gen(function* () {
        const reports = yield* metricsSvc.listReports(200)
        const candidates = suiteId ? reports.filter((r) => r.suiteId === suiteId) : reports
        const alert = EvalRegression.detectSustained(
          candidates.map((r) => ({
            runId: r.runId,
            suiteId: r.suiteId,
            timestamp: r.timestamp,
            passRate: r.passRate,
          })),
        )
        // A regressor that notifies nobody is decoration, not a guard rail:
        // log at error level so it surfaces wherever logs are actually watched.
        if (alert) log.error("sustained eval regression", { alert: EvalRegression.format(alert) })
        return alert
      })

    const getBaseline: Interface["getBaseline"] = (suiteId) =>      Effect.gen(function* () {
        const all = yield* metricsSvc.listReports(100)
        const candidates = all.filter((r) => r.suiteId === suiteId)
        if (candidates.length === 0) return null

        const recent = candidates.slice(0, Math.min(5, candidates.length))
        // Only scenarios that produced a verdict inform the baseline: an
        // unverified run says nothing about the suite, so it must neither drag
        // the baseline down nor count as a real 0 %.
        const passRates = recent
          .map((r) => verifiedPassRate(r.scenarios))
          .filter((rate): rate is number => rate !== null)
          .sort((a, b) => a - b)
        const durations = recent.map((r) => r.avgDurationPerScenario).sort((a, b) => a - b)

        const median = <T>(sorted: T[]): T => sorted[Math.floor(sorted.length / 2)]

        // Per-scenario baseline across runs
        const scenarioResults: Record<string, { passRate: number; avgDurationMs: number }> = {}
        const scenarioPasses = new Map<string, number[]>()
        const scenarioDurations = new Map<string, number[]>()

        for (const r of recent) {
          for (const s of r.scenarios) {
            if (s.verdict === "unverified") continue
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
          passRate: passRates.length > 0 ? median(passRates) : 0,
          avgDurationMs: median(durations),
          runCount: recent.length,
          scenarioResults,
        }
      })

    const compareToBaseline: Interface["compareToBaseline"] = (report) =>
      Effect.gen(function* () {
        const baseline = yield* getBaseline(report.suiteId)
        if (!baseline) return null
        return compareReportToBaseline(report, baseline)
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
      detectSustainedRegression: detectSustainedRegression as any,
      getBaseline: getBaseline as any,
      compareToBaseline: compareToBaseline as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as Eval from "./index"
