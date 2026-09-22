import { describe, expect, test } from "bun:test"
import * as ContextLedger from "./context-ledger"

const skillCall = (name: string) => ({ tool: "skill", args: { name } })
const instructionCall = (filePath: string) => ({ tool: "read", args: { filePath } })

describe("brique 2 — one canonical slot per skill", () => {
  test("gives every skill its own target instead of collapsing them on the tool name", () => {
    expect(ContextLedger.classify("skill", { name: "lean-agent" }).target).toBe("lean-agent")
    expect(ContextLedger.classify("skill", { name: "proof-discipline" }).target).toBe("proof-discipline")
    expect(ContextLedger.classify("skill", { name: "lean-agent" }).target).not.toBe(
      ContextLedger.classify("skill", { name: "proof-discipline" }).target,
    )
  })

  test("keeps an instruction file canonical per path", () => {
    const first = ContextLedger.classify("read", { filePath: "C:/x/AGENTS.md" }).target
    const again = ContextLedger.classify("read", { filePath: "C:/x/AGENTS.md" }).target
    const other = ContextLedger.classify("read", { filePath: "C:/x/SKILL.md" }).target
    expect(first).toBe(again)
    expect(first).not.toBe(other)
  })
})

describe("brique 2 — a repeated skill load is answered from its slot", () => {
  test("serves a presence notice only when the gate is on", () => {
    const session = "ses_skill_slots_gate"
    ContextLedger.reset(session)
    ContextLedger.setSkillSlots(false)
    ContextLedger.observe(session, {
      tool: "skill",
      args: { name: "lean-agent" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "skill body",
    })
    expect(ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })).toBeUndefined()
    ContextLedger.setSkillSlots(true)
    const presence = ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })
    expect(presence?.notice).toContain("[present]")
    expect(presence?.notice).toContain("lean-agent")
    ContextLedger.setSkillSlots(false)
  })

  test("never answers one skill from another skill's slot", () => {
    const session = "ses_skill_slots_distinct"
    ContextLedger.reset(session)
    ContextLedger.setSkillSlots(true)
    ContextLedger.observe(session, {
      tool: "skill",
      args: { name: "lean-agent" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "skill body",
    })
    expect(ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })).toBeDefined()
    expect(ContextLedger.presenceFor(session, skillCall("proof-discipline"), { now: 2_000, ttlMs: 60_000 })).toBeUndefined()
    ContextLedger.setSkillSlots(false)
  })
})

describe("brique 2 — freshness is carried by the revision", () => {
  test("a moved revision invalidates the skill slots", () => {
    const session = "ses_skill_slots_revision"
    ContextLedger.reset(session)
    ContextLedger.setSkillSlots(true)
    ContextLedger.noteSkillRevision(session, "r1")
    ContextLedger.observe(session, {
      tool: "skill",
      args: { name: "lean-agent" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "body v1",
    })
    expect(ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })).toBeDefined()
    ContextLedger.noteSkillRevision(session, "r2")
    expect(ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })).toBeUndefined()
    ContextLedger.setSkillSlots(false)
  })

  test("keeps an unrelated observation current when only a skill moved", () => {
    const session = "ses_skill_slots_unrelated"
    ContextLedger.reset(session)
    ContextLedger.setSkillSlots(true)
    ContextLedger.noteSkillRevision(session, "r1")
    ContextLedger.observe(session, {
      tool: "read",
      args: { filePath: "C:/x/AGENTS.md" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "instructions",
    })
    ContextLedger.noteSkillRevision(session, "r2")
    expect(ContextLedger.slotFor(session, instructionCall("C:/x/AGENTS.md"))?.elided).toBe(false)
    ContextLedger.setSkillSlots(false)
  })

  test("is idempotent when the revision has not moved", () => {
    const session = "ses_skill_slots_idempotent"
    ContextLedger.reset(session)
    ContextLedger.setSkillSlots(true)
    ContextLedger.noteSkillRevision(session, "r1")
    ContextLedger.observe(session, {
      tool: "skill",
      args: { name: "lean-agent" },
      step: 1,
      at: 1_000,
      truth: "observed",
      output: "body v1",
    })
    ContextLedger.noteSkillRevision(session, "r1")
    expect(ContextLedger.presenceFor(session, skillCall("lean-agent"), { now: 2_000, ttlMs: 60_000 })).toBeDefined()
    ContextLedger.setSkillSlots(false)
  })
})
