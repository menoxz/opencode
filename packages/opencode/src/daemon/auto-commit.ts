import * as fs from "node:fs"
import * as path from "node:path"
import { execSync, type ExecSyncOptions } from "node:child_process"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "daemon.auto-commit" })

// ── Types ───────────────────────────────────────────────────────────────

export interface CommitResult {
  hash: string
  message: string
  filesChanged: number
}

export interface DiffInfo {
  file: string
  type: string
  diff?: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function git(args: string[], cwd: string, options?: ExecSyncOptions): string {
  try {
    const out = execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 15000,
      ...options,
    })
    return String(out).trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("git command failed", { args: args[0], cwd, error: msg.split("\n")[0] })
    return ""
  }
}

/**
 * Check if the working directory has any uncommitted changes.
 */
export function hasUncommittedChanges(cwd: string): boolean {
  const status = git(["status", "--porcelain"], cwd)
  return status.length > 0
}

/**
 * Get the repo root from cwd by running `git rev-parse --show-toplevel`.
 */
export function getRepoRoot(cwd: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 5000,
    }).trim()
  } catch {
    return null
  }
}

/**
 * Generate a conventional commit message from the headless result.
 * Format: feat(scope): summary of changes
 */
export function generateCommitMessage(diffs: DiffInfo[]): string {
  if (!diffs || diffs.length === 0) return "chore: auto-commit from headless task"

  // Collect file extensions to determine scope
  const extensions = new Set(diffs.map((d) => path.extname(d.file).replace(".", "")).filter(Boolean))
  const scope = extensions.size > 0 ? [...extensions].join(",") : undefined

  // Count change types
  const added = diffs.filter((d) => d.type === "add" || d.type === "added")
  const modified = diffs.filter((d) => d.type === "modify" || d.type === "modified")
  const deleted = diffs.filter((d) => d.type === "delete" || d.type === "deleted")

  const parts: string[] = []
  if (added.length > 0) parts.push(`add ${added.length} file(s)`)
  if (modified.length > 0) parts.push(`update ${modified.length} file(s)`)
  if (deleted.length > 0) parts.push(`remove ${deleted.length} file(s)`)

  const description = parts.join(", ") || `change ${diffs.length} file(s)`

  // Use the first file's dir as a hint for scope
  const firstFile = diffs[0]?.file ?? ""
  const scopeHint = firstFile.includes("/") ? firstFile.split("/")[0] : scope

  const type = deleted.length > added.length + modified.length ? "fix" : "feat"
  const scopeStr = scopeHint ? `(${scopeHint})` : ""

  return `${type}${scopeStr}: ${description}`
}

/**
 * Auto-commit uncommitted changes in the given directory.
 *
 * 1. Checks for uncommitted changes via `git status --porcelain`
 * 2. Stages everything with `git add -A`
 * 3. Commits with auto-generated message
 * 4. Returns CommitResult or null if nothing to commit
 */
export function autoCommit(cwd: string, diffs: DiffInfo[]): CommitResult | null {
  const repoRoot = getRepoRoot(cwd)
  if (!repoRoot) {
    log.warn("Not a git repository — cannot auto-commit", { cwd })
    return null
  }

  if (!hasUncommittedChanges(repoRoot)) {
    log.info("No uncommitted changes — skip auto-commit")
    return null
  }

  // Stage everything
  log.info("Staging changes...", { repoRoot })
  git(["add", "-A"], repoRoot)

  // Verify something was staged
  const staged = git(["diff", "--cached", "--stat"], repoRoot)
  if (!staged) {
    log.warn("Nothing staged after git add -A — skipping commit")
    return null
  }

  // Count staged files
  const stagedLines = staged.split("\n").filter((l) => l.trim())
  const filesChanged = stagedLines.length

  // Generate commit message
  const message = generateCommitMessage(diffs)

  // Commit
  log.info("Committing...", { message })
  const result = git(["commit", "-m", `"${message.replace(/"/g, '\\"')}"`], repoRoot)

  if (!result) {
    log.warn("Commit returned empty — may have failed")
    return null
  }

  // Extract hash
  const hashMatch = result.match(/\[[\w/]+\s+([a-f0-9]+)\]/)
  const hash = hashMatch?.[1] ?? "unknown"

  log.info("Auto-commit done", { hash, filesChanged, message })
  return { hash, message, filesChanged }
}

export * as AutoCommit from "./auto-commit"
