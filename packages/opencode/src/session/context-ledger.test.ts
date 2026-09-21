import { beforeEach, describe, expect, test } from "bun:test"
import * as ContextLedger from "./context-ledger"

const session = "ses_context_ledger"

const call = (tool: string, args: unknown) => ({ tool, args })

describe("context ledger classification", () => {
  test("treats a plain read-only command as non-mutating", () => {
    expect(ContextLedger.commandReadOnly("git status --short")).toBe(true)
    expect(ContextLedger.commandReadOnly("git diff HEAD~1")).toBe(true)
    expect(ContextLedger.commandReadOnly("Get-ChildItem -Path src")).toBe(true)
    expect(ContextLedger.commandReadOnly("rg --files src")).toBe(true)
    expect(ContextLedger.classify("bash", { command: "git status" }).mutating).toBe(false)
  })

  test("refuses composition, redirection, substitution and writes", () => {
    expect(ContextLedger.commandReadOnly("git status | tee out.txt")).toBe(false)
    expect(ContextLedger.commandReadOnly("ls > files.txt")).toBe(false)
    expect(ContextLedger.commandReadOnly("cat $(ls)")).toBe(false)
    expect(ContextLedger.commandReadOnly("git commit -m x")).toBe(false)
    expect(ContextLedger.commandReadOnly("git checkout dev")).toBe(false)
    expect(ContextLedger.commandReadOnly("rm -rf build")).toBe(false)
    expect(ContextLedger.commandReadOnly("bun add effect")).toBe(false)
    expect(ContextLedger.commandReadOnly("")).toBe(false)
  })

  test("treats a runner as read-only only in a version, help or --noEmit form", () => {
    expect(ContextLedger.commandReadOnly("bun --version")).toBe(true)
    expect(ContextLedger.commandReadOnly("tsgo --noEmit")).toBe(true)
    expect(ContextLedger.commandReadOnly("bun test")).toBe(false)
    expect(ContextLedger.commandReadOnly("tsc")).toBe(false)
    expect(ContextLedger.commandReadOnly("npm install")).toBe(false)
  })

  test("defaults an unknown tool to mutating, so a call that changes the world is never suppressed", () => {
    expect(ContextLedger.classify("edit", { filePath: "a.ts" }).mutating).toBe(true)
    expect(ContextLedger.classify("mcp__thing__do", {}).readOnly).toBe(false)
    expect(ContextLedger.classify("bash", { command: "bun add effect" }).mutating).toBe(true)
  })

  test("keeps bookkeeping calls from invalidating the allocation", () => {
    expect(ContextLedger.classify("todowrite", {}).mutating).toBe(false)
    expect(ContextLedger.classify("tool_search", {}).mutating).toBe(false)
    expect(ContextLedger.classify("llm-memory-tool_memory_store", {}).mutating).toBe(false)
  })

  test("never answers for read or a batch: they own their own reporting", () => {
    expect(ContextLedger.suppressible("read")).toBe(false)
    expect(ContextLedger.suppressible("inspect_batch")).toBe(false)
    expect(ContextLedger.suppressible("bash")).toBe(true)
    expect(ContextLedger.suppressible("webfetch")).toBe(true)
  })
})

describe("context ledger coverage", () => {
  test("reads the line range implied by the read arguments", () => {
    expect(ContextLedger.coverageOf("read", { offset: 10, limit: 5 })).toEqual([{ start: 10, end: 15 }])
    expect(ContextLedger.coverageOf("read", { filePath: "a.ts" })).toEqual([{ start: 1, end: 2_001 }])
    expect(ContextLedger.coverageOf("bash", { command: "ls" })).toEqual([])
  })

  test("merges overlapping and adjacent ranges so a slot carries no duplicates", () => {
    expect(
      ContextLedger.mergeCoverage([
        { start: 1, end: 10 },
        { start: 5, end: 20 },
        { start: 20, end: 30 },
        { start: 50, end: 60 },
      ]),
    ).toEqual([
      { start: 1, end: 30 },
      { start: 50, end: 60 },
    ])
  })

  test("refreshes one slot in place instead of appending a second copy", () => {
    ContextLedger.reset()
    ContextLedger.observe(session, {
      tool: "read",
      args: { filePath: "a.ts", offset: 1, limit: 100 },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "line one",
    })
    ContextLedger.observe(session, {
      tool: "read",
      args: { filePath: "a.ts", offset: 50, limit: 100 },
      step: 2,
      at: 2_000,
      truth: "observed",
      output: "line fifty",
    })
    const slots = ContextLedger.slots(session)
    expect(slots).toHaveLength(1)
    expect(slots[0]?.calls).toBe(2)
    expect(slots[0]?.step).toBe(2)
    expect(slots[0]?.coverage).toEqual([{ start: 1, end: 150 }])
    expect(slots[0]?.summary).toBe("line fifty")
  })
})

