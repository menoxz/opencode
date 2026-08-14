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
  diffs?: Array<{ file: string; type: string }>
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

function diffToolCalls(d: { file: string; type: string }): string[] {
  const base = `${d.type}:${d.file}`
  const w = WRITE_TYPES.includes(d.type)
  return w ? [base, `write:${d.file}`] : [base]
}

export function headlessSessionExecutor(
  binaryPath?: string,
): RealScenarioExecutor {
  return ({ scenario, cwd, timeoutSeconds }) =>
    Effect.sync(() => {
      const binary = binaryPath ?? findOpencodeBinary()
      const result = spawnSync(binary, ["run", "--headless", scenario.taskPrompt], {
        cwd,
        encoding: "utf-8",
        timeout: timeoutSeconds * 1_000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, OPENCODE_DAEMON_AUTO: "1" },
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
        output: `[headless ${headless?.model ?? binary}]\n${rawOutput}`,
        toolCalls,
        errors,
      }
    })
}

export interface RealRunnerOptions extends Partial<EvalRunOptions> {
  sandbox?: SandboxOptions & { writeSetupFiles?: boolean }
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
  return createSandbox(
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
        const verdict = scenarioVerdict(grade, errors)

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
              ? [...errors, `${UNVERIFIED_PREFIX} ${grade.unverified} of ${grade.total} behaviors of "${scenario.id}" could not be checked`]
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
}
