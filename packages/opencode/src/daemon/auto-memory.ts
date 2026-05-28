import * as fs from "node:fs"
import * as path from "node:path"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "daemon.auto-memory" })

// ── Types ───────────────────────────────────────────────────────────────

export interface LearningEntry {
  id: string
  timestamp: string
  source: string
  taskId: string
  summary: string
  filesChanged: number
  diffs: Array<{ file: string; type: string; diff?: string }>
  commitHash?: string
  commitMessage?: string
  model?: string | null
  tags: string[]
}

// ── Path helpers ────────────────────────────────────────────────────────

function learningsDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencode", "learnings")
}

function latestLearningPath(): string {
  return path.join(learningsDir(), "latest.json")
}

function archivedLearningPath(id: string): string {
  return path.join(learningsDir(), `learning-${id}.json`)
}

// ── Read ────────────────────────────────────────────────────────────────

/**
 * Read all unacknowledged learning entries (most recent first).
 * Used by session prompt to inject context.
 */
export function readUnacknowledgedLearnings(): LearningEntry[] {
  const dir = learningsDir()
  if (!fs.existsSync(dir)) return []

  const results: LearningEntry[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      results.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as LearningEntry)
    } catch { /* skip corrupt */ }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return results
}

/**
 * Read the latest learning entry.
 */
export function readLatestLearning(): LearningEntry | null {
  try {
    if (!fs.existsSync(latestLearningPath())) return null
    return JSON.parse(fs.readFileSync(latestLearningPath(), "utf-8")) as LearningEntry
  } catch {
    return null
  }
}

// ── Write ────────────────────────────────────────────────────────────────

/**
 * Store a learning entry from an auto-executed task.
 *
 * Writes both latest (overwrite) and archived copies.
 * Keeps max 50 archived entries.
 */
export function storeLearning(entry: Omit<LearningEntry, "id" | "timestamp">): string {
  const dir = learningsDir()
  fs.mkdirSync(dir, { recursive: true })

  const id = `learn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const learning: LearningEntry = {
    id,
    timestamp: new Date().toISOString(),
    ...entry,
  }

  // Write latest (overwrite)
  fs.writeFileSync(latestLearningPath(), JSON.stringify(learning, null, 2))
  // Write archived
  fs.writeFileSync(archivedLearningPath(id), JSON.stringify(learning, null, 2))

  // Keep max 50 archived
  cleanupArchived(dir)

  log.info("Learning entry stored", { id, source: entry.source, filesChanged: entry.filesChanged })
  return id
}

function cleanupArchived(dir: string): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("learning-") && f.endsWith(".json"))
      .sort()
    for (const old of files.slice(0, Math.max(0, files.length - 50))) {
      try { fs.unlinkSync(path.join(dir, old)) } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

/**
 * Mark all learning entries as acknowledged (removes archived + latest).
 * Called after the user has seen them.
 */
export function acknowledgeAllLearnings(): void {
  const dir = learningsDir()
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try { fs.unlinkSync(path.join(dir, file)) } catch { /* best-effort */ }
  }
}

/**
 * Find learning entries matching a specific taskId (e.g. past failed attempts).
 * Returns most recent first, up to maxResults.
 */
export function findLearningsByTaskId(taskId: string, maxResults = 5): LearningEntry[] {
  const dir = learningsDir()
  if (!fs.existsSync(dir)) return []

  const results: LearningEntry[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as LearningEntry
      if (entry.taskId === taskId) results.push(entry)
    } catch { /* skip corrupt */ }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return results.slice(0, maxResults)
}

export * as AutoMemory from "./auto-memory"
