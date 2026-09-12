import * as fs from "node:fs"
import * as path from "node:path"
import { execSync, spawnSync } from "node:child_process"
import { Effect } from "effect"
import { autoEvaluate, scenarioVerdict, type EvalRunOptions } from "./index"
import { createSandbox, type SandboxOptions } from "./sandbox"
import { UNVERIFIED_PREFIX, type EvalScenario, type ScenarioResult } from "./scenario"

export interface RealScenarioExecution {
  output: string
  toolCalls: string[]
  tokensUsed?: number
  errors?: string[]
}

export type RealScenarioExecutor = (input: {
  scenario: EvalScenario
  cwd: string
  timeoutSeconds: number
}) => Effect.Effect<RealScenarioExecution>

export function commandExecutor(command: string): RealScenarioExecutor {
  return ({ cwd, timeoutSeconds }) =>
    Effect.sync(() => {
      try {
        const stdout = execSync(command, {
          cwd,
          encoding: "utf-8",
          timeout: timeoutSeconds * 1_000,
          stdio: "pipe",
        })
        return {
          output: `[command] ${command}\n${stdout}`,
          toolCalls: ["command"],
          errors: [],
        }
      } catch (error) {
        const err = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
        return {
          output: `[command] ${command}\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}`,
          toolCalls: ["command"],
          errors: [err.message ?? String(error)],
        }
      }
    })
}

/** Headless result JSON emitted by `opencode run --headless`. */
interface HeadlessResult {
  type: "headless_result"
  sessionID: string
  success: boolean
  error: string | null
  summary: { additions: number; deletions: number; files: number } | null
  diffs?: Array<{ file?: string; status?: "added" | "deleted" | "modified"; type?: string }>
  agent: string | null
  model: string | null
}

/** Locate the opencode binary spawn can execute. argv0 → PATH (opencodev2 first, opencode as compat fallback). */
function findOpencodeBinary(): string {
  const argv0 = process.argv[0] ?? ""
  if (/opencodev2(\.exe)?$/i.test(argv0) && fs.existsSync(argv0)) return argv0
  if (/opencode(\.exe)?$/i.test(argv0) && fs.existsSync(argv0)) return argv0
  const names =
    process.platform === "win32"
      ? ["opencodev2.exe", "opencodev2.cmd", "opencodev2.bat", "opencode.exe", "opencode.cmd", "opencode.bat"]
      : ["opencodev2", "opencode"]
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return "opencode"
}

function parseHeadlessResult(output: string): HeadlessResult | null {
  const lines = output.trim().split("\n").filter((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed?.type === "headless_result") return parsed as HeadlessResult
    } catch { /* not JSON, skip */ }
  }
  return null
}

/**
 * Real LLM session executor: spawns `opencode run --headless <taskPrompt>` in the
 * scenario sandbox, then asserts scenario expectations against the model response
 * and the files it produced. Mirrors daemon/auto-executor spawnHeadless.
 */
const WRITE_TYPES = ["add", "added", "modify", "modified", "create", "created"]

export function diffToolCalls(d: { file?: string; status?: string; type?: string }): string[] {
  const kind = d.status ?? d.type ?? "unknown"
  const file = d.file ?? ""
  const base = `${kind}:${file}`
  const w = WRITE_TYPES.includes(kind)
  return w ? [base, `write:${file}`] : [base]
}

export function headlessSessionArgs(taskPrompt: string): string[] {
  return ["run", "--headless", "--dangerously-skip-permissions", "--agent", "eval-runner", taskPrompt]
}

export function headlessSessionCommand(taskPrompt: string): { binary: string; args: string[] } {
  const entry = process.argv[1]
  if (/bun(\.exe)?$/i.test(process.argv[0] ?? "") && entry) {
    const resolved = path.resolve(entry)
    if (fs.existsSync(resolved) && /src[\\/]index\.ts$/i.test(resolved)) {
      return { binary: process.argv[0], args: [resolved, ...headlessSessionArgs(taskPrompt)] }
    }
  }
  return { binary: findOpencodeBinary(), args: headlessSessionArgs(taskPrompt) }
}

export function nativeEvalEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, OPENCODE_DAEMON_AUTO: "1", OPENCODE_NATIVE_EVAL: "1" }
}

/**
 * Execution errors that are environmental rather than a verdict on the agent:
 * the headless child was killed by the OS timeout (`spawnSync … ETIMEDOUT`) or
 * the provider socket dropped mid-session. These are worth one more attempt.
 *
 * Deliberately excludes a bare "headless exited null (no headless_result)": a
 * child that ran and produced no result can be a genuine failure, so it is only
 * retried when it also carries a timeout/socket signature.
 */
const TRANSIENT_EXECUTION_PATTERN =
  /\bETIMEDOUT\b|\bESOCKETTIMEDOUT\b|\bECONNRESET\b|\bECONNREFUSED\b|\bECONNABORTED\b|\bEAI_AGAIN\b|\bEPIPE\b|socket hang up|timed?\s*out|timeout/i

