import { afterEach, describe, expect, test } from "bun:test"
import { ContextLedger } from "@/session/context-ledger"

const call = { tool: "read", args: { filePath: "C:\\jeanluc\\opencode-fork\\package.json" } }

const observe = (sessionID: string, output: string) =>
  ContextLedger.observe(sessionID, { ...call, step: 1, at: 0, truth: "observed", output })

describe("context ledger raw retention", () => {
  afterEach(() => {
    ContextLedger.setRawRetention(false)
    ContextLedger.reset()
  })

  test("retains the bounded raw output when enabled and serves it without re-executing", () => {
    ContextLedger.setRawRetention(true)
    observe("ses_raw_1", "x".repeat(ContextLedger.MAX_RAW_CHARS + 500))
    const held = ContextLedger.slotFor("ses_raw_1", call)
    expect(held?.raw).toBeDefined()
    expect(held!.raw!.length).toBe(ContextLedger.MAX_RAW_CHARS)
  })

  test("retains nothing when the gate is off", () => {
    observe("ses_raw_2", "hello")
    expect(ContextLedger.slotFor("ses_raw_2", call)?.raw).toBeUndefined()
  })
})
