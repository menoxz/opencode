import { describe, expect, test } from "bun:test"
import { preview, previewWindow } from "../../src/tool/shell"

const MAX = 30_000
const HEAD = 7_500
const TAIL = 22_500
const MARKER = "\n\n[... "
const REPORT = /\[\.\.\. (\d+) characters omitted — first (\d+) and last (\d+) shown \.\.\.\]/
const EMOJI = "\u{1f600}"
const HIGH = "\ud83d"
const LOW = "\ude00"

const markers = (text: string) => text.split(MARKER).length - 1

const gap = (omitted: number, first: number, last: number) =>
  `\n\n[... ${omitted} characters omitted — first ${first} and last ${last} shown ...]\n\n`

const report = (text: string) => {
  const match = REPORT.exec(text)
  if (!match) throw new Error(`no omission marker in ${JSON.stringify(text.slice(0, 80))}`)
  return { omitted: Number(match[1]), first: Number(match[2]), last: Number(match[3]) }
}

// The code as it stood before the fix, transcribed: preview() dropped the head
// silently, the stream re-applied it to `last + chunk`, and the truncation was
// deduced by comparing the preview with the very value it was built from.
function legacyPreview(text: string) {
  if (text.length <= MAX) return text
  return "...\n\n" + text.slice(-MAX)
}

function legacyStream(chunks: string[]) {
  let last = ""
  for (const chunk of chunks) last = legacyPreview(last + chunk)
  return last
}

function legacyDetected(chunks: string[], output: string) {
  const last = legacyStream(chunks)
  return (last || legacyPreview(output)) !== (last || output)
}

function stream(chunks: string[]) {
  const window = previewWindow()
  for (const chunk of chunks) window.push(chunk)
  return window.get()
}

const slices = (text: string, size: number) => {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

describe("previewWindow", () => {
  test("signals a truncation seen on the stream where the string comparison stayed false", () => {
    const chunks = ["x".repeat(45_000), "x".repeat(45_000), "x".repeat(45_000), "x".repeat(45_000)]
    const output = chunks.join("")

    // The shipped signal: `last` is already truncated, so it was compared with itself.
    expect(legacyDetected(chunks, output)).toBe(false)

    const got = stream(chunks)
    expect(got.truncated).toBe(true)
    expect(got.text.startsWith(chunks[0].slice(0, 64))).toBe(true)
    expect(got.text.endsWith(chunks[3].slice(-64))).toBe(true)
    expect(report(got.text).omitted).toBe(180_000 - HEAD - TAIL)
  })

  test("carries exactly one omission marker, whatever the chunking", () => {
    const big = "y".repeat(180_000)
    for (const size of [200, 1_000, 7_999, 29_999, 30_000, 30_001, 45_000, 180_000]) {
      expect(markers(stream(slices(big, size)).text)).toBe(1)
    }

    // The refuted argument: preview() re-applied to its own output would nest markers.
    let acc = big
    for (let i = 0; i < 5; i++) {
      acc = preview(acc).text
      expect(markers(acc)).toBe(1)
    }
  })

  test("truncates a long line that has no newline at all", () => {
    const line = "é".repeat(30_500)
    expect(line).not.toContain("\n")

    const window = previewWindow()
    window.push(line.slice(0, 15_250))
    window.push(line.slice(15_250))

    const got = window.get()
    expect(got.truncated).toBe(true)
    expect(markers(got.text)).toBe(1)
    expect(report(got.text).omitted).toBe(500)
    expect(got.text).toBe(line.slice(0, HEAD) + gap(500, HEAD, TAIL) + line.slice(-TAIL))
  })

  test("counts the exact total seen before truncation", () => {
    const chunks = ["a".repeat(60_000), "b".repeat(60_000), "c".repeat(58_200)]
    const got = stream(chunks)

    expect(got.truncated).toBe(true)
    expect(report(got.text)).toEqual({ omitted: 178_200 - HEAD - TAIL, first: HEAD, last: TAIL })
    expect(got.text).toBe("a".repeat(HEAD) + gap(148_200, HEAD, TAIL) + "c".repeat(TAIL))

    // The budget is crossed at 30 001, not wherever a string inequality appears.
    const exact = previewWindow()
    exact.push("z".repeat(MAX))
    expect(exact.get().truncated).toBe(false)
    expect(exact.get().text).toBe("z".repeat(MAX))
    exact.push("z")
    expect(exact.get().truncated).toBe(true)
    expect(report(exact.get().text).omitted).toBe(1)
  })

  test("never splits a code point at the head cut", () => {
    const split = "a".repeat(HEAD - 1) + EMOJI + "b".repeat(TAIL)
    const got = preview(split)

    expect(got.truncated).toBe(true)
    expect(markers(got.text)).toBe(1)
    expect(report(got.text).first).toBe(HEAD - 1)
    expect(got.text).toBe("a".repeat(HEAD - 1) + gap(2, HEAD - 1, TAIL) + "b".repeat(TAIL))
    expect(got.text).not.toContain(HIGH)
  })

  test("never splits a code point on the sliding tail cut", () => {
    const window = previewWindow()
    window.push("c".repeat(MAX + 1))
    window.push("d" + EMOJI + "e".repeat(TAIL - 1))

    const got = window.get()
    expect(markers(got.text)).toBe(1)
    expect(report(got.text).last).toBe(TAIL - 1)
    expect(got.text.endsWith("e".repeat(TAIL - 1))).toBe(true)
    expect(got.text).not.toContain(HIGH)
    expect(got.text).not.toContain(LOW)
  })
})

describe("preview", () => {
  test("reports the truncation it performed instead of losing it silently", () => {
    const small = "q".repeat(MAX)
    expect(preview(small)).toEqual({ text: small, truncated: false })

    const big = "q".repeat(MAX + 1)
    const got = preview(big)
    expect(got.truncated).toBe(true)
    expect(markers(got.text)).toBe(1)
    expect(got.text).toBe("q".repeat(HEAD) + gap(1, HEAD, TAIL) + "q".repeat(TAIL))
  })
})
