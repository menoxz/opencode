/**
 * Tests for the per-session read ledger (see tool/read-ledger.ts).
 *
 * Reproduces the D4 pathology from AUDIT-opencodev2.md: the same (session,
 * file, range) read over and over, re-sending bytes the model already holds.
 *
 * Run: bun test src/tool/read-ledger.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test"
import { ReadLedger } from "./read-ledger"

const SESSION = "ses_test"
const FILE = "/repo/lib/dashboard_page.dart"
const KEY = ReadLedger.key(FILE, 1, 2000)

const seen = (over: Partial<ReadLedger.Seen> = {}): ReadLedger.Seen => ({
  digest: ReadLedger.digest("<content>body</content>"),
  mtime: 1_700_000_000_000,
  size: 5_500,
  range: "lines 1-120 of 120",
  ...over,
})

beforeEach(() => ReadLedger.reset())

describe("key", () => {
  test("separates ranges of the same file", () => {
    expect(ReadLedger.key(FILE, 1, 2000)).not.toBe(ReadLedger.key(FILE, 303, 50))
  })

  test("separates files at the same range", () => {
    expect(ReadLedger.key(FILE, 1, 2000)).not.toBe(ReadLedger.key("/repo/other.dart", 1, 2000))
  })
})

describe("provenUnchanged", () => {
  test("accepts identical mtime and size", () => {
    expect(ReadLedger.provenUnchanged(seen(), 1_700_000_000_000, 5_500)).toBe(true)
  })

  test("rejects a changed mtime", () => {
    expect(ReadLedger.provenUnchanged(seen(), 1_700_000_000_001, 5_500)).toBe(false)
  })

  test("rejects a changed size at identical mtime", () => {
    expect(ReadLedger.provenUnchanged(seen(), 1_700_000_000_000, 5_501)).toBe(false)
  })

  test("never claims proof when the platform reports no mtime", () => {
    expect(ReadLedger.provenUnchanged(seen({ mtime: 0 }), 0, 5_500)).toBe(false)
    expect(ReadLedger.provenUnchanged(seen(), 0, 5_500)).toBe(false)
  })
})

describe("ledger", () => {
  test("returns nothing for an unread file", () => {
    expect(ReadLedger.get(SESSION, KEY)).toBeUndefined()
  })

  test("round-trips an entry", () => {
    ReadLedger.put(SESSION, KEY, seen())
    expect(ReadLedger.get(SESSION, KEY)?.digest).toBe(seen().digest)
  })

  test("does not leak across sessions", () => {
    ReadLedger.put(SESSION, KEY, seen())
    expect(ReadLedger.get("ses_other", KEY)).toBeUndefined()
  })

  test("reset clears one session only", () => {
    ReadLedger.put(SESSION, KEY, seen())
    ReadLedger.put("ses_other", KEY, seen())
    ReadLedger.reset(SESSION)
    expect(ReadLedger.get(SESSION, KEY)).toBeUndefined()
    expect(ReadLedger.get("ses_other", KEY)).toBeDefined()
  })

  test("evicts the oldest entry beyond the cap", () => {
    for (let i = 0; i < ReadLedger.MAX_ENTRIES + 5; i++)
      ReadLedger.put(SESSION, ReadLedger.key(`/f${i}.ts`, 1, 2000), seen())
    expect(ReadLedger.get(SESSION, ReadLedger.key("/f0.ts", 1, 2000))).toBeUndefined()
    expect(
      ReadLedger.get(SESSION, ReadLedger.key(`/f${ReadLedger.MAX_ENTRIES + 4}.ts`, 1, 2000)),
    ).toBeDefined()
  })

  test("re-putting a key refreshes its recency", () => {
    ReadLedger.put(SESSION, KEY, seen())
    for (let i = 0; i < ReadLedger.MAX_ENTRIES - 1; i++)
      ReadLedger.put(SESSION, ReadLedger.key(`/f${i}.ts`, 1, 2000), seen())
    ReadLedger.put(SESSION, KEY, seen({ size: 6_000 }))
    for (let i = 0; i < 10; i++) ReadLedger.put(SESSION, ReadLedger.key(`/g${i}.ts`, 1, 2000), seen())
    expect(ReadLedger.get(SESSION, KEY)?.size).toBe(6_000)
  })
})

describe("digest", () => {
  test("is stable and sensitive", () => {
    expect(ReadLedger.digest("abc")).toBe(ReadLedger.digest("abc"))
    expect(ReadLedger.digest("abc")).not.toBe(ReadLedger.digest("abd"))
    // A single flipped character deep in a large file must change the digest.
    const big = "x".repeat(100_000)
    expect(ReadLedger.digest(big)).not.toBe(ReadLedger.digest(`${big.slice(0, 50_000)}y${big.slice(50_001)}`))
  })
})

describe("stub", () => {
  test("names the file and the range, and never contains the body", () => {
    const out = ReadLedger.stub(FILE, seen())
    expect(out).toContain(FILE)
    expect(out).toContain("lines 1-120 of 120")
    expect(out).toContain("unchanged")
    expect(out).not.toContain("body")
  })

  test("is dramatically smaller than the payload it replaces", () => {
    // The audited worst case re-sent 5.5 MB across 793 re-reads of one file.
    expect(ReadLedger.stub(FILE, seen()).length).toBeLessThan(700)
  })
})
