/**
 * Periodic SQLite maintenance.
 *
 * Measured problem (see AUDIT-opencodev2.md, D7): the local install reached
 * 7.6 GB — `opencode.db` 2.87 GB plus an `opencode.db-wal` of 4.85 GB that was
 * never checkpointed. The connection runs a single `wal_checkpoint(PASSIVE)`
 * when the database is opened and nothing afterwards, so a long-lived process
 * lets the write-ahead log grow without bound. A PASSIVE checkpoint also never
 * truncates the file: it only copies pages back, leaving the WAL at its high
 * water mark forever.
 *
 * Two operations, deliberately separated by risk:
 *
 *  - `checkpoint` is lossless. It reclaims the WAL and runs automatically.
 *  - `purgeOldParts` destroys history. It is opt-in through
 *    `OPENCODE_PART_RETENTION_DAYS` and never runs unless asked, because
 *    silently deleting a user's transcripts to save disk is not a trade the
 *    harness gets to make on its own.
 */
import * as Log from "@opencode-ai/core/util/log"
import { statSync } from "fs"

const log = Log.create({ service: "storage.maintenance" })

/** How often the WAL is truncated in a long-lived process. */
export const CHECKPOINT_INTERVAL_MS = 5 * 60_000

/**
 * Anything that can execute a raw statement. The main database exposes `run`
 * (drizzle), while the memory and eval databases expose `exec` (raw sqlite);
 * both are accepted so one maintenance pass serves every connection.
 */
type Runner = { run: (query: string) => unknown } | { exec: (query: string) => unknown }

function execute(db: Runner, query: string): unknown {
  return "run" in db ? db.run(query) : db.exec(query)
}

/**
 * Truncate the write-ahead log. TRUNCATE (not PASSIVE) is what actually shrinks
 * the file on disk. Returns false when SQLite was busy, which is harmless — the
 * next tick retries.
 */
export function checkpoint(db: Runner): boolean {
  const outcome = attempt(() => execute(db, "PRAGMA wal_checkpoint(TRUNCATE)"))
  if (!outcome) log.debug("wal checkpoint skipped, database busy")
  return outcome
}

/** Retention window in days, or undefined when retention is disabled. */
export function retentionDays(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = Number(env["OPENCODE_PART_RETENTION_DAYS"])
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}

export function cutoff(days: number, now = Date.now()): number {
  return now - days * 24 * 60 * 60 * 1000
}

/**
 * Drop message parts older than the cutoff. Only `tool` parts are removed: they
 * hold the large outputs (172 MB over 45 days in the audit) while text and
 * reasoning parts are what make an old session still readable.
 */
export function purgeOldParts(db: Runner, before: number): boolean {
  return attempt(() =>
    execute(
      db,
      `DELETE FROM part WHERE time_created < ${Math.floor(before)} AND json_extract(data, '$.type') = 'tool'`,
    ),
  )
}

// A failed maintenance pass must never take the process down: the database is
// still perfectly usable with a large WAL, and SQLITE_BUSY is an expected
// outcome under concurrent writers rather than a fault.
function attempt(work: () => unknown): boolean {
  try {
    work()
    return true
  } catch (error) {
    log.debug("maintenance step failed", { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

/**
 * Minimum gap between two purge sweeps.
 *
 * `part_time_created_idx` (migration 20260816133346) makes the sweep an index
 * range scan rather than a full scan of the largest table in the database, so
 * the cost is bounded. It is still a write transaction against a multi-GB file:
 * checkpointing stays frequent because it is cheap, purging stays rare because
 * it is not free.
 */
export const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000

let lastPurge = 0

/** One full maintenance pass. Safe to call on a timer. */
export function maintain(db: Runner, env: Record<string, string | undefined> = process.env, now = Date.now()): void {
  const days = retentionDays(env)
  if (days !== undefined && now - lastPurge >= PURGE_INTERVAL_MS) {
    lastPurge = now
    purgeOldParts(db, cutoff(days, now))
  }
  checkpoint(db)
}

/** Test hook: forget when the last purge ran. */
export function resetPurgeClock(): void {
  lastPurge = 0
}

/**
 * WAL size above which reclamation is worth doing eagerly.
 *
 * A healthy WAL is a few MB and is handled fine by the periodic timer; paying
 * a truncation cost on every process start would be waste. This threshold means
 * the eager path is a no-op in normal use and only engages once the file has
 * actually drifted.
 */
export const WAL_TRUNCATE_THRESHOLD_BYTES = 64 * 1024 * 1024

export function walPath(databasePath: string): string {
  return `${databasePath}-wal`
}

/** True when the WAL has drifted far enough to be worth truncating. */
export function shouldTruncateWal(walBytes: number | undefined, threshold = WAL_TRUNCATE_THRESHOLD_BYTES): boolean {
  return walBytes !== undefined && walBytes >= threshold
}

/**
 * Checkpoint at connection open, truncating when the WAL has drifted.
 *
 * This replaces the unconditional `wal_checkpoint(PASSIVE)` that ran here
 * before. PASSIVE copies pages back but never shrinks the file, which is how
 * the audited install kept a 4.85 GB write-ahead log while "checkpointing" on
 * every single open.
 *
 * Open time is deliberately chosen over process exit: an `exit` handler runs
 * after the SQLite handle has been finalized, so the checkpoint throws and is
 * swallowed — measured, not assumed. The periodic timer covers long-lived
 * processes; this covers every short CLI run, on the run following the drift.
 */
export function checkpointOnOpen(db: Runner, databasePath: string, threshold?: number): boolean {
  const bytes = attemptValue(() => statSizeSync(walPath(databasePath)))
  if (!shouldTruncateWal(bytes, threshold)) return attempt(() => execute(db, "PRAGMA wal_checkpoint(PASSIVE)"))
  log.info("reclaiming oversized WAL at open", { bytes })
  return checkpoint(db)
}

function statSizeSync(file: string): number | undefined {
  return statSync(file, { throwIfNoEntry: false })?.size
}

function attemptValue<T>(work: () => T): T | undefined {
  try {
    return work()
  } catch {
    return undefined
  }
}

/**
 * Start the periodic pass. The timer is unref'd so it never keeps a CLI process
 * alive. Returns a stop function.
 *
 * `purge` must stay false for any database without a `part` table — the memory
 * and eval stores are separate SQLite files that only need WAL reclamation.
 *
 * Scheduling is idempotent per connection: a layer rebuilt twice cannot end up
 * with two timers hammering the same file.
 */
export function schedule(
  db: Runner,
  options: { intervalMs?: number; purge?: boolean } = {},
): () => void {
  if (scheduled.has(db)) return () => {}
  scheduled.add(db)

  const purge = options.purge ?? true
  const timer = setInterval(() => maintain(db, purge ? process.env : {}), options.intervalMs ?? CHECKPOINT_INTERVAL_MS)
  timer.unref?.()
  return () => {
    clearInterval(timer)
    scheduled.delete(db)
  }
}

const scheduled = new WeakSet<object>()

export * as StorageMaintenance from "./maintenance"
