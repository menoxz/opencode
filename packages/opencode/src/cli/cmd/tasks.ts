import * as fs from "node:fs"
import * as path from "node:path"
import { EOL } from "node:os"
import { cmd } from "./cmd"
import { readLatestReport } from "../../daemon/idle"

// ── Task queue helpers ──────────────────────────────────────────────────

interface TaskItem {
  triggerId: string
  source: string
  payload: unknown
  receivedAt: string
  status: "pending" | "processing" | "done"
}

function tasksDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencode", "tasks")
}

function pendingTasks(): TaskItem[] {
  const dir = tasksDir()
  if (!fs.existsSync(dir)) return []

  const tasks: TaskItem[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const task = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as TaskItem
      if (task.status === "pending") tasks.push(task)
    } catch { /* skip corrupt */ }
  }
  return tasks
}

function allTasks(): TaskItem[] {
  const dir = tasksDir()
  if (!fs.existsSync(dir)) return []

  const tasks: TaskItem[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const task = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as TaskItem
      tasks.push(task)
    } catch { /* skip corrupt */ }
  }
  return tasks
}

function markDone(triggerId: string): boolean {
  const file = path.join(tasksDir(), `${triggerId}.json`)
  if (!fs.existsSync(file)) return false
  try {
    const task = JSON.parse(fs.readFileSync(file, "utf-8")) as TaskItem
    task.status = "done"
    fs.writeFileSync(file, JSON.stringify(task, null, 2))
    return true
  } catch { return false }
}

// ── Top-level command ───────────────────────────────────────────────────

export const TasksCommand = cmd({
  command: "tasks",
  describe: "Manage the trigger task queue",
  builder: (yargs) =>
    yargs
      .command(ListCommand)
      .command(ProcessCommand)
      .command(ReportCommand)
      .demandCommand(1, "Specify a subcommand: list, process, report"),
  async handler() {},
})

// ── list ────────────────────────────────────────────────────────────────

const ListCommand = cmd({
  command: "list",
  describe: "List pending tasks from the trigger queue",
  builder: (yargs) =>
    yargs.option("all", {
      type: "boolean",
      describe: "Show all tasks (including done)",
      default: false,
    }),
  async handler(args) {
    const tasks = args.all ? allTasks() : pendingTasks()

    if (tasks.length === 0) {
      process.stdout.write(`📋 No ${args.all ? "" : "pending "}tasks in the queue${EOL}`)
      return
    }

    process.stdout.write(`📋 ${tasks.length} task(s) in the queue:${EOL}`)
    process.stdout.write("─".repeat(60) + EOL)

    for (const task of tasks) {
      const statusIcon = task.status === "pending" ? "⏳" : task.status === "processing" ? "🔄" : "✅"
      const payload = task.payload as Record<string, unknown> | undefined
      const repo = payload?.repo ?? "?"
      const action = payload?.action ?? "?"
      process.stdout.write(
        `  ${statusIcon} ${task.source.padEnd(20)} ${String(repo).padEnd(20)} ${String(action).padEnd(15)} ${task.status}` + EOL,
      )
      process.stdout.write(`     ID: ${task.triggerId}` + EOL)
      process.stdout.write(`     Received: ${task.receivedAt}` + EOL)
    }
  },
})

// ── process ─────────────────────────────────────────────────────────────

const ProcessCommand = cmd({
  command: "process [id]",
  describe: "Mark a task as done (or all pending tasks if no ID given)",
  builder: (yargs) =>
    yargs
      .positional("id", {
        describe: "Trigger ID to mark as done (omit for all pending)",
        type: "string",
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be done without actually doing it",
        default: false,
      }),
  async handler(args) {
    const id = args.id as string | undefined

    if (id) {
      if (args["dry-run"]) {
        process.stdout.write(`🔍 Would mark task ${id} as done${EOL}`)
        return
      }
      const ok = markDone(id)
      if (ok) process.stdout.write(`✅ Task ${id} marked as done${EOL}`)
      else process.stdout.write(`❌ Task ${id} not found${EOL}`)
      return
    }

    const pending = pendingTasks()
    if (pending.length === 0) {
      process.stdout.write(`📋 No pending tasks to process${EOL}`)
      return
    }

    if (args["dry-run"]) {
      process.stdout.write(`🔍 Would mark ${pending.length} task(s) as done:${EOL}`)
      for (const t of pending) {
        process.stdout.write(`   - ${t.triggerId} (${t.source})${EOL}`)
      }
      return
    }

    let count = 0
    for (const t of pending) {
      markDone(t.triggerId)
      count++
    }
    process.stdout.write(`✅ ${count} task(s) marked as done${EOL}`)
  },
})

// ── report ──────────────────────────────────────────────────────────────

const ReportCommand = cmd({
  command: "report",
  describe: "Show the latest idle-analysis report from the daemon",
  async handler() {
    const report = readLatestReport()
    if (!report) {
      process.stdout.write(`📊 No idle report available yet${EOL}`)
      process.stdout.write(`   The daemon generates one after each trigger check cycle${EOL}`)
      return
    }

    process.stdout.write(`📊 Idle Analysis Report${EOL}`)
    process.stdout.write(`   Timestamp: ${report.timestamp}${EOL}`)
    process.stdout.write(`   Summary:   ${report.summary}${EOL}`)
    process.stdout.write("─".repeat(50) + EOL)

    if (report.git) {
      process.stdout.write(`   Branch:     ${report.git.branch}${EOL}`)
      process.stdout.write(`   Dirty:      ${report.git.dirtyFiles} file(s)${EOL}`)
      process.stdout.write(`   Commits:    ${report.git.recentCommits.length} recent${EOL}`)

      if (report.git.uncommittedFiles.length > 0) {
        process.stdout.write(`   Files:${EOL}`)
        for (const f of report.git.uncommittedFiles.slice(0, 10)) {
          process.stdout.write(`     · ${f}${EOL}`)
        }
        if (report.git.uncommittedFiles.length > 10) {
          process.stdout.write(`     … and ${report.git.uncommittedFiles.length - 10} more${EOL}`)
        }
      }
    }

    if (report.typecheck) {
      const status = report.typecheck.exitCode === 0 ? "✅ Clean" : `❌ ${report.typecheck.errorCount} error(s)`
      process.stdout.write(`   Typecheck:  ${status}${EOL}`)
      if (report.typecheck.exitCode !== 0 && report.typecheck.output.length > 0) {
        process.stdout.write(`   Errors:${EOL}`)
        const lines = report.typecheck.output.split("\n").filter((l) => l.includes("error"))
        for (const line of lines.slice(0, 5)) {
          process.stdout.write(`     · ${line.trim()}${EOL}`)
        }
        if (lines.length > 5) {
          process.stdout.write(`     … and ${lines.length - 5} more${EOL}`)
        }
      }
    } else {
      process.stdout.write(`   Typecheck:  ⏭️  skipped${EOL}`)
    }

    process.stdout.write("─".repeat(50) + EOL)
  },
})