/** True when at least one recorded error is a transient spawn/socket failure. */
export function isTransientExecutionError(errors: readonly string[]): boolean {
  return errors.some((error) => TRANSIENT_EXECUTION_PATTERN.test(error))
}

export function headlessSessionExecutor(
  binaryPath?: string,
): RealScenarioExecutor {
  return ({ scenario, cwd, timeoutSeconds }) =>
    Effect.sync(() => {
      const command = binaryPath
        ? { binary: binaryPath, args: headlessSessionArgs(scenario.taskPrompt) }
        : headlessSessionCommand(scenario.taskPrompt)
      const result = spawnSync(command.binary, command.args, {
        cwd,
        encoding: "utf-8",
        timeout: timeoutSeconds * 1_000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        env: nativeEvalEnvironment(),
      })
      const rawOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
      const headless = parseHeadlessResult(rawOutput)
      const diffs = headless?.diffs ?? []
      const toolCalls = diffs.flatMap(diffToolCalls)
      const errors: string[] = []
      if (result.error) errors.push(result.error.message)
      if (headless && !headless.success) errors.push(headless.error ?? "headless session failed")
      if (!headless && result.status !== 0)
        errors.push(`headless exited ${result.status} (no headless_result)`)
      return {
        output: `[headless ${headless?.model ?? command.binary}]\n${rawOutput}`,
        toolCalls,
        errors,
      }
    })
}

export interface RealRunnerOptions extends Partial<EvalRunOptions> {
  sandbox?: SandboxOptions & { writeSetupFiles?: boolean }
  /**
   * Extra attempts after a transient execution failure (spawn timeout, dropped
   * socket). Default 1, so a flaky headless start cannot be scored as a real
   * scenario failure and trigger a false regression alarm.
   */
  retries?: number
  /** Delay between attempts, in milliseconds. Default 2000. */
  retryDelayMs?: number
}

function writeSetupFiles(scenario: EvalScenario, sandboxDir: string) {
  for (const file of scenario.setupFiles ?? []) {
    const filePath = path.join(sandboxDir, file.path)
    const parent = path.dirname(filePath)
    if (parent !== sandboxDir) fs.mkdirSync(parent, { recursive: true })
    fs.writeFileSync(filePath, file.content)
  }
}

export function runScenarioReal(
  scenario: EvalScenario,
  executor: RealScenarioExecutor,
  options: RealRunnerOptions = {},
): Effect.Effect<ScenarioResult> {
  const maxAttempts = Math.max(1, (options.retries ?? 1) + 1)
  const retryDelayMs = options.retryDelayMs ?? 2_000

  // A fresh sandbox per attempt: a sandbox reused after a timed-out child could
  // carry half-written artifacts and let a retry pass on the previous run's work.
  const attempt = () =>
    createSandbox(
      (sandboxDir) =>
        Effect.gen(function* () {
          const startedAt = Date.now()
          if (options.sandbox?.writeSetupFiles !== false) writeSetupFiles(scenario, sandboxDir)

          const execution = yield* executor({
            scenario,
            cwd: sandboxDir,
            timeoutSeconds: options.timeoutSeconds ?? scenario.timeoutSeconds,
          })
          const grade = autoEvaluate(scenario, execution.output, execution.toolCalls, sandboxDir)
          const completedAt = Date.now()
          const errors = execution.errors ?? []
          // A child killed by a transient spawn/provider failure before it made a
          // single tool call produced no agent verdict at all. Scoring that as a
          // failed scenario turns an environmental outage into a phantom
          // capability regression, so it is reported as unverified instead; the
          // daemon's "verified nothing" guard then skips the run rather than
          // enqueuing a regression investigation.
          const neverExecuted = execution.toolCalls.length === 0 && isTransientExecutionError(errors)
          const verdict = neverExecuted ? "unverified" : scenarioVerdict(grade, errors)

          return {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            success: verdict === "pass",
            verdict,
            durationMs: Math.max(completedAt - startedAt, 1),
            tokensUsed: execution.tokensUsed ?? Math.round(execution.output.length * 1.5),
            toolCalls: execution.toolCalls.length,
            errors:
              verdict === "unverified"
                ? [
                    ...errors,
                    `${UNVERIFIED_PREFIX} ${
                      neverExecuted
                        ? `execution failed before producing any agent verdict (transient: ${errors.join("; ") || "unknown"})`
                        : `${grade.unverified} of ${grade.total} behaviors of "${scenario.id}" could not be checked`
                    }`,
                  ]
                : errors,
            behaviorsMatched: grade.matched,
            behaviorsTotal: grade.total,
            output: `Task: ${scenario.taskPrompt}\n\n[Real] Output:\n${execution.output}`,
            startedAt,
            completedAt,
          }
        }),
      options.sandbox,
    )

  return Effect.gen(function* () {
    let result = yield* attempt()
    for (let n = 1; n < maxAttempts; n++) {
      // Only an environmental failure is retried; an agent that actually ran and
      // failed the scenario keeps its verdict (and its cost is not doubled).
      if (!isTransientExecutionError(result.errors)) return result
      yield* Effect.sleep(retryDelayMs)
      result = yield* attempt()
    }
    return result
  })
}