describe("context ledger presence", () => {
  beforeEach(() => ContextLedger.reset())

  const observeRead = (step = 1) =>
    ContextLedger.observe(session, {
      tool: "bash",
      args: { command: "git status" },
      step,
      at: 1_000,
      truth: "observed",
      output: "3 files modified",
    })

  test("answers a repeated read-only call from the slot with a presence notice", () => {
    observeRead()
    const presence = ContextLedger.presenceFor(session, call("bash", { command: "git status" }), { now: 1_500 })
    expect(presence?.notice).toContain("[present] bash git status")
    expect(presence?.notice).toContain("3 files modified")
    expect(presence?.slot.step).toBe(1)
  })

  test("stops answering once a mutating call advanced the epoch", () => {
    observeRead()
    ContextLedger.note(session, call("edit", { filePath: "a.ts" }))
    expect(ContextLedger.presenceFor(session, call("bash", { command: "git status" }), { now: 1_500 })).toBeUndefined()
  })

  test("stops answering outside the time to live", () => {
    observeRead()
    expect(ContextLedger.presenceFor(session, call("bash", { command: "git status" }), { now: 10_000 })).toBeTruthy()
    expect(
      ContextLedger.presenceFor(session, call("bash", { command: "git status" }), { now: 10_000, ttlMs: 1_000 }),
    ).toBeUndefined()
  })

  test("never answers a call that can mutate", () => {
    observeRead()
    expect(ContextLedger.presenceFor(session, call("bash", { command: "rm -rf build" }), { now: 1_500 })).toBeUndefined()
  })

  test("never answers for an exempt tool or an unknown target", () => {
    observeRead()
    expect(ContextLedger.presenceFor(session, call("read", { filePath: "a.ts" }), { now: 1_500 })).toBeUndefined()
    expect(ContextLedger.presenceFor(session, call("webfetch", { url: "https://x.test" }), { now: 1_500 })).toBeUndefined()
  })

  test("a compaction strips every claim of presence", () => {
    observeRead()
    ContextLedger.invalidate(session)
    expect(ContextLedger.presenceFor(session, call("bash", { command: "git status" }), { now: 1_500 })).toBeUndefined()
  })
})

describe("context ledger capsule", () => {
  beforeEach(() => ContextLedger.reset())

  test("is empty until something is allocated", () => {
    expect(ContextLedger.contextCapsule(session)).toBe("")
  })

  test("renders one canonical line per allocated target with its coverage", () => {
    ContextLedger.observe(session, {
      tool: "read",
      args: { filePath: "src/a.ts", offset: 1, limit: 120 },
      step: 3,
      at: 1_000,
      truth: "observed",
      output: "export const a = 1",
    })
    const capsule = ContextLedger.contextCapsule(session)
    expect(capsule).toContain("<context_slots>")
    expect(capsule).toContain("read src/a.ts lines 1-120")
    expect(capsule).toContain("held since step 3")
    expect(capsule).toContain("</context_slots>")
  })

  test("names a superseded target instead of quoting its stale content", () => {
    ContextLedger.observe(session, {
      tool: "bash",
      args: { command: "git status" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "clean tree",
    })
    ContextLedger.note(session, call("edit", { filePath: "a.ts" }))
    const capsule = ContextLedger.contextCapsule(session)
    expect(capsule).toContain("Superseded")
    expect(capsule).toContain("bash git status")
    expect(capsule).not.toContain("clean tree")
  })

  test("reports the related targets the relevance judge is asked about", () => {
    ContextLedger.observe(session, {
      tool: "bash",
      args: { command: "git status --short" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: " M a.ts",
    })
    expect(ContextLedger.related(session, call("bash", { command: "git status" }))).toHaveLength(1)
    expect(ContextLedger.related(session, call("bash", { command: "git status --short" }))).toHaveLength(0)
    expect(ContextLedger.related(session, call("webfetch", { url: "https://x.test" }))).toHaveLength(0)
  })
})
