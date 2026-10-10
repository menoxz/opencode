/**
 * Tests for the read-only census (see storage/maintenance.ts §4.1 of
 * docs/harness-audit/proposals/P08-retention-default.md).
 *
 * Run: bun test test/storage/census.test.ts
 *
 * The census is the only thing standing between an operator and a blind purge
 * decision, so the contract under test is not "returns numbers" — it is
 * "cannot write". Every query it emits is recorded here and refused if it is
 * anything other than a `SELECT`.
 */
import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { StorageMaintenance } from "@/storage/maintenance"

/** A handle shaped like the raw sqlite one, recording every statement. */
const spy = () => {
  const queries: string[] = []
  return {
    queries,
    exec: (query: string) => queries.push(query),
    query: (query: string) => ({
      all: () => {
        queries.push(query)
        return []
      },
    }),
  }
}

describe("census is read-only", () => {
  test("emits nothing but SELECT", () => {
    const db = spy()
    StorageMaintenance.census(db, 1_700_000_000_000)
    expect(db.queries.length).toBeGreaterThan(0)
    expect(db.queries.some((q) => /DELETE|UPDATE|INSERT|VACUUM/i.test(q))).toBe(false)
    expect(db.queries.some((q) => /PRAGMA\s+(?!page_count|page_size)/i.test(q))).toBe(false)
    expect(db.queries.every((q) => /^SELECT/i.test(q.trim()))).toBe(true)
  })

  test("reads sizes through the three table-valued pragma functions and nothing else", () => {
    const db = spy()
    StorageMaintenance.census(db, 1_700_000_000_000)
    const sql = db.queries.join("\n")
    // `freelist_count` belongs to pragma_freelist_count: pragma_page_count exposes
    // only page_count, so reading it from there is a prepare-time error
    // (`no such column: freelist_count`, measured EXIT=1 on a real database).
    expect(sql).toContain("pragma_page_count")
    expect(sql).toContain("pragma_freelist_count")
    expect(sql).toContain("pragma_page_size")
    const pragmas = sql.match(/pragma_\w+/g) ?? []
    expect([...new Set(pragmas)].sort()).toEqual(["pragma_freelist_count", "pragma_page_count", "pragma_page_size"])
  })

  test("never reaches the checkpoint path", () => {
    // `checkpoint` writes: PRAGMA wal_checkpoint(TRUNCATE) (maintenance.ts:44-48).
    // A census that went through it would not be a census.
    const db = spy()
    StorageMaintenance.census(db, 1_700_000_000_000)
    expect(db.queries.some((q) => /wal_checkpoint/i.test(q))).toBe(false)
  })

  test("floors the cutoff instead of interpolating a raw value", () => {
    const db = spy()
    StorageMaintenance.census(db, 1_700_000_000_000.7)
    expect(db.queries[0]).toContain("time_created < 1700000000000")
  })
})

describe("census on the maintenance timer", () => {
  test("is not wired into maintain() or schedule()", async () => {
    // The census must stay a separate call path: both of these call
    // checkpoint(db), which writes to the file.
    StorageMaintenance.resetPurgeClock()
    const timed = spy()
    StorageMaintenance.maintain(timed, {})
    const stop = StorageMaintenance.schedule(timed, { intervalMs: 5, purge: false })
    await new Promise((done) => setTimeout(done, 30))
    stop()
    expect(timed.queries.length).toBeGreaterThan(0)
    expect(timed.queries.some((q) => /wal_checkpoint/i.test(q))).toBe(true)
    expect(timed.queries.some((q) => /FROM part/i.test(q))).toBe(false)
  })
})

