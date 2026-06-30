export * as ConfigTasks from "./tasks"

import { Schema } from "effect"

/**
 * A single task definition — a named, repeatable command (à la VSCode tasks.json).
 *
 * Tasks can be declared two ways, both merged into the same map:
 *  1. Inline under the `tasks` key of opencode config.
 *  2. In a workspace `tasks.json` file (VSCode-style `{ "version", "tasks": [...] }`),
 *     loaded by ConfigTasks.fromVscode().
 */
export const Info = Schema.Struct({
  /** Shell command line to run. Required. */
  command: Schema.String.annotate({
    description: "The shell command line to execute for this task",
  }),
  /** Human-readable label/description shown in the TUI and prompts. */
  description: Schema.optional(Schema.String).annotate({
    description: "Human-readable description of what the task does",
  }),
  /** Working directory (relative to the workspace root, or absolute). */
  cwd: Schema.optional(Schema.String).annotate({
    description: "Working directory for the command (relative to workspace root or absolute)",
  }),
  /** Override the shell used to run the command (e.g. \"pwsh\", \"bash\"). */
  shell: Schema.optional(Schema.String).annotate({
    description: "Shell to run the command with (defaults to the configured/platform shell)",
  }),
  /** Extra environment variables for the task. */
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Additional environment variables for the task",
  }),
  /** Logical group: build | test | lint | run | other (free-form). */
  group: Schema.optional(Schema.String).annotate({
    description: "Logical group for the task: build, test, lint, run, etc.",
  }),
  /** Names of other tasks that must succeed before this one (sequential). */
  dependsOn: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Names of other tasks to run (in order) before this task",
  }),
  /** Timeout in milliseconds for the task. */
  timeout: Schema.optional(Schema.Number).annotate({
    description: "Timeout in milliseconds before the task is aborted",
  }),
}).annotate({ identifier: "ConfigTask" })

export type Info = Schema.Schema.Type<typeof Info>

/** Map of task-name -> task definition (the shape used in opencode config). */
export const Map = Schema.Record(Schema.String, Info)
export type Map = Schema.Schema.Type<typeof Map>

/**
 * VSCode-style tasks.json shape: `{ "version": "2.0.0", "tasks": [ ... ] }`.
 * Each entry has at least a `label`; the rest is mapped onto our Info.
 */
const VscodeTask = Schema.Struct({
  label: Schema.String,
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  type: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
  group: Schema.optional(
    Schema.Union([Schema.String, Schema.Struct({ kind: Schema.optional(Schema.String) })]),
  ),
  options: Schema.optional(
    Schema.Struct({
      cwd: Schema.optional(Schema.String),
      env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      shell: Schema.optional(
        Schema.Union([Schema.String, Schema.Struct({ executable: Schema.optional(Schema.String) })]),
      ),
    }),
  ),
})

export const VscodeFile = Schema.Struct({
  version: Schema.optional(Schema.String),
  tasks: Schema.optional(Schema.Array(VscodeTask)),
})
export type VscodeFile = Schema.Schema.Type<typeof VscodeFile>

/**
 * Convert a parsed VSCode tasks.json object into our task Map.
 * - `label` becomes the task name (key).
 * - `command` + `args` are joined into a single command line.
 * - `group` (string or { kind }) is flattened.
 * - `options.cwd/env/shell` are mapped onto Info.
 */
export function fromVscode(file: VscodeFile): Map {
  const out: Record<string, Info> = {}
  for (const t of file.tasks ?? []) {
    if (!t.command) continue
    const command = t.args && t.args.length > 0 ? [t.command, ...t.args].join(" ") : t.command
    const group =
      typeof t.group === "string" ? t.group : t.group && "kind" in t.group ? t.group.kind : undefined
    const shell =
      typeof t.options?.shell === "string"
        ? t.options.shell
        : t.options?.shell && "executable" in t.options.shell
          ? t.options.shell.executable
          : undefined
    out[t.label] = {
      command,
      description: t.detail,
      cwd: t.options?.cwd,
      env: t.options?.env,
      shell,
      group,
    }
  }
  return out
}
