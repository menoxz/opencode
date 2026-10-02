import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Config } from "@/config/config"
import { ConfigTasks } from "@/config/tasks"
import { InstanceState } from "@/effect/instance-state"
import { Shell } from "@/shell/shell"
import * as Process from "@/util/process"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { TasksStore } from "./tasks-store"
import path from "path"

export const DESCRIPTION = [
  "Manage and run named, repeatable shell tasks (VSCode tasks.json-style).",
  "Definitions come from the `tasks` key of opencode config, a workspace",
  "tasks.json, or the agent-owned store (.opencode/tasks.json, lowest authority).",
  "Actions: 'list' the definitions, 'get' one or many with source and run state,",
  "'upsert' create or modify a stored task so a command is written once and",
  "then referenced by name, 'delete' stored task(s), 'run' a task",
  "(background=true for a long-lived process), 'stop' and 'restart' the background",
  "processes this server started. Tasks may declare a shell, cwd, env, timeout,",
  "and dependsOn: those prerequisites run first, in order, for both 'run' and a",
  "background start, and a background process is not started at all when one fails.",
  "'restart' deliberately does NOT re-run dependsOn, since the prerequisites of an",
  "already-running process were satisfied by its first start.",
].join(" ")

/** Fields accepted by 'upsert'. All optional so one field can be patched without restating the others. */
const Patch = Schema.Struct({
  command: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  group: Schema.optional(Schema.String),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
  cleanupCommand: Schema.optional(Schema.String),
  timeout: Schema.optional(Schema.Number),
})

