import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"

const log = Log.create({ service: "daemon.idle" })

// ── Report types ────────────────────────────────────────────────────────

interface GitPulse {
  branch: string
  dirtyFiles: number
  uncommittedFiles: string[]
  linesAdded: number
  linesRemoved: number
  changeTypes: Record<string, number>
  recentCommits: { hash: string; message: string; daysAgo: number }[]
}

interface TypecheckSnapshot {
  exitCode: number | null
  errorCount: number
  output: string
  ranAt: string
  lastCleanAt: string | null
}

interface IdleReport {
  timestamp: string
  git: GitPulse | null
  typecheck: TypecheckSnapshot | null
  summary: string
}

// ── Report directory ────────────────────────────────────────────────────

function reportsDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencodev2", "reports")
}

function latestReportPath(): string {
  return path.join(reportsDir(), "latest.json")
}

// ── Git pulse ───────────────────────────────────────────────────────────

function runGit(...args: string[]): string | null {
  try {
    return execSync(`git ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch {
    return null
  }
}

function getGitPulse(): GitPulse | null {
  try {
    const branch = runGit("rev-parse", "--abbrev-ref", "HEAD")
    if (!branch) return null

    const status = runGit("status", "--porcelain") ?? ""
    const dirtyLines = status.split("\n").filter((l) => l.trim().length > 0)
    const dirtyFiles = dirtyLines.length
    const uncommittedFiles = dirtyLines.map((l) => l.slice(3).trim()).filter(Boolean)

    // Git diff --stat for line-level change analysis
    const diffStat = runGit("diff", "--stat") ?? ""
    let linesAdded = 0
    let linesRemoved = 0
    for (const line of diffStat.split("\n")) {
      const insertMatch = line.match(/(\d+) insertion/)
      const deleteMatch = line.match(/(\d+) deletion/)
      if (insertMatch) linesAdded += Number(insertMatch[1])
      if (deleteMatch) linesRemoved += Number(deleteMatch[1])
    }

    // Analyse des types de fichiers modifiés
    const changeTypes: Record<string, number> = {}
    for (const f of uncommittedFiles) {
      const ext = path.extname(f).toLowerCase() || "(no ext)"
      changeTypes[ext] = (changeTypes[ext] ?? 0) + 1
    }

    // Recent commits (24h + last 20)
    const logOutput = runGit("log", "--oneline", "--since=24 hours ago", "-20") ?? ""
    const recentCommits = logOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, ...msgParts] = line.split(" ")
        return {
          hash: hash ?? "",
          message: msgParts.join(" ") || "",
          daysAgo: 0,
        }
      })

    return {
      branch,
      dirtyFiles,
      uncommittedFiles: uncommittedFiles.slice(0, 20),
      linesAdded,
      linesRemoved,
      changeTypes,
      recentCommits,
    }
  } catch {
    return null
  }
}

// ── Typecheck snapshot ──────────────────────────────────────────────────

// ── Typecheck history tracking ───────────────────────────────────────────

function typecheckHistoryDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencodev2", "typecheck-history")
}

function typecheckHistoryFile(): string {
  return path.join(typecheckHistoryDir(), "history.json")
}

interface TypecheckHistoryEntry {
  ranAt: string
  exitCode: number | null
  errorCount: number
}

function readTypecheckHistory(): TypecheckHistoryEntry[] {
  try {
    const file = typecheckHistoryFile()
    if (!fs.existsSync(file)) return []
    return JSON.parse(fs.readFileSync(file, "utf-8")) as TypecheckHistoryEntry[]
  } catch {
    return []
  }
}

function appendTypecheckHistory(entry: TypecheckHistoryEntry): void {
  try {
    const dir = typecheckHistoryDir()
    fs.mkdirSync(dir, { recursive: true })
    const history = readTypecheckHistory()
    history.push(entry)
    // Keep last 50 entries
    const trimmed = history.slice(-50)
    fs.writeFileSync(typecheckHistoryFile(), JSON.stringify(trimmed, null, 2))
  } catch { /* best-effort */ }
}

function getLastCleanAt(): string | null {
  const history = readTypecheckHistory()
  for (const entry of history.reverse()) {
    if (entry.exitCode === 0) return entry.ranAt
  }
  return null
}

// ── Typecheck snapshot ──────────────────────────────────────────────────

function getTypecheckSnapshot(): TypecheckSnapshot | null {
  const ranAt = new Date().toISOString()

  // Try package-level typecheck first, then root
  const packageDirs = ["packages/opencode", "packages/core", "packages/sdk/js"]
  for (const dir of packageDirs) {
    const pkgPath = path.join(process.cwd(), dir, "package.json")
    if (!fs.existsSync(pkgPath)) continue

    try {
      const result = execSync("bun typecheck", {
        encoding: "utf-8",
        timeout: 30000,
        cwd: path.join(process.cwd(), dir),
        stdio: ["ignore", "pipe", "pipe"],
      })
      const snapshot: TypecheckSnapshot = {
        exitCode: 0, errorCount: 0, output: result.trim(), ranAt,
        lastCleanAt: getLastCleanAt() ?? ranAt,
      }
      appendTypecheckHistory({ ranAt, exitCode: 0, errorCount: 0 })
      return snapshot
    } catch (e: any) {
      const output = e?.stdout ?? e?.stderr ?? String(e)
      const cleaned = String(output).trim()

      // Count error lines (lines containing "error")
      const errorLines = cleaned.split("\n").filter((l) => l.includes("error"))
      const errorCount = errorLines.length

      const snapshot: TypecheckSnapshot = {
        exitCode: (e?.status as number) ?? 1,
        errorCount,
        output: cleaned,
        ranAt,
        lastCleanAt: getLastCleanAt(),
      }
      appendTypecheckHistory({ ranAt, exitCode: snapshot.exitCode, errorCount })
      return snapshot
    }
  }

  return null
}

// ── Report generation ───────────────────────────────────────────────────

function generateSummary(report: IdleReport): string {
  const parts: string[] = []

  if (report.git) {
    parts.push(`on branch "${report.git.branch}"`)
    if (report.git.dirtyFiles > 0) {
      parts.push(`${report.git.dirtyFiles} dirty file(s)`)
    }
    if (report.git.linesAdded > 0 || report.git.linesRemoved > 0) {
      parts.push(`+${report.git.linesAdded}/-${report.git.linesRemoved} lines`)
    }
    const changeSummary = Object.entries(report.git.changeTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ext, count]) => `${ext}(${count})`)
      .join(" ")
    if (changeSummary) parts.push(`changes: ${changeSummary}`)
    if (report.git.recentCommits.length > 0) {
      parts.push(`${report.git.recentCommits.length} commit(s) in 24h`)
    }
  } else {
    parts.push("no git repo detected")
  }

  if (report.typecheck) {
    if (report.typecheck.exitCode === 0) {
      parts.push("typecheck: ✅ clean")
    } else {
      const lastClean = report.typecheck.lastCleanAt
        ? ` (last clean: ${report.typecheck.lastCleanAt.slice(0, 10)})`
        : ""
      parts.push(`typecheck: ❌ ${report.typecheck.errorCount} error(s)${lastClean}`)
    }
  } else {
    parts.push("typecheck: ⏭️ skipped")
  }

  return parts.join(" · ")
}

function writeReport(report: IdleReport): void {
  const dir = reportsDir()
  fs.mkdirSync(dir, { recursive: true })

  // Write latest (overwrite)
  fs.writeFileSync(latestReportPath(), JSON.stringify(report, null, 2))

  // Write timestamped archive (keep last 20)
  const archivePath = path.join(dir, `idle-${Date.now()}.json`)
  fs.writeFileSync(archivePath, JSON.stringify(report, null, 2))

  // Cleanup old reports (keep last 20)
  cleanupOldReports(dir, 20)
}

function cleanupOldReports(dir: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("idle-") && f.endsWith(".json"))
      .sort()
      .reverse()

    for (const old of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(dir, old))
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

/**
 * Read the latest idle report (for agent session startup).
 */
export function readLatestReport(): IdleReport | null {
  try {
    if (!fs.existsSync(latestReportPath())) return null
    return JSON.parse(fs.readFileSync(latestReportPath(), "utf-8")) as IdleReport
  } catch {
    return null
  }
}

// ── Idle analysis ───────────────────────────────────────────────────────

/**
 * Run idle workspace analysis: git pulse + typecheck snapshot.
 * Called when the daemon has no triggers to process.
 */
export const runIdleAnalysis = Effect.fnUntraced(function* () {
  log.info("Running idle workspace analysis...")

  const git = getGitPulse()
  if (git) {
    log.info("Git pulse", {
      branch: git.branch,
      dirtyFiles: git.dirtyFiles,
      commits: git.recentCommits.length,
    })
  }

  const typecheck = getTypecheckSnapshot()
  if (typecheck) {
    log.info("Typecheck snapshot", {
      clean: typecheck.exitCode === 0,
      errors: typecheck.errorCount,
    })
  }

  const report: IdleReport = {
    timestamp: new Date().toISOString(),
    git,
    typecheck,
    summary: "",
  }
  report.summary = generateSummary(report)
  writeReport(report)

  log.info("Idle report written", { summary: report.summary })
})

export * as IdleLoop from "./idle"