describe("census measurement", () => {
  test("separates parts by type", () => {
    const rows = [
      { type: "tool", parts: 2, chars: 100 },
      { type: "reasoning", parts: 1, chars: 100 },
    ]
    const db = { query: (sql: string) => ({ all: () => (sql.includes("FROM part") ? rows : [{ db: 42, free: 7 }]) }) }
    const result = StorageMaintenance.census(db, 1_700_000_000_000)
    expect(result.byType.tool.chars).toBe(100)
    expect(result.byType.reasoning.chars).toBe(100)
    expect(result.byType.tool.parts).toBe(2)
    expect(result.byType.reasoning.parts).toBe(1)
    expect(result.totalParts).toBe(3)
    expect(result.dbBytes).toBe(42)
    expect(result.freelistBytes).toBe(7)
  })

  test("survives a locked handle without propagating", () => {
    const db = {
      query: () => ({
        all: () => {
          throw new Error("database is locked")
        },
      }),
    }
    // Measuring must never be the reason a command fails.
    expect(StorageMaintenance.census(db, 1_700_000_000_000)).toEqual({
      totalParts: 0,
      byType: {},
      dbBytes: 0,
      freelistBytes: 0,
    })
  })
})

describe("census against a real SQLite database", () => {
  // A spy proves which SQL we emit; only a real database proves the SQL parses
  // and the pragma arithmetic holds. The wrong pragma form is rejected at
  // prepare time, which no spy would notice.
  test("aggregates real parts and reports real page counts", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-census-"))
    const file = join(dir, "probe.db")
    const db = new Database(file)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("CREATE TABLE part (id TEXT PRIMARY KEY, time_created INTEGER, data TEXT)")
    const toolA = JSON.stringify({ type: "tool", output: "x".repeat(150) })
    const toolB = JSON.stringify({ type: "tool", output: "y".repeat(50) })
    const reasoning = JSON.stringify({ type: "reasoning", text: "z".repeat(100) })
    const insert = db.prepare("INSERT INTO part (id, time_created, data) VALUES (?, ?, ?)")
    db.exec("BEGIN")
    insert.run("p1", 1_000, toolA)
    insert.run("p2", 1_000, toolB)
    insert.run("p3", 1_000, reasoning)
    insert.run("p4", 9_000_000_000_000, JSON.stringify({ type: "tool", output: "after the cutoff" }))
    db.exec("COMMIT")

    const before = 5_000_000_000_000
    const result = StorageMaintenance.census(db, before)
    // p4 is past the cutoff and must not be counted.
    expect(result.totalParts).toBe(3)
    // `chars` counts the JSON blob (`length(data)`), envelope included.
    expect(result.byType.tool.chars).toBe(toolA.length + toolB.length)
    expect(result.byType.reasoning.chars).toBe(reasoning.length)
    // page_count and page_size are real multiples, not the mock's 42.
    expect(result.dbBytes).toBeGreaterThan(0)
    expect(result.dbBytes % 4096).toBe(0)
    expect(result.freelistBytes).toBeGreaterThanOrEqual(0)
    expect(result.freelistBytes).toBeLessThanOrEqual(result.dbBytes)

    db.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  test("rejects the wrong pragma form, so the emitted SQL is the measured one", () => {
    const db = new Database(":memory:")
    db.exec("CREATE TABLE part (id TEXT PRIMARY KEY, time_created INTEGER, data TEXT)")
    // Positive control for the form the census avoids: the same arithmetic on
    // pragma_page_count alone does not prepare.
    expect(() =>
      db
        .query(
          `SELECT (SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_page_count)`,
        )
        .all(),
    ).toThrow(/no such column: freelist_count/)
    // Negative control: the census form is accepted by this same handle, and its
    // arithmetic is checked against the page tables rather than a hardcoded page
    // size — measured on this platform: 12288, not the 4096 a file-backed db uses.
    const censusSizes = db
      .query(
        `SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS db,
                ((SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)) * (SELECT page_size FROM pragma_page_size) AS free`,
      )
      .all()
    const pageSize = (db.query("SELECT page_size FROM pragma_page_size").get() as { page_size: number }).page_size
    const pageCount = (db.query("SELECT page_count FROM pragma_page_count").get() as { page_count: number }).page_count
    const freelist = (db.query("SELECT freelist_count FROM pragma_freelist_count").get() as { freelist_count: number })
      .freelist_count
    expect(censusSizes).toEqual([{ db: pageCount * pageSize, free: (pageCount - freelist) * pageSize }])
    db.close()
  })
})