/**
 * Tests for SQLite maintenance (see storage/maintenance.ts).
 *
 * Run: bun test src/storage/maintenance.test.ts
 */
import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync, statSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { StorageMaintenance } from "./maintenance"

const spy = () => {
  const queries: string[] = []
  return { queries, run: (query: string) => queries.push(query) }
}

const failing = () => ({
  run: () => {
    throw new Error("database is locked")
  },
})

describe("checkpoint", () => {
  test("truncates the WAL rather than issuing a passive checkpoint", () => {
    const db = spy()
    expect(StorageMaintenance.checkpoint(db)).toBe(true)
    // PASSIVE never shrinks the file — that is why the audited WAL reached 4.85 GB.
    expect(db.queries[0]).toBe("PRAGMA wal_checkpoint(TRUNCATE)")
  })

  test("reports failure instead of throwing when the database is busy", () => {
    expect(StorageMaintenance.checkpoint(failing())).toBe(false)
  })
})

describe("retentionDays", () => {
  test("is disabled by default: destroying history is opt-in", () => {
    expect(StorageMaintenance.retentionDays({})).toBeUndefined()
  })

  test("ignores nonsense values", () => {
    expect(StorageMaintenance.retentionDays({ OPENCODE_PART_RETENTION_DAYS: "nope" })).toBeUndefined()
    expect(StorageMaintenance.retentionDays({ OPENCODE_PART_RETENTION_DAYS: "0" })).toBeUndefined()
    expect(StorageMaintenance.retentionDays({ OPENCODE_PART_RETENTION_DAYS: "-5" })).toBeUndefined()
  })

  test("accepts a positive window", () => {
    expect(StorageMaintenance.retentionDays({ OPENCODE_PART_RETENTION_DAYS: "90" })).toBe(90)
  })
})

describe("cutoff", () => {
  test("is the requested number of days back", () => {
    const now = 1_700_000_000_000
    expect(StorageMaintenance.cutoff(90, now)).toBe(now - 90 * 24 * 60 * 60 * 1000)
  })
})

describe("purgeOldParts", () => {
  test("only deletes tool parts, keeping old sessions readable", () => {
    const db = spy()
    StorageMaintenance.purgeOldParts(db, 1_699_000_000_000)
    expect(db.queries[0]).toContain("DELETE FROM part")
    expect(db.queries[0]).toContain("time_created < 1699000000000")
    expect(db.queries[0]).toContain("'$.type') = 'tool'")
  })

  test("survives a locked database", () => {
    expect(StorageMaintenance.purgeOldParts(failing(), 0)).toBe(false)
  })
})

describe("maintain", () => {
  test("checkpoints without purging when retention is disabled", () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    StorageMaintenance.maintain(db, {})
    expect(db.queries).toEqual(["PRAGMA wal_checkpoint(TRUNCATE)"])
  })

  test("purges before checkpointing when retention is configured", () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    StorageMaintenance.maintain(db, { OPENCODE_PART_RETENTION_DAYS: "90" })
    expect(db.queries).toHaveLength(2)
    expect(db.queries[0]).toContain("DELETE FROM part")
    // Checkpoint last, so the pages freed by the delete are actually reclaimed.
    expect(db.queries[1]).toBe("PRAGMA wal_checkpoint(TRUNCATE)")
  })

  test("throttles the purge: a sweep is a write transaction on a multi-GB file", () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    const env = { OPENCODE_PART_RETENTION_DAYS: "90" }
    const start = 1_700_000_000_000

    StorageMaintenance.maintain(db, env, start)
    // Every subsequent checkpoint tick inside the window must NOT re-scan.
    StorageMaintenance.maintain(db, env, start + 5 * 60_000)
    StorageMaintenance.maintain(db, env, start + StorageMaintenance.PURGE_INTERVAL_MS - 1)

    expect(db.queries.filter((q) => q.includes("DELETE FROM part"))).toHaveLength(1)
    expect(db.queries.filter((q) => q.includes("wal_checkpoint"))).toHaveLength(3)

    // Once the interval elapses, it sweeps again.
    StorageMaintenance.maintain(db, env, start + StorageMaintenance.PURGE_INTERVAL_MS)
    expect(db.queries.filter((q) => q.includes("DELETE FROM part"))).toHaveLength(2)
  })
})

describe("schedule", () => {
  test("runs passes on the timer and stops cleanly", async () => {
    const db = spy()
    const stop = StorageMaintenance.schedule(db, { intervalMs: 5 })
    await new Promise((done) => setTimeout(done, 40))
    stop()
    const afterStop = db.queries.length
    expect(afterStop).toBeGreaterThan(0)
    await new Promise((done) => setTimeout(done, 30))
    expect(db.queries.length).toBe(afterStop)
  })

  test("never schedules two timers on the same connection", async () => {
    const db = spy()
    const stopA = StorageMaintenance.schedule(db, { intervalMs: 5 })
    const stopB = StorageMaintenance.schedule(db, { intervalMs: 5 })
    await new Promise((done) => setTimeout(done, 40))
    stopA()
    stopB()
    const single = spy()
    const stopC = StorageMaintenance.schedule(single, { intervalMs: 5 })
    await new Promise((done) => setTimeout(done, 40))
    stopC()
    // A duplicated layer build must not double the write rate against one file.
    expect(db.queries.length).toBeLessThanOrEqual(single.queries.length + 1)
  })

  test("purge:false never emits a DELETE — secondary databases have no `part` table", async () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    const stop = StorageMaintenance.schedule(db, { intervalMs: 5, purge: false })
    await new Promise((done) => setTimeout(done, 30))
    stop()
    expect(db.queries.length).toBeGreaterThan(0)
    expect(db.queries.some((q) => q.includes("DELETE"))).toBe(false)
  })
})

describe("exec-style connections", () => {
  // The memory and eval stores expose `exec`, not drizzle's `run`.
  const execSpy = () => {
    const queries: string[] = []
    return { queries, exec: (query: string) => queries.push(query) }
  }

  test("checkpoints a raw sqlite handle", () => {
    const db = execSpy()
    expect(StorageMaintenance.checkpoint(db)).toBe(true)
    expect(db.queries[0]).toBe("PRAGMA wal_checkpoint(TRUNCATE)")
  })
})

describe("shouldTruncateWal", () => {
  test("skips a healthy WAL so short commands stay fast", () => {
    expect(StorageMaintenance.shouldTruncateWal(2 * 1024 * 1024)).toBe(false)
  })

  test("fires on a drifted WAL", () => {
    // The audited install carried 4.85 GB here.
    expect(StorageMaintenance.shouldTruncateWal(4_850 * 1024 * 1024)).toBe(true)
  })

  test("skips when the WAL cannot be stat'd", () => {
    expect(StorageMaintenance.shouldTruncateWal(undefined)).toBe(false)
  })

  test("names the WAL sidecar correctly", () => {
    expect(StorageMaintenance.walPath("/data/opencode.db")).toBe("/data/opencode.db-wal")
  })
})

describe("checkpointOnOpen", () => {
  test("stays PASSIVE for a small WAL", () => {
    const db = spy()
    StorageMaintenance.checkpointOnOpen(db, "/nonexistent/opencode.db")
    expect(db.queries).toEqual(["PRAGMA wal_checkpoint(PASSIVE)"])
  })
})

describe("checkpoint against a real SQLite database", () => {
  // Spies prove the SQL we emit; only a real database proves it reclaims bytes.
  test("truncating the WAL actually shrinks the file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-wal-"))
    const file = join(dir, "probe.db")
    const db = new Database(file)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("CREATE TABLE blob_holder (id INTEGER PRIMARY KEY, payload TEXT)")

    const chunk = "x".repeat(64 * 1024)
    const insert = db.prepare("INSERT INTO blob_holder (payload) VALUES (?)")
    db.exec("BEGIN")
    for (let i = 0; i < 400; i++) insert.run(chunk)
    db.exec("COMMIT")

    const walBefore = statSync(`${file}-wal`).size
    expect(walBefore).toBeGreaterThan(1024 * 1024)

    expect(StorageMaintenance.checkpoint(db)).toBe(true)

    const walAfter = statSync(`${file}-wal`).size
    expect(walAfter).toBe(0)
    // The data survives the reclamation — this is lossless maintenance.
    expect(db.query("SELECT COUNT(*) AS n FROM blob_holder").get()).toEqual({ n: 400 })
    db.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  test("checkpointOnOpen truncates a drifted WAL on a real database", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-wal-open-"))
    const file = join(dir, "probe.db")
    const db = new Database(file)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("CREATE TABLE filler (id INTEGER PRIMARY KEY, payload TEXT)")
    const chunk = "y".repeat(64 * 1024)
    const insert = db.prepare("INSERT INTO filler (payload) VALUES (?)")
    db.exec("BEGIN")
    for (let i = 0; i < 200; i++) insert.run(chunk)
    db.exec("COMMIT")

    const before = statSync(`${file}-wal`).size
    expect(before).toBeGreaterThan(4 * 1024 * 1024)

    // Threshold below the current size: this is the drifted case.
    StorageMaintenance.checkpointOnOpen(db, file, 1024 * 1024)
    expect(statSync(`${file}-wal`).size).toBe(0)
    expect(db.query("SELECT COUNT(*) AS n FROM filler").get()).toEqual({ n: 200 })

    db.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })
})
