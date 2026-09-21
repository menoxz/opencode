/**
 * Tests for the per-session read ledger (see tool/read-ledger.ts).
 *
 * Reproduces the D4 pathology from AUDIT-opencodev2.md: the same (session,
 * file, range) read over and over, re-sending bytes the model already holds.
 *
 * Run: bun test src/tool/read-ledger.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ReadLedger } from "./read-ledger"

// Snapshots stay out of the real state directory.
const LEDGER_DIR = mkdtempSync(path.join(tmpdir(), "opencode-read-ledger-"))
process.env.OPENCODE_READ_LEDGER_DIR = LEDGER_DIR
const snapshotOf = (sessionID: string) => path.join(LEDGER_DIR, `${sessionID}.json`)

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

describe("content dedup", () => {
  const DIGEST = ReadLedger.digest("<content>identical bytes</content>")
  const AT = { filepath: FILE, range: "lines 1-120 of 120" }

  test("withholds identical content once per epoch, then serves it", () => {
    ReadLedger.putContent(SESSION, DIGEST, AT)
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toMatchObject(AT)
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toBeUndefined()
  })

  test("withholds again in the next epoch", () => {
    ReadLedger.putContent(SESSION, DIGEST, AT)
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toMatchObject(AT)
    ReadLedger.reset(SESSION)
    ReadLedger.putContent(SESSION, DIGEST, AT)
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toMatchObject(AT)
  })

  test("does not re-withhold once the bytes have been sent again", () => {
    ReadLedger.putContent(SESSION, DIGEST, AT)
    ReadLedger.duplicateOf(SESSION, DIGEST)
    // The second request was served in full, so this location is the current one.
    ReadLedger.putContent(SESSION, DIGEST, { filepath: "/repo/other.dart", range: "lines 1-120 of 120" })
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toBeUndefined()
  })

  test("never withholds content the session was never sent", () => {
    expect(ReadLedger.duplicateOf(SESSION, DIGEST)).toBeUndefined()
  })

  test("does not withhold across sessions", () => {
    ReadLedger.putContent(SESSION, DIGEST, AT)
    expect(ReadLedger.duplicateOf("ses_other", DIGEST)).toBeUndefined()
  })

  test("identifies content by its digest alone, not by the key that produced it", () => {
    ReadLedger.putContent(SESSION, ReadLedger.digest("<content>same</content>"), AT)
    expect(ReadLedger.duplicateOf(SESSION, ReadLedger.digest("<content>same</content>"))).toMatchObject(AT)
  })
})

describe("duplicateStub", () => {
  const AT = { filepath: FILE, range: "lines 1-120 of 120" }

  test("names both places and never contains the body", () => {
    const out = ReadLedger.duplicateStub("/repo/copy.dart", AT)
    expect(out).toContain("/repo/copy.dart")
    expect(out).toContain(FILE)
    expect(out).toContain("lines 1-120 of 120")
    expect(out).not.toContain("body")
  })

  test("is a pure function of its inputs, whatever the ledger is doing", () => {
    const before = ReadLedger.duplicateStub(FILE, AT)
    ReadLedger.putContent(SESSION, ReadLedger.digest("x"), AT)
    ReadLedger.reset(SESSION)
    ReadLedger.unload()
    expect(ReadLedger.duplicateStub(FILE, AT)).toBe(before)
  })
})

describe("snapshot", () => {
  test("a restart resumes the ledger from the snapshot", () => {
    ReadLedger.put(SESSION, KEY, seen())
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.get(SESSION, KEY)?.digest).toBe(seen().digest)
  })

  test("a restart resumes the content index too", () => {
    const where = { filepath: FILE, range: seen().range }
    ReadLedger.putContent(SESSION, seen().digest, where)
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.duplicateOf(SESSION, seen().digest)).toMatchObject(where)
  })

  test("the compaction epoch increments and survives a restart", () => {
    expect(ReadLedger.epoch(SESSION)).toBe(0)
    ReadLedger.reset(SESSION)
    expect(ReadLedger.epoch(SESSION)).toBe(1)
    ReadLedger.unload()
    expect(ReadLedger.epoch(SESSION)).toBe(1)
  })

  test("no stub survives a compaction, even across a restart", () => {
    ReadLedger.put(SESSION, KEY, seen())
    ReadLedger.putContent(SESSION, seen().digest, { filepath: FILE, range: seen().range })
    ReadLedger.flush()
    ReadLedger.reset(SESSION)
    ReadLedger.unload()
    // Compaction dropped those bytes: pointing at them would be a false answer.
    expect(ReadLedger.get(SESSION, KEY)).toBeUndefined()
    expect(ReadLedger.duplicateOf(SESSION, seen().digest)).toBeUndefined()
  })

  test("ignores a snapshot it does not understand", () => {
    ReadLedger.put(SESSION, KEY, seen())
    ReadLedger.flush()
    writeFileSync(snapshotOf(SESSION), '{"v":99,"epoch":3,"entries":{},"content":{}}')
    ReadLedger.unload()
    expect(ReadLedger.get(SESSION, KEY)).toBeUndefined()
    expect(ReadLedger.epoch(SESSION)).toBe(0)
  })

  test("ignores a corrupted snapshot", () => {
    ReadLedger.put(SESSION, KEY, seen())
    ReadLedger.flush()
    writeFileSync(snapshotOf(SESSION), "{not json")
    ReadLedger.unload()
    expect(ReadLedger.get(SESSION, KEY)).toBeUndefined()
  })
})

describe("produced", () => {
  const BODY = "export const answer = 42\n"
  const record = (over: Partial<{ mtime: number; size: number; by: string }> = {}) =>
    ReadLedger.recordProduced(SESSION, FILE, BODY, over.mtime ?? 111, over.size ?? 25, over.by ?? "write")

  test("withholds a file the model produced, at most once", () => {
    record()
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 25)?.by).toBe("write")
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 25)).toBeUndefined()
  })

  test("never withholds a file the session did not produce", () => {
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 25)).toBeUndefined()
  })

  test("serves the bytes when the file changed since the write", () => {
    record()
    // A later write always moves the mtime; a same-size rewrite is caught too.
    expect(ReadLedger.takeProduced(SESSION, FILE, 112, 25)).toBeUndefined()
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 26)).toBeUndefined()
  })

  test("keeps the option to withhold the new version after a rewrite", () => {
    record()
    ReadLedger.takeProduced(SESSION, FILE, 111, 25)
    record({ mtime: 222, size: 30 })
    expect(ReadLedger.takeProduced(SESSION, FILE, 222, 30)?.by).toBe("write")
  })

  test("never claims proof when the platform reports no mtime", () => {
    ReadLedger.recordProduced(SESSION, FILE, BODY, 0, 25, "write")
    expect(ReadLedger.takeProduced(SESSION, FILE, 0, 25)).toBeUndefined()
  })

  test("does not withhold across sessions", () => {
    record()
    expect(ReadLedger.takeProduced("ses_other", FILE, 111, 25)).toBeUndefined()
  })

  test("does not withhold after a compaction epoch", () => {
    record()
    ReadLedger.reset(SESSION)
    expect(ReadLedger.epoch(SESSION)).toBe(1)
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 25)).toBeUndefined()
  })

  test("resumes the produced index across a restart", () => {
    record()
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.takeProduced(SESSION, FILE, 111, 25)?.by).toBe("write")
  })

  test("evicts the oldest produced file beyond the cap", () => {
    for (let i = 0; i < ReadLedger.MAX_PRODUCED + 5; i++)
      ReadLedger.recordProduced(SESSION, `/f${i}.ts`, BODY, 1, 25, "write")
    expect(ReadLedger.takeProduced(SESSION, "/f0.ts", 1, 25)).toBeUndefined()
    expect(ReadLedger.takeProduced(SESSION, `/f${ReadLedger.MAX_PRODUCED + 4}.ts`, 1, 25)).toBeDefined()
  })
})

describe("producedStub", () => {
  test("names the file and the tool, and never contains the body", () => {
    const out = ReadLedger.producedStub(FILE, { digest: "d", mtime: 1, size: 25, by: "edit", withheld: true })
    expect(out).toContain(FILE)
    expect(out).toContain("edit")
    expect(out).toContain("<produced>")
    expect(out).not.toContain("export const")
  })

  test("is a pure function of its inputs, whatever the ledger is doing", () => {
    const entry: ReadLedger.Produced = { digest: "d", mtime: 1, size: 25, by: "apply_patch", withheld: false }
    const before = ReadLedger.producedStub(FILE, entry)
    ReadLedger.recordProduced(SESSION, FILE, "x", 1, 1, "write")
    ReadLedger.reset(SESSION)
    ReadLedger.unload()
    expect(ReadLedger.producedStub(FILE, entry)).toBe(before)
  })
})

describe("holdings", () => {
  test("is empty before any read", () => {
    expect(ReadLedger.holdings(SESSION)).toEqual([])
  })

  test("names the file and the range, most recently read first", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen())
    ReadLedger.put(SESSION, ReadLedger.key("/repo/other.dart", 303, 50), seen({ range: "lines 303-352 of 400" }))
    expect(ReadLedger.holdings(SESSION)).toEqual([
      { filepath: "/repo/other.dart", range: "lines 303-352 of 400" },
      { filepath: FILE, range: "lines 1-120 of 120" },
    ])
  })

  test("re-reading a file moves it back to the front", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen())
    ReadLedger.put(SESSION, ReadLedger.key("/repo/other.dart", 1, 2000), seen())
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen({ size: 6_000 }))
    expect(ReadLedger.holdings(SESSION)[0]?.filepath).toBe(FILE)
  })

  test("respects its bound", () => {
    for (let i = 0; i < 20; i++) ReadLedger.put(SESSION, ReadLedger.key(`/f${i}.ts`, 1, 2000), seen())
    expect(ReadLedger.holdings(SESSION, 5)).toHaveLength(5)
  })

  test("reports the file path without the range key", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 303, 50), seen({ range: "lines 303-352 of 400" }))
    expect(ReadLedger.holdings(SESSION)[0]?.filepath).toBe(FILE)
  })

  test("a compaction drops every holding, so nothing stale is advertised", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen())
    ReadLedger.reset(SESSION)
    expect(ReadLedger.holdings(SESSION)).toEqual([])
  })

  test("survives a restart, exactly like the entries it projects", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen())
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.holdings(SESSION)[0]?.filepath).toBe(FILE)
  })
})

describe("withheld counter", () => {
  test("counts the reads answered from the ledger", () => {
    expect(ReadLedger.stats(SESSION).withheld).toBe(0)
    ReadLedger.noteWithheld(SESSION)
    ReadLedger.noteWithheld(SESSION)
    expect(ReadLedger.stats(SESSION).withheld).toBe(2)
  })

  test("is per session", () => {
    ReadLedger.noteWithheld(SESSION)
    expect(ReadLedger.stats("ses_other").withheld).toBe(0)
  })

  test("survives a compaction, unlike the entries it saved", () => {
    ReadLedger.put(SESSION, ReadLedger.key(FILE, 1, 2000), seen())
    ReadLedger.noteWithheld(SESSION)
    ReadLedger.reset(SESSION)
    expect(ReadLedger.stats(SESSION)).toMatchObject({ entries: 0, withheld: 1, epoch: 1 })
  })

  test("survives a restart", () => {
    ReadLedger.noteWithheld(SESSION)
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.stats(SESSION).withheld).toBe(1)
  })

  test("an untouched session reports empty stats", () => {
    expect(ReadLedger.stats(SESSION)).toEqual({ entries: 0, held: 0, withheld: 0, epoch: 0 })
  })
})

describe("withholdInspection", () => {
  // Must exceed MIN_INSPECTION_CHARS (800) to be eligible at all.
  const big = (marker: string) => `${marker}\n${"x".repeat(1_000)}`

  test("renders the first occurrence in full", () => {
    expect(ReadLedger.withholdInspection(SESSION, "bash", big("a"))).toBeUndefined()
  })

  test("withholds an identical repeat, naming the tool, size and first line", () => {
    ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    const stub = ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    expect(stub).toContain("<duplicate>")
    expect(stub).toContain("bash")
    expect(stub).toContain("1002 chars")
    expect(stub).toContain("First line then: a")
    expect(stub!.length).toBeLessThan(big("a").length)
  })

  test("treats each distinct output independently", () => {
    ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    expect(ReadLedger.withholdInspection(SESSION, "bash", big("b"))).toBeUndefined()
  })

  test("never withholds a short output, where the stub would cost more", () => {
    expect(ReadLedger.withholdInspection(SESSION, "grep", "no matches")).toBeUndefined()
    expect(ReadLedger.withholdInspection(SESSION, "grep", "no matches")).toBeUndefined()
  })

  test("counts a withheld repeat", () => {
    ReadLedger.withholdInspection(SESSION, "grep", big("a"))
    ReadLedger.withholdInspection(SESSION, "grep", big("a"))
    expect(ReadLedger.stats(SESSION).withheld).toBe(1)
  })

  test("is per session", () => {
    ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    expect(ReadLedger.withholdInspection("ses_other", "bash", big("a"))).toBeUndefined()
  })

  test("a compaction forgets, so the bytes are served in full again", () => {
    ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    ReadLedger.reset(SESSION)
    expect(ReadLedger.withholdInspection(SESSION, "bash", big("a"))).toBeUndefined()
  })

  test("survives a restart, like every other ledger decision", () => {
    ReadLedger.withholdInspection(SESSION, "bash", big("a"))
    ReadLedger.flush()
    ReadLedger.unload()
    expect(ReadLedger.withholdInspection(SESSION, "bash", big("a"))).toContain("<duplicate>")
  })

  test("covers exactly the inspection tools, and never read", () => {
    for (const tool of ["bash", "grep", "glob", "inspect_batch", "repo_overview"]) {
      expect(ReadLedger.INSPECTION_DEDUPE_TOOLS.has(tool)).toBe(true)
    }
    expect(ReadLedger.INSPECTION_DEDUPE_TOOLS.has("read")).toBe(false)
  })
})
