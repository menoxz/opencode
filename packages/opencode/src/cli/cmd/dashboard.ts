import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import { EOL } from "node:os"
import { cmd } from "./cmd"
import { readLatestReport } from "../../daemon/idle"
import { readUnacknowledged } from "../../daemon/notifications"
import { isExecutorBusy } from "../../daemon/auto-executor"
import { daemonDir } from "./watch"

// ── ANSI color helpers ───────────────────────────────────────────────────

const BOLD = "\x1b[1m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const MAGENTA = "\x1b[35m"
const GRAY = "\x1b[90m"
const RESET = "\x1b[0m"

function colored(status: boolean, yes: string, no: string): string {
  return status ? `${GREEN}${yes}${RESET}` : `${RED}${no}${RESET}`
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(path.join(daemonDir(), "daemon.pid"), "utf-8").trim()
    const pid = Number(raw)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getUptime(pid: number): string {
  try {
    // PowerShell to get process start time
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString('yyyy-MM-dd HH:mm:ss')"`,
      { encoding: "utf-8", timeout: 3000 },
    ).trim()
    const started = new Date(out)
    const diffMs = Date.now() - started.getTime()
    const hours = Math.floor(diffMs / 3600000)
    const minutes = Math.floor((diffMs % 3600000) / 60000)
    const secs = Math.floor((diffMs % 60000) / 1000)
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h`
    }
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  } catch {
    return "?"
  }
}

function getMemoryUsage(pid: number): string {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64 / 1MB"`,
      { encoding: "utf-8", timeout: 3000 },
    ).trim()
    // Handle locale-specific decimal separator (e.g. French uses comma)
    const normalized = out.replace(",", ".")
    const mb = Number(normalized)
    return Number.isFinite(mb) ? `${Math.round(mb)} MB` : "?"
  } catch {
    return "?"
  }
}

// ── Task counter ──────────────────────────────────────────────────────────

interface TaskCounts {
  pending: number
  processing: number
  done: number
}

function countTasks(): TaskCounts {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  const dir = path.join(base, "opencode", "tasks")
  if (!fs.existsSync(dir)) return { pending: 0, processing: 0, done: 0 }

  const counts: TaskCounts = { pending: 0, processing: 0, done: 0 }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const task = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as { status: string }
      if (task.status === "pending") counts.pending++
      else if (task.status === "processing") counts.processing++
      else if (task.status === "done") counts.done++
    } catch { /* skip corrupt */ }
  }
  return counts
}

// ── Dashboard ────────────────────────────────────────────────────────────

function hr(char = "─"): string {
  return char.repeat(58)
}

function section(title: string): void {
  process.stdout.write(`${EOL} ${BOLD}${CYAN}${title}${RESET}${EOL}`)
  process.stdout.write(` ${hr("─")}${EOL}`)
}

function label(key: string, value: string): void {
  process.stdout.write(` ${key.padEnd(18)} ${value}${EOL}`)
}

// ── Main handler ─────────────────────────────────────────────────────────

