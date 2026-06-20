import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import { Effect } from "effect"
import { autoEvaluate, type EvalRunOptions } from "./index"
import { createSandbox, type SandboxOptions } from "./sandbox"
import type { EvalScenario, ScenarioResult } from "./scenario"

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
        const { matched, total } = autoEvaluate(scenario, execution.output, execution.toolCalls, sandboxDir)
        const completedAt = Date.now()
        const success = matched >= Math.ceil(total / 2) && (execution.errors?.length ?? 0) === 0

        return {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          success,
          durationMs: Math.max(completedAt - startedAt, 1),
          tokensUsed: execution.tokensUsed ?? Math.round(execution.output.length * 1.5),
          toolCalls: execution.toolCalls.length,
          errors: execution.errors ?? [],
          behaviorsMatched: matched,
          behaviorsTotal: total,
          output: `Task: ${scenario.taskPrompt}\n\n[Real] Output:\n${execution.output}`,
          startedAt,
          completedAt,
        }
      }),
    options.sandbox,
  )
}
