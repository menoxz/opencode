import { describe, expect, test } from "bun:test"
import type { Diagnostic as LSPDiagnostic } from "../../src/lsp/client"
import { Diagnostic } from "../../src/lsp/diagnostic"

const diag = (message: string): LSPDiagnostic => ({
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  severity: 1,
  message,
})

const many = (n: number, prefix: string): LSPDiagnostic[] =>
  Array.from({ length: n }, (_, i) => diag(`${prefix}-${i}`))

describe("boundProjectDiagnostics", () => {
  test("keeps only the most relevant project files and flags truncation", () => {
    const diagnostics = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`C:/proj/file-${i}.ts`, many(2, `f${i}`)]),
    )
    const bound = Diagnostic.boundProjectDiagnostics(diagnostics)
    expect(Object.keys(bound.diagnostics)).toHaveLength(5)
    expect(bound.truncated).toBe(true)
  })

  test("keeps priority files first even when other files carry more diagnostics", () => {
    const diagnostics = {
      "C:/proj/other-1.ts": many(500, "o1"),
      "C:/proj/other-2.ts": many(500, "o2"),
      "C:/proj/other-3.ts": many(500, "o3"),
      "C:/proj/other-4.ts": many(500, "o4"),
      "C:/proj/other-5.ts": many(500, "o5"),
      "C:/proj/other-6.ts": many(500, "o6"),
      "C:/proj/touched.ts": many(1, "t"),
    }
    const bound = Diagnostic.boundProjectDiagnostics(diagnostics, ["C:/proj/touched.ts"])
    const files = Object.keys(bound.diagnostics)
    expect(files[0]).toBe("C:/proj/touched.ts")
    expect(files).toHaveLength(5)
    expect(bound.truncated).toBe(true)
  })

  test("caps diagnostics per file", () => {
    const bound = Diagnostic.boundProjectDiagnostics({ "C:/proj/huge.ts": many(50, "h") })
    expect(bound.diagnostics["C:/proj/huge.ts"]).toHaveLength(20)
    expect(bound.truncated).toBe(true)
  })

  test("keeps the full map unchanged when under both caps", () => {
    const diagnostics = {
      "C:/proj/a.ts": many(3, "a"),
      "C:/proj/b.ts": many(5, "b"),
    }
    const bound = Diagnostic.boundProjectDiagnostics(diagnostics)
    expect(bound.diagnostics).toEqual(diagnostics)
    expect(bound.truncated).toBe(false)
  })
})
