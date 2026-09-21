/**
 * Tests for the proactive holdings capsule (see session/holdings-capsule.ts).
 *
 * The read tool answers a repeat with an `<unchanged>` stub, but only after the
 * model has spent a turn asking. This capsule states what is already held
 * *before* the model acts, so the read can be skipped instead of discovered
 * unnecessary. What matters here is that it stays bounded: an unbounded list
 * would cost more context than the reads it prevents.
 *
 * Run: bun test src/session/holdings-capsule.test.ts
 */
import { beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ReadLedger } from "@/tool/read-ledger"
import { contextHoldingsCapsule } from "./holdings-capsule"

process.env.OPENCODE_READ_LEDGER_DIR = mkdtempSync(path.join(tmpdir(), "opencode-holdings-"))

const SESSION = "ses_holdings"

const seen = (range = "lines 1-20 of 20"): ReadLedger.Seen => ({ digest: "d", mtime: 1, size: 10, range })

beforeEach(() => ReadLedger.reset())

describe("contextHoldingsCapsule", () => {
  test("is undefined until something is held", () => {
    expect(contextHoldingsCapsule(SESSION)).toBeUndefined()
  })

  test("states the file and the range already in context", () => {
    ReadLedger.put(SESSION, ReadLedger.key("/repo/lib/a.dart", 1, 200), seen("lines 1-120 of 120"))
    const out = contextHoldingsCapsule(SESSION)
    expect(out).toContain("<context-holdings>")
    expect(out).toContain("</context-holdings>")
    expect(out).toContain("/repo/lib/a.dart")
    expect(out).toContain("lines 1-120 of 120")
  })

  test("lists the freshest read first", () => {
    ReadLedger.put(SESSION, ReadLedger.key("/first.ts", 1, 200), seen())
    ReadLedger.put(SESSION, ReadLedger.key("/second.ts", 1, 200), seen())
    const lines = contextHoldingsCapsule(SESSION)!.split("\n")
    expect(lines.findIndex((line) => line.includes("/second.ts"))).toBeLessThan(
      lines.findIndex((line) => line.includes("/first.ts")),
    )
  })

  test("stays bounded when the session holds many files", () => {
    for (let i = 0; i < 200; i++) ReadLedger.put(SESSION, ReadLedger.key(`/repo/file-${i}.ts`, 1, 200), seen())
    const out = contextHoldingsCapsule(SESSION)!
    expect(out.length).toBeLessThan(2_000)
    expect(out.split("\n").length).toBeLessThan(50)
  })

  test("is empty again after a compaction drops the bytes", () => {
    ReadLedger.put(SESSION, ReadLedger.key("/repo/a.ts", 1, 200), seen())
    ReadLedger.reset(SESSION)
    expect(contextHoldingsCapsule(SESSION)).toBeUndefined()
  })
})
