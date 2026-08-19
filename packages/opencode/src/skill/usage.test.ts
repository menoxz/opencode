/**
 * Tests for usage-driven skill catalog ranking (see skill/usage.ts).
 *
 * Run: bun test src/skill/usage.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test"
import { SkillUsage } from "./usage"

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const catalog = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `skill-${i}` }))

beforeEach(() => SkillUsage.reset())

describe("score", () => {
  test("is zero for a skill never loaded", () => {
    expect(SkillUsage.score("never", NOW)).toBe(0)
  })

  test("is zero once usage is older than the stale window", () => {
    SkillUsage.seed({ old: NOW - SkillUsage.STALE_MS - 1 })
    expect(SkillUsage.score("old", NOW)).toBe(0)
  })

  test("is positive for recent usage", () => {
    SkillUsage.seed({ fresh: NOW - DAY })
    expect(SkillUsage.score("fresh", NOW)).toBeGreaterThan(0)
  })
})

describe("prioritize", () => {
  test("returns the list untouched when it already fits", () => {
    const list = catalog(10)
    expect(SkillUsage.prioritize(list, 30, NOW)).toBe(list)
  })

  test("always enforces the budget on the real catalog size", () => {
    // 189 SKILL.md files are installed on the audited machine.
    expect(SkillUsage.prioritize(catalog(189), 30, NOW)).toHaveLength(30)
  })

  test("keeps recently used skills", () => {
    SkillUsage.seed({ "skill-150": NOW - DAY, "skill-188": NOW - 2 * DAY })
    const kept = SkillUsage.prioritize(catalog(189), 30, NOW).map((s) => s.name)
    expect(kept).toContain("skill-150")
    expect(kept).toContain("skill-188")
  })

  test("drops a stale skill in favour of a recent one", () => {
    SkillUsage.seed({ "skill-180": NOW - SkillUsage.STALE_MS - DAY, "skill-181": NOW - DAY })
    const kept = SkillUsage.prioritize(catalog(189), 30, NOW).map((s) => s.name)
    expect(kept).toContain("skill-181")
    // skill-180's usage is 61 days old: it no longer earns a reserved slot and
    // falls back into the discovery tail, which starts at the head of the list.
    expect(kept).not.toContain("skill-180")
  })

  test("reserves slots for never-used skills so new ones stay discoverable", () => {
    const used: Record<string, number> = {}
    for (let i = 100; i < 189; i++) used[`skill-${i}`] = NOW - i * 1000
    SkillUsage.seed(used)
    const kept = SkillUsage.prioritize(catalog(189), 30, NOW).map((s) => s.name)
    const neverUsed = kept.filter((name) => Number(name.split("-")[1]) < 100)
    expect(neverUsed.length).toBe(SkillUsage.DISCOVERY_RESERVE)
  })

  test("never exceeds the budget even when everything is recently used", () => {
    const used: Record<string, number> = {}
    for (let i = 0; i < 189; i++) used[`skill-${i}`] = NOW - i
    SkillUsage.seed(used)
    expect(SkillUsage.prioritize(catalog(189), 30, NOW)).toHaveLength(30)
  })

  test("produces no duplicates", () => {
    SkillUsage.seed({ "skill-5": NOW, "skill-6": NOW - 1 })
    const kept = SkillUsage.prioritize(catalog(189), 30, NOW).map((s) => s.name)
    expect(new Set(kept).size).toBe(kept.length)
  })
})

describe("record", () => {
  test("makes a skill rank immediately", () => {
    SkillUsage.reset()
    SkillUsage.record("skill-188", NOW)
    expect(SkillUsage.lastUsed("skill-188")).toBe(NOW)
    expect(SkillUsage.prioritize(catalog(189), 30, NOW).map((s) => s.name)).toContain("skill-188")
  })
})
