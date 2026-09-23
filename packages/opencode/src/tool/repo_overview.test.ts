import { describe, expect, test } from "bun:test"
import { resolveDepth } from "./repo_overview"

describe("repo_overview progressive disclosure", () => {
  test("defaults to the shallow orientation depth", () => {
    expect(resolveDepth(undefined)).toBe(1)
    expect(resolveDepth(0)).toBe(1)
    expect(resolveDepth(1.5)).toBe(1)
    expect(resolveDepth(99)).toBe(1)
  })

  test("honours the 1 to 2 to 3 escalation", () => {
    expect(resolveDepth(1)).toBe(1)
    expect(resolveDepth(2)).toBe(2)
    expect(resolveDepth(3)).toBe(3)
  })
})