export const DashboardCommand = cmd({
  command: "dashboard",
  describe: "Show a live status dashboard for the daemon and task system",
  builder: (yargs) =>
    yargs.option("watch", {
      type: "boolean",
      describe: "Auto-refresh every 5 seconds (like top)",
      default: false,
    }),
  async handler(args) {
    const watchMode = args.watch ?? false

    const render = () => {
      // ── Clear screen on refresh ──
      if (watchMode) process.stdout.write("\x1b[2J\x1b[H")

      // ── Header ──
      const now = new Date().toISOString().replace("T", " ").slice(0, 19)
      process.stdout.write(`${EOL} ${BOLD}🧠 OpenCode Daemon Dashboard${RESET}  ${GRAY}${now}${RESET}${EOL}`)
      process.stdout.write(` ${hr("━")}${EOL}`)

      // ── 1. Daemon Status ──
      section("Daemon Status")
      const pid = readPid()
      const running = pid !== null && isProcessRunning(pid)

      if (running) {
        label("Status", colored(true, "● RUNNING", "● STOPPED"))
        label("PID", `${pid}`)
        label("Uptime", getUptime(pid!))
        label("Memory", getMemoryUsage(pid!))
        label("PID file", path.join(daemonDir(), "daemon.pid"))
      } else {
        label("Status", colored(false, "● RUNNING", "● STOPPED"))
        if (pid) label("Stale PID", `${pid} (process dead)`)
        else label("Info", "Daemon not started")
        label("Start it", "opencode daemon start")
      }

      // ── 2. Auto-Executor ──
      section("Auto-Executor")
      const busy = isExecutorBusy()
      label("Status", busy
        ? `${YELLOW}● BUSY${RESET}`
        : `${GREEN}● IDLE${RESET}`)
      label("Run now", "opencode tasks execute [id]")

      // ── 3. Task Queue ──
      section("Task Queue")
      const counts = countTasks()
      label("Pending", counts.pending > 0 ? `${YELLOW}${counts.pending}${RESET}` : "0")
      label("Processing", counts.processing > 0 ? `${YELLOW}${counts.processing}${RESET}` : "0")
      label("Done (total)", `${counts.done}`)
      label("Total", `${counts.pending + counts.processing + counts.done}`)
      label("View tasks", "opencode tasks list")
      label("View all", "opencode tasks list --all")

      // ── 4. Notifications ──
      section("Notifications")
      const unacknowledged = readUnacknowledged()
      label("Unread", unacknowledged.length > 0 ? `${YELLOW}${unacknowledged.length}${RESET}` : "0")
      if (unacknowledged.length > 0) {
        const latest = unacknowledged[0]
        const typeColors: Record<string, string> = {
          task_committed: GREEN,
          task_success: GREEN,
          task_failure: RED,
          task_escalated: YELLOW,
          critical_alert: RED,
        }
        const tc = typeColors[latest.type] ?? GRAY
        label("Latest", `${tc}${latest.type}${RESET}`)
        label("Summary", latest.summary.slice(0, 70))
        label("Time", latest.timestamp.slice(0, 19).replace("T", " "))
      } else {
        label("Info", "All caught up!")
      }

      // ── 5. Idle Report ──
      section("Last Idle Report")
      const report = readLatestReport()
      if (report) {
        label("Generated", report.timestamp.slice(0, 19).replace("T", " "))
        label("Summary", report.summary)

        if (report.git) {
          label("Branch", report.git.branch)
          if (report.git.dirtyFiles > 0) {
            label("Dirty files", `${YELLOW}${report.git.dirtyFiles}${RESET}`)
          }
          if (report.git.linesAdded > 0 || report.git.linesRemoved > 0) {
            label("Changes", `+${report.git.linesAdded}/-${report.git.linesRemoved}`)
          }
          if (report.git.recentCommits.length > 0) {
            label("Commits (24h)", `${report.git.recentCommits.length}`)
          }
        }

        if (report.typecheck) {
          const statusText = report.typecheck.exitCode === 0
            ? `${GREEN}✅ Clean${RESET}`
            : `${RED}❌ ${report.typecheck.errorCount} error(s)${RESET}`
          label("Typecheck", statusText)
        }
      } else {
        label("Info", "No idle report yet")
        label("Daemon status", "Run 'opencode daemon start' first")
      }

      // ── 6. Quick Actions ──
      section("Quick Actions")
      label("Daemon", "opencode daemon start|stop|status|logs")
      label("Tasks", "opencode tasks list|execute [id]|report")
      label("Dashboard", "opencode dashboard --watch")

      process.stdout.write(EOL)
    }

    if (watchMode) {
      render()
      const interval = setInterval(render, 5000)
      process.on("SIGINT", () => {
        clearInterval(interval)
        process.stdout.write("\x1b[?25h")
        process.exit(0)
      })
      // Keep alive
      await new Promise(() => {})
    } else {
      render()
    }
  },
})
