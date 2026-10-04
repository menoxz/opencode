import { describe, expect, test } from "bun:test"
import { JevCompact } from "./compact"

const prose = (lines: number) => Array.from({ length: lines }, (_, index) => `plain line ${index + 1}`).join("\n")

describe("JevCompact.windowsFromText", () => {
  test("covers every line without inventing or losing one", () => {
    const text = prose(50)
    const windows = JevCompact.windowsFromText(text, 200)
    expect(windows[0]!.start).toBe(0)
    expect(windows.at(-1)!.end).toBe(50)
    for (let index = 1; index < windows.length; index++) expect(windows[index]!.start).toBe(windows[index - 1]!.end)
  })

  test("respects the char budget except for a single oversized line", () => {
    const windows = JevCompact.windowsFromText(`${prose(30)}\n${"x".repeat(900)}`, 200)
    const oversized = windows.filter((window) => window.text.length > 200)
    expect(oversized.length).toBe(1)
    expect(oversized[0]!.text.length).toBe(900)
  })

  test("caps the number of windows so the tail stays verbatim", () => {
    const windows = JevCompact.windowsFromText(prose(400), 100, 3)
    expect(windows.length).toBe(3)
    expect(windows.at(-1)!.end).toBeLessThan(400)
  })
})

describe("JevCompact.parsePlan", () => {
  test("accepts plain and fenced JSON", () => {
    const plain = JevCompact.parsePlan('{"keep":[{"window":"w1","from":1,"to":2}]}')
    expect(plain?.keep.length).toBe(1)
    const fenced = JevCompact.parsePlan('```json\n{"keep":[{"window":"w1","from":1,"to":2}]}\n```')
    expect(fenced?.keep.length).toBe(1)
  })

  test("returns undefined for anything it cannot trust", () => {
    expect(JevCompact.parsePlan("no json at all")).toBeUndefined()
    expect(JevCompact.parsePlan('{"keep":"everything"}')).toBeUndefined()
    expect(JevCompact.parsePlan('{"wrong":[]}')).toBeUndefined()
    expect(JevCompact.parsePlan('{"keep":[{"window":1,"from":1,"to":2}]}')).toBeUndefined()
  })
})

describe("JevCompact.applyPlan", () => {
  const text = `${prose(10)}\nkeep me 11\nsource at C:\\jeanluc\\opencode-fork\\packages\\opencode\\src\\x.ts\n${prose(8)}`

  test("keeps the declared lines and marks the dropped runs", () => {
    const windows = JevCompact.windowsFromText(text, 10_000)
    const plan = { keep: [{ window: "w1", from: 10, to: 11 }], data: false }
    const out = JevCompact.applyPlan(text, windows, plan)
    expect(out).toContain("keep me 11")
    expect(out).not.toContain("plain line 3")
    expect(out).toContain("[intake-compact: removed")
    expect(out.length).toBeLessThan(text.length)
  })

  test("restores an anchored line the model asked to drop", () => {
    const windows = JevCompact.windowsFromText(text, 10_000)
    const plan = { keep: [{ window: "w1", from: 1, to: 1 }], data: false }
    const out = JevCompact.applyPlan(text, windows, plan)
    expect(out).toContain("plain line 1")
    expect(out).not.toContain("keep me 11")
    expect(out).toContain("C:\\jeanluc\\opencode-fork\\packages\\opencode\\src\\x.ts")
  })

  test("leaves the text untouched when the model saw precise data", () => {
    const windows = JevCompact.windowsFromText(text, 10_000)
    expect(JevCompact.applyPlan(text, windows, { keep: [{ window: "w1", from: 1, to: 2 }], data: true })).toBe(text)
  })

  test("leaves the text untouched when nothing is declared or nothing would shrink", () => {
    const windows = JevCompact.windowsFromText(text, 10_000)
    expect(JevCompact.applyPlan(text, windows, { keep: [], data: false })).toBe(text)
    const all = { keep: [{ window: "w1", from: 1, to: windows.at(-1)!.end }], data: false }
    expect(JevCompact.applyPlan(text, windows, all)).toBe(text)
  })

  test("clamps a span that overflows its window instead of trusting it", () => {
    const windows = JevCompact.windowsFromText(prose(20), 60)
    const plan = { keep: [{ window: "w1", from: 1, to: 99_999 }], data: false }
    const out = JevCompact.applyPlan(prose(20), windows, plan)
    expect(out).toContain(windows[0]!.text.split("\n").at(-1)!)
    expect(out).not.toContain(windows[1]!.text.split("\n")[0]!)
  })

  test("ignores a span naming a window that does not exist", () => {
    const windows = JevCompact.windowsFromText(text, 10_000)
    const plan = { keep: [{ window: "w99", from: 1, to: 2 }], data: false }
    expect(JevCompact.applyPlan(text, windows, plan)).toBe(text)
  })
})

describe("JevCompact.looksLikeData", () => {
  test("recognises JSON and numeric tables, not prose", () => {
    expect(JevCompact.looksLikeData('{"rows":[{"value":1}]}')).toBe(true)
    expect(JevCompact.looksLikeData("[1, 2, 3]")).toBe(true)
    expect(JevCompact.looksLikeData(Array.from({ length: 60 }, (_, index) => `${index},12.5,98.2,7`).join(" "))).toBe(true)
    expect(JevCompact.looksLikeData(prose(60))).toBe(false)
    expect(JevCompact.looksLikeData("too short")).toBe(false)
  })
})

describe("JevCompact.buildCompactionPrompt", () => {
  test("carries the intent and numbers the rows per window", () => {
    const windows = JevCompact.windowsFromText(prose(5), 10_000)
    const prompt = JevCompact.buildCompactionPrompt({ tool: "read", intent: "fix the parser", windows })
    expect(prompt).toContain("fix the parser")
    expect(prompt).toContain("WINDOW w1")
    expect(prompt).toContain("1: plain line 1")
    expect(prompt).toContain("read")
  })

  test("states that the intent is unknown rather than omitting the line", () => {
    const windows = JevCompact.windowsFromText(prose(3), 10_000)
    expect(JevCompact.buildCompactionPrompt({ tool: "bash", windows })).toContain("(not stated)")
  })
})
