import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Config } from "@/config/config"
import { ConfigTasks } from "@/config/tasks"
import { InstanceState } from "@/effect/instance-state"
import { Shell } from "@/shell/shell"
import * as Process from "@/util/process"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import path from "path"

const DESCRIPTION = [
  "Manage and run named, repeatable shell tasks (VSCode tasks.json-style).",
  "Tasks come from the `tasks` key of opencode config and/or a workspace",
  "tasks.json file. Use action='list' to see available tasks, or action='run'",
  "with a task `name` to execute it. Tasks may declare a shell, cwd, env,",
  "timeout, and dependsOn (other tasks run first, in order). Live status",
  "(running/done/failed) streams to the TUI.",
].join(" ")

export const Parameters = Schema.Struct({
  action: Schema.optional(
    Schema.Literals(["list", "run"]).annotate({
      description: "What to do: 'list' the defined tasks, or 'run' a task. Defaults to 'list'.",
    }),
  ),
  name: Schema.optional(
    Schema.String.annotate({
      description: "Name of the task to run (required when action='run').",
    }),
  ),
})

const DEFAULT_TIMEOUT_MS = 120_000

type TaskMap = ConfigTasks.Map

interface StepResult {
  name: string
  command: string
  code: number
  durationMs: number
  stdout: string
  stderr: string
}

const decodeVscodeSync = Schema.decodeUnknownSync(ConfigTasks.VscodeFile)

/** Parse + decode a VSCode tasks.json string; returns undefined on any failure. */
function decodeVscode(text: string): ConfigTasks.VscodeFile | undefined {
  try {
    return decodeVscodeSync(JSON.parse(text))
  } catch {
    return undefined
  }
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n")
}

function renderList(tasks: TaskMap): string {
  const names = Object.keys(tasks)
  if (names.length === 0) {
    return "No tasks defined. Add them under the `tasks` key of opencode config or a workspace tasks.json."
  }
  const lines = ["Available tasks:", ""]
  for (const name of names) {
    const t = tasks[name]!
    const meta: string[] = []
    if (t.group) meta.push(`group=${t.group}`)
    if (t.dependsOn?.length) meta.push(`dependsOn=[${t.dependsOn.join(", ")}]`)
    const suffix = meta.length ? `  (${meta.join(", ")})` : ""
    lines.push(`• ${name}: ${t.description ?? t.command}${suffix}`)
    if (t.description) lines.push(`    $ ${t.command}`)
  }
  return lines.join("\n")
}

