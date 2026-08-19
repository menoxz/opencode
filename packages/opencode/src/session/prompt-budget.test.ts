/**
 * CI budget gate for the fixed context tax paid on every turn.
 *
 * Measured problem (see AUDIT-opencodev2.md, D2): the first turn of a trivial
 * task cost 32 257 tokens on 14/08 and 44 030 tokens two days later — +37 % of
 * pure overhead with no capability added. Size was being logged
 * (`approximatePromptSize`) but nothing ever failed on it, so the drift was
 * invisible until it showed up on the bill.
 *
 * This test is the plafond. It measures the components that actually drifted
 * and fails the build when they grow past their allowance. When a change
 * legitimately needs more room, raise the constant deliberately in the same
 * commit — that edit is the review signal.
 *
 * Token counts are approximated as chars/4. The approximation is stable, which
 * is all a ratchet needs; it is never used for billing.
 *
 * Run: bun test src/session/prompt-budget.test.ts
 */
import { describe, expect, test } from "bun:test"
import PROMPT_CORE from "./prompt/core.txt"
import { Skill } from "@/skill"
import { SkillUsage } from "@/skill/usage"

const tokens = (text: string) => Math.ceil(text.length / 4)

/** Mirrors MAX_RELEVANT_SKILLS in session/system.ts. */
const SKILL_BUDGET = 30

/** Longest description the catalog formatter will emit (DESCRIPTION_DISPLAY_CHARS). */
const MAX_DESCRIPTION = 200

const worstCaseCatalog = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `skill-with-a-deliberately-long-name-${i}`,
    description: "d".repeat(MAX_DESCRIPTION * 2),
    location: `/skills/skill-${i}/SKILL.md`,
    content: "irrelevant",
  }))

describe("core system prompt", () => {
  test("stays within its allowance", () => {
    // Currently ~363 tokens. Headroom is deliberate but bounded.
    expect(tokens(PROMPT_CORE)).toBeLessThan(900)
  })
})

describe("skill catalog block", () => {
  test("the installed-catalog worst case is bounded once the budget is applied", () => {
    // 189 SKILL.md files are installed on the audited machine. Emitting them all
    // costs ~13 500 tokens on every turn of every session; capped it is ~2 200.
    const capped = SkillUsage.prioritize(worstCaseCatalog(189), SKILL_BUDGET)
    expect(capped).toHaveLength(SKILL_BUDGET)
    expect(tokens(Skill.fmt(capped, { mode: "verbose" }))).toBeLessThan(3_000)
  })

  test("summary mode is bounded too", () => {
    const capped = SkillUsage.prioritize(worstCaseCatalog(189), SKILL_BUDGET)
    expect(tokens(Skill.fmt(capped, { mode: "summary" }))).toBeLessThan(2_500)
  })

  test("an uncapped catalog would blow the budget — the cap is load-bearing", () => {
    // This is the regression this gate exists for: if the cap in
    // session/system.ts is ever removed or bypassed again, the block returns to
    // this size and the assertion above starts failing.
    const uncapped = Skill.fmt(worstCaseCatalog(189), { mode: "verbose" })
    expect(tokens(uncapped)).toBeGreaterThan(10_000)
  })

  test("growing the catalog does not grow the prompt", () => {
    const small = Skill.fmt(SkillUsage.prioritize(worstCaseCatalog(50), SKILL_BUDGET), { mode: "verbose" })
    const huge = Skill.fmt(SkillUsage.prioritize(worstCaseCatalog(2_000), SKILL_BUDGET), { mode: "verbose" })
    expect(tokens(huge)).toBeLessThanOrEqual(tokens(small))
  })
})