export const Parameters = Schema.Struct({
  action: Schema.optional(
    Schema.Literals(["list", "get", "run", "stop", "restart", "upsert", "delete"]).annotate({
      description:
        "'list' definitions and run state | 'get' one or many | 'upsert' create/modify a stored task | 'delete' stored task(s) | 'run' execute a task | 'stop' a background run | 'restart' stop then run. Defaults to 'list'.",
    }),
  ),
  name: Schema.optional(
    Schema.String.annotate({
      description: "Task name, for the single-target actions.",
    }),
  ),
  names: Schema.optional(
    Schema.Array(Schema.String).annotate({
      description: "Task names for the bulk actions (get, stop, restart, delete).",
    }),
  ),
  task: Schema.optional(
    Patch.annotate({
      description:
        "Definition for 'upsert': only the fields to set, each omitted field keeps its stored value. 'command' is required when the task does not exist yet.",
    }),
  ),
  background: Schema.optional(
    Schema.Boolean.annotate({
      description:
        "For 'run': start a long-lived process instead of waiting for completion. Tracked by PID with a log file. dependsOn is resolved first and the process is not started when a prerequisite fails.",
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

/**
 * Resolve the effective task map: config `tasks` key + workspace tasks.json +
 * the agent-owned store, in decreasing authority. Shared by the tool executor
 * and the registry's dynamic description so both see the same catalogue.
 */
export function loadTasks(
  directory: string,
  cfg: Config.Info,
  afs: AppFileSystem.Interface,
): Effect.Effect<TaskMap> {
  return Effect.gen(function* () {
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
    // The agent-owned store has the lowest authority, so it only contributes
    // names no other source already defines; without this an upserted task
    // could never be listed or run.
    const stored = yield* Effect.promise(() => TasksStore.readStore(directory))
    for (const [k, v] of Object.entries(stored)) if (!(k in merged)) merged[k] = v
    return merged as TaskMap
  })
}

/**
 * Dynamic tool-description fragment: the concrete task names a call can run,
 * plus the usage rule. Kept out of the session system prompt so the guidance
 * disappears with the tool and grows only where the tasks are callable.
 */
export function renderTaskCatalog(tasks: TaskMap): string {
  const names = Object.keys(tasks)
  const lines = [
    "How to use this tool: prefer it for repeatable project commands (build, test, lint, run) over hand-rolled shell one-liners; a task may declare dependsOn prerequisites that run first, in order, for 'run' and background starts.",
  ]
  if (names.length === 0) {
    lines.push("No tasks are defined yet; use action='list' to confirm.")
    return lines.join("\n")
  }
  lines.push("Defined tasks (run with action='run'):")
  for (const name of names) {
    const t = tasks[name]!
    lines.push(`- ${name}: ${t.description ?? t.command}`)
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

          // Load tasks: config + workspace tasks.json + agent-owned store (config wins).
          const tasks = yield* loadTasks(directory, cfg, afs)

          const action = input.action ?? "list"

          if (action === "list") {
            const names = Object.keys(tasks)
            return {
              title: `tasks: ${names.length} defined`,
              metadata: { count: names.length, names },
              output: renderList(tasks),
            }
          }

          if (action === "get") {
            const wanted = input.names?.length ? input.names : input.name ? [input.name] : []
            if (wanted.length === 0)
              return {
                title: "tasks: missing name",
                metadata: { error: "missing_name" },
                output: "action='get' requires a task `name` or `names`.",
              }
            const stored = yield* Effect.promise(() => TasksStore.readStore(directory))
            const runs = TasksStore.listRuns(directory)
            const blocks = wanted.map((item) => {
              if (!(item in tasks))
                return `Unknown task '${item}'. Available: ${Object.keys(tasks).join(", ") || "(none)"}`
              const task = tasks[item]!
              const source = item in (cfg.tasks ?? {}) ? "config" : item in stored ? "store" : "workspace"
              const lines = [`${item}  (source: ${source})`, `  command: ${task.command}`]
              for (const [key, value] of Object.entries(task))
                if (key !== "command" && value !== undefined)
                  lines.push(`  ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
              const run = runs.find((candidate) => candidate.name === item)
              lines.push(
                run
                  ? `  run: pid ${run.pid} (${TasksStore.isAlive(run.pid) ? "alive" : "exited"}) since ${new Date(run.startedAt).toISOString()}`
                  : "  run: none",
              )
              return lines.join("\n")
            })
            return {
              title: `tasks: get ${wanted.join(", ")}`,
              metadata: { names: wanted },
              output: blocks.join("\n\n"),
            }
          }

          if (action === "upsert") {
            const name = input.name
            if (!name || !input.task)
              return {
                title: "tasks: missing input",
                metadata: { error: "missing_input" },
                output: "action='upsert' requires a task `name` and a `task` object.",
              }
            const stored = yield* Effect.promise(() => TasksStore.readStore(directory))
            const existing = tasks[name]
            const next: ConfigTasks.Info = { ...(existing ?? { command: "" }), ...input.task }
            if (!next.command)
              return {
                title: "tasks: missing command",
                metadata: { error: "missing_command", name },
                output: `Task '${name}' has no command yet; pass task.command to create it.`,
              }
            const owner = name in (cfg.tasks ?? {}) ? "config" : name in stored ? "store" : existing ? "workspace" : undefined
            if (owner && owner !== "store")
              return {
                title: `tasks: ${name} is ${owner}-owned`,
                metadata: { error: "read_only_source", name, source: owner },
                output: `Task '${name}' comes from the ${owner} source and is not modifiable here. Use another name, or edit that source.`,
              }
            const wrote = yield* Effect.tryPromise(() =>
              TasksStore.writeStore(directory, { ...stored, [name]: next }).then(() => true),
            ).pipe(Effect.orElseSucceed(() => false))
            if (!wrote)
              return {
                title: "tasks: upsert failed",
                metadata: { error: "write_failed", name },
                output: `Could not write ${TasksStore.storePath(directory)}.`,
              }
            return {
              title: `tasks: ${name} ${existing ? "updated" : "created"}`,
              metadata: { status: "stored", name, created: !existing },
              output: `${existing ? "Updated" : "Created"} task '${name}' in ${TasksStore.storePath(directory)}.\n  command: ${next.command}`,
            }
          }

          if (action === "delete") {
            const wanted = input.names?.length ? input.names : input.name ? [input.name] : []
            if (wanted.length === 0)
              return {
                title: "tasks: missing name",
                metadata: { error: "missing_name" },
                output: "action='delete' requires a task `name` or `names`.",
              }
            const stored = yield* Effect.promise(() => TasksStore.readStore(directory))
            const removed = wanted.filter((item) => item in stored)
            const refused = wanted
              .filter((item) => !(item in stored))
              .map((item) => {
                const where = item in (cfg.tasks ?? {}) ? "config" : item in tasks ? "workspace" : "not found"
                return `${item} (${where})`
              })
            const kept = Object.fromEntries(Object.entries(stored).filter(([key]) => !removed.includes(key)))
            if (removed.length)
              yield* Effect.tryPromise(() => TasksStore.writeStore(directory, kept)).pipe(
                Effect.orElseSucceed(() => undefined),
              )
            return {
              title: `tasks: deleted ${removed.length}`,
              metadata: { removed, refused },
              output: [
                removed.length ? `Deleted: ${removed.join(", ")}` : "Deleted: (none)",
                refused.length ? `Refused, edit the owning source: ${refused.join(", ")}` : undefined,
              ]
                .filter((line): line is string => line !== undefined)
                .join("\n"),
            }
          }

          if (action === "stop" || action === "restart") {
            const wanted = input.names?.length
              ? input.names
              : input.name
                ? [input.name]
                : TasksStore.listRuns(directory).map((run) => run.name)
            if (wanted.length === 0)
              return {
                title: "tasks: nothing to stop",
                metadata: { error: "no_runs" },
                output: "No background task is tracked by this server. Pass a `name` or `names`.",
              }
            const lines: string[] = []
            for (const item of wanted) {
              const run = TasksStore.getRun(directory, item)
              if (!run) {
                lines.push(`· ${item}: no background run tracked`)
                continue
              }
              const stopped = yield* Effect.tryPromise(() => TasksStore.stopRun(run)).pipe(
                Effect.orElseSucceed(() => ({ stopped: false, detail: "stop failed" })),
              )
              TasksStore.clearRun(directory, item)
              lines.push(`${stopped.stopped ? "✓" : "✗"} ${item}: ${stopped.detail}`)
              if (action !== "restart") continue
              // Deliberate, not an oversight: a restart does not re-run dependsOn. The
              // prerequisites of a process that was already running are already satisfied.
              const task = tasks[item]
              if (!task) {
                lines.push(`    restart skipped: '${item}' has no definition`)
                continue
              }
              const spawned = yield* Effect.tryPromise(() =>
                TasksStore.spawnTaskBackground({ directory, name: item, task, defaultShell }),
              ).pipe(Effect.orElseSucceed(() => undefined))
              if (!spawned) {
                lines.push("    restart failed")
                continue
              }
              TasksStore.recordRun(directory, spawned)
              lines.push(`    restarted: pid ${spawned.pid}, log ${spawned.logFile}`)
            }
            return { title: `tasks: ${action} ${wanted.length}`, metadata: { action, names: wanted }, output: lines.join("\n") }
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

          // Resolve execution order first: dependsOn first (DFS, cycle-guarded), then the
          // task itself. Both `run` and a background start share this, so a long-lived
          // process is never spawned against prerequisites that never ran.
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

          if (input.background) {
            const name = input.name
            const task = tasks[name]
            // Prerequisites run in the foreground and are awaited: a detached process
            // must not start at all when one fails, matching `run`, which stops at the
            // first failing step.
            const prerequisites = order.filter((step) => step !== name)
            const ran: StepResult[] = []
            for (const dep of prerequisites) {
              const depTask = tasks[dep]!
              const depShell = Shell.acceptable(depTask.shell) ?? defaultShell
              const depCwd = depTask.cwd ? path.resolve(directory, depTask.cwd) : directory
              const depEnv = { ...process.env, ...(depTask.env ?? {}) }
              const start = Date.now()
              const outcome = yield* Effect.tryPromise(() =>
                Process.run([depTask.command], {
                  shell: depShell ?? true,
                  cwd: depCwd,
                  env: depEnv,
                  timeout: depTask.timeout ?? DEFAULT_TIMEOUT_MS,
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
              const step: StepResult = {
                name: dep,
                command: depTask.command,
                code: outcome.code,
                durationMs: Date.now() - start,
                stdout: outcome.stdout.toString().trim(),
                stderr: outcome.stderr.toString().trim(),
              }
              ran.push(step)
              if (step.code !== 0) {
                const detail = ran.map(
                  (r) => `${r.code === 0 ? "✓" : "✗"} ${r.name}  (exit ${r.code}, ${r.durationMs}ms)  $ ${r.command}`,
                )
                return {
                  title: `tasks: ${name} not started`,
                  metadata: {
                    error: "dependency_failed",
                    name,
                    step: dep,
                    steps: ran.map((r) => ({ name: r.name, code: r.code })),
                  },
                  output: [`Dependency '${dep}' failed (exit ${step.code}), so '${name}' was NOT started.`, "", ...detail].join("\n"),
                }
              }
            }
            const spawned = yield* Effect.tryPromise(() =>
              TasksStore.spawnTaskBackground({ directory, name, task, defaultShell }),
            ).pipe(Effect.orElseSucceed(() => undefined))
            if (!spawned)
              return {
                title: `tasks: ${name} failed to start`,
                metadata: { error: "spawn_failed", name },
                output: `Could not start '${name}' in the background.`,
              }
            TasksStore.recordRun(directory, spawned)
            const ranPrerequisites = prerequisites.length
              ? `\n  prerequisites: ${prerequisites.join(" -> ")} (all succeeded)`
              : ""
            return {
              title: `tasks: ${name} started (pid ${spawned.pid})`,
              metadata: { status: "started", name, pid: spawned.pid, log: spawned.logFile, prerequisites },
              output: `Started '${name}' in the background.\n  pid: ${spawned.pid}\n  log: ${spawned.logFile}${ranPrerequisites}\nUse action='get' to read its state, and 'stop' or 'restart' with name='${name}' to manage it.`,
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

          const cleanupCommand = tasks[input.name]?.cleanupCommand
          if (cleanupCommand) {
            const rootTask = tasks[input.name]!
            const shell = Shell.acceptable(rootTask.shell) ?? defaultShell
            const cwd = rootTask.cwd ? path.resolve(directory, rootTask.cwd) : directory
            const env = { ...process.env, ...(rootTask.env ?? {}) }
            yield* ctx.metadata({ title: `tasks: cleanup ${input.name}`, metadata: { status: "cleanup", order } })
            const start = Date.now()
            const result = yield* Effect.tryPromise(() => Process.run([cleanupCommand], {
              shell: shell ?? true, cwd, env, timeout: rootTask.timeout ?? DEFAULT_TIMEOUT_MS, nothrow: true,
            })).pipe(Effect.catch((e) => Effect.succeed({ code: -1, stdout: Buffer.from(""), stderr: Buffer.from(String((e as any)?.message ?? e)) } as Process.Result)))
            results.push({
              name: `${input.name}:cleanup`, command: cleanupCommand, code: result.code, durationMs: Date.now() - start,
              stdout: result.stdout.toString().trim(), stderr: result.stderr.toString().trim(),
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
