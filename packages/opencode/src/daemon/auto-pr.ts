import * as fs from "node:fs"
import { execSync, type ExecSyncOptions } from "node:child_process"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "daemon.auto-pr" })

// ── Types ───────────────────────────────────────────────────────────────

export interface PRResult {
  url: string
  number: number
  title: string
}

// ── Helpers ─────────────────────────────────────────────────────────────

function run(cmd: string, cwd: string, options?: ExecSyncOptions): string {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 30000,
      ...options,
    })
    return String(out).trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("command failed", { cmd: cmd.split(" ")[0], cwd, error: msg.split("\n")[0] })
    return ""
  }
}

/**
 * Check if `gh` CLI is available and authenticated.
 */
export function isGhAvailable(): boolean {
  try {
    const out = execSync("gh auth status", { encoding: "utf-8", stdio: "pipe", timeout: 5000 })
    return out.includes("Logged in")
  } catch {
    return false
  }
}

/**
 * Get the current branch name from the repo.
 */
export function getCurrentBranch(cwd: string): string | null {
  const branch = run("git rev-parse --abbrev-ref HEAD", cwd)
  return branch || null
}

/**
 * Check if a remote is configured.
 */
export function hasRemote(cwd: string): boolean {
  const remotes = run("git remote", cwd)
  return remotes.length > 0
}

/**
 * Push the current branch to the remote.
 */
export function pushBranch(cwd: string, branch: string): boolean {
  const result = run(`git push origin ${branch}`, cwd)
  if (result) {
    log.info("Branch pushed", { branch })
    return true
  }
  log.warn("Failed to push branch", { branch })
  return false
}

/**
 * Create a pull request from the current branch.
 *
 * @param cwd - Repo working directory
 * @param title - PR title (auto-generated if empty)
 * @param body - PR body/description
 * @returns PRResult or null if creation failed
 */
export function createPR(cwd: string, title?: string, body?: string): PRResult | null {
  if (!isGhAvailable()) {
    log.warn("gh CLI not available — cannot create PR")
    return null
  }

  const branch = getCurrentBranch(cwd)
  if (!branch) {
    log.warn("Cannot determine current branch — cannot create PR")
    return null
  }

  if (!hasRemote(cwd)) {
    log.warn("No git remote configured — cannot create PR")
    return null
  }

  // Push first
  const pushed = pushBranch(cwd, branch)
  if (!pushed) {
    log.warn("Push failed — cannot create PR")
    return null
  }

  // Build PR title
  const prTitle = title || `Auto: ${branch.replace(/[_\/-]/g, " ")}`
  const prBody = body || "Automated PR from opencode headless task."

  // Create PR
  const escapedTitle = prTitle.replace(/"/g, '\\"')
  const escapedBody = prBody.replace(/"/g, '\\"').replace(/\n/g, "\\n")
  const result = run(`gh pr create --title "${escapedTitle}" --body "${escapedBody}"`, cwd)

  if (!result) {
    log.warn("gh pr create returned empty")
    return null
  }

  // Extract PR number and URL
  const urlMatch = result.match(/(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/)
  const numberMatch = result.match(/#(\d+)/)

  const url = urlMatch?.[1] ?? result
  const number = numberMatch ? parseInt(numberMatch[1], 10) : 0

  log.info("PR created", { url, number, title: prTitle })
  return { url, number, title: prTitle }
}

/**
 * Determine if the task came from a GitHub PR trigger.
 */
export function isPRTrigger(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) return false
  const action = payload.action as string
  return action === "opened" || action === "synchronize" || action === "review_requested" ||
    action === "review_submitted" || action === "pr_opened"
}

/**
 * Push-only: push the current branch without creating a PR.
 * Useful when the headless task committed changes but the trigger didn't
 * come from a PR (e.g., file-watcher or schedule).
 */
export function pushBranchOnly(cwd: string): boolean {
  const branch = getCurrentBranch(cwd)
  if (!branch || !hasRemote(cwd)) return false
  return pushBranch(cwd, branch)
}

export * as AutoPR from "./auto-pr"