export const TasksTool = Tool.define(
  "tasks",
  Effect.gen(function* () {
    const config = yield* Config.Service
    const afs = yield* AppFileSystem.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (input: typeof Parameters.Type, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult> =>
        Effect.gen(function* () {
          const directory = yield* InstanceState.directory
          const cfg = yield* config.get()
          const defaultShell = Shell.acceptable(cfg.shell)

          // Load tasks: config `tasks` key + workspace tasks.json (config wins on collisions).
          const merged: Record<string, ConfigTasks.Info> = { ...(cfg.tasks ?? {}) }
          const candidates = [
            path.join(directory, "tasks.json"),
            path.join(directory, ".vscode", "tasks.json"),
          ]
          for (const file of candidates) {
            const text = yield* afs.readFileStringSafe(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (!text) continue
            const decoded = decodeVscode(text)
            if (!decoded) continue
            for (const [k, v] of Object.entries(ConfigTasks.fromVscode(decoded))) {
              if (!(k in merged)) merged[k] = v
            }
          }
          const tasks = merged as TaskMap

          const action = input.action ?? "list"

          if (action === "list") {
            const names = Object.keys(tasks)
            return {
              title: `tasks: ${names.length} defined`,
              metadata: { count: names.length, names },
              output: renderList(tasks),
            }
          }

          // action === "run"
          if (!input.name) {
            return {
              title: "tasks: missing name",
              metadata: { error: "missing_name" },
              output: "action='run' requires a task `name`. Use action='list' to see available tasks.",
            }
          }
          if (!(input.name in tasks)) {
            const available = Object.keys(tasks).join(", ") || "(none)"
            return {
              title: `tasks: unknown task ${input.name}`,
              metadata: { error: "unknown_task", name: input.name },
              output: `Unknown task '${input.name}'. Available: ${available}`,
            }
          }

          // Resolve execution order: dependsOn first (DFS, cycle-guarded), then the task itself.
          const order: string[] = []
          const visiting = new Set<string>()
          const visited = new Set<string>()
          const resolve = (name: string): string | undefined => {
            if (visited.has(name)) return
            if (visiting.has(name)) return `Cyclic dependency detected at task '${name}'`
            const task = tasks[name]
            if (!task) return `Task '${name}' (a dependency) is not defined`
            visiting.add(name)
            for (const dep of task.dependsOn ?? []) {
              const err = resolve(dep)
              if (err) return err
            }
            visiting.delete(name)
            visited.add(name)
            order.push(name)
            return
          }
          const resolveError = resolve(input.name)
          if (resolveError) {
            return {
              title: `tasks: ${input.name} failed`,
              metadata: { error: "dependency_error", name: input.name },
              output: resolveError,
            }
          }

          const results: StepResult[] = []
          const statusLine = (current: string, state: string) =>
            order
              .map((n) => {
                if (n === current) return `▶ ${n} (${state})`
                const done = results.find((r) => r.name === n)
                if (done) return `${done.code === 0 ? "✓" : "✗"} ${n}`
                return `· ${n}`
              })
              .join("\n")

          for (const name of order) {
            const task = tasks[name]!
            const shell = Shell.acceptable(task.shell) ?? defaultShell
            const cwd = task.cwd ? path.resolve(directory, task.cwd) : directory
            const env = { ...process.env, ...(task.env ?? {}) }
            const timeout = task.timeout ?? DEFAULT_TIMEOUT_MS

            yield* ctx.metadata({
              title: `tasks: running ${name}`,
              metadata: { status: "running", current: name, order, progress: statusLine(name, "running") },
            })

            const start = Date.now()
            const result = yield* Effect.tryPromise(() =>
              Process.run([task.command], {
                shell: shell ?? true,
                cwd,
                env,
                timeout,
                nothrow: true,
              }),
            ).pipe(
              Effect.catch((e) =>
                Effect.succeed({
                  code: -1,
                  stdout: Buffer.from(""),
                  stderr: Buffer.from(String((e as any)?.message ?? e)),
                } as Process.Result),
              ),
            )
            const durationMs = Date.now() - start
            const step: StepResult = {
              name,
              command: task.command,
              code: result.code,
              durationMs,
              stdout: result.stdout.toString().trim(),
              stderr: result.stderr.toString().trim(),
            }
            results.push(step)

            if (step.code !== 0) {
              yield* ctx.metadata({
                title: `tasks: ${name} failed`,
                metadata: { status: "failed", current: name, order, progress: statusLine(name, "failed") },
              })
              break
            }
            yield* ctx.metadata({
              title: `tasks: ${name} done`,
              metadata: { status: "done", current: name, order, progress: statusLine(name, "done") },
            })
          }

          const failed = results.find((r) => r.code !== 0)
          const lines: string[] = []
          for (const r of results) {
            const icon = r.code === 0 ? "✓" : "✗"
            lines.push(`${icon} ${r.name}  (exit ${r.code}, ${r.durationMs}ms)  $ ${r.command}`)
            if (r.stdout) lines.push(indent(r.stdout))
            if (r.stderr) lines.push(indent(r.stderr))
          }
          const summary = failed
            ? `Task '${input.name}' FAILED at step '${failed.name}' (exit ${failed.code}).`
            : `Task '${input.name}' completed successfully (${results.length} step${results.length > 1 ? "s" : ""}).`

          return {
            title: failed ? `tasks: ${input.name} failed` : `tasks: ${input.name} done`,
            metadata: {
              status: failed ? "failed" : "done",
              task: input.name,
              steps: results.map((r) => ({ name: r.name, code: r.code, durationMs: r.durationMs })),
            },
            output: [summary, "", ...lines].join("\n"),
          }
        }),
    }
  }),
)
