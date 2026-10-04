import { describe, expect, test } from "bun:test"
import { formatGoalContext } from "./compaction"

describe("sticky goal context", () => {
  test("keeps findings and completion gaps visible after completion", () => {
    const context = formatGoalContext({
      status: "completed", source: "user", goal: "Ship safely", dod: ["secure"], outOfScope: [], version: 2, updatedAt: 2,
      findings: [{ id: "SEC-001", severity: "high", status: "residual", summary: "tenant filter pending", evidence: ["audit"], firstSeenAt: 1, updatedAt: 2 }],
      completion: { summary: "functional work done", evidence: [{ dod: "secure", proof: "test 4/4 exit 0" }], unverified: [{ dod: "load", reason: "environment unavailable" }], completedAt: 2 },
    } as any)
    expect(context).toContain("SUMMARY: functional work done")
    expect(context).toContain("FINDING SEC-001 [high/residual]")
    expect(context).toContain("UNVERIFIED: load")
  })
})

// P06 T1 — the sticky tier is budgeted, and the budget is never summed.
describe("sticky budget (P06)", () => {
  const MARKER = /^\+\d+ éléments non affichés/
  const OPEN_LINE = /^FINDING .*\/open\]:/
  const DETAIL_LINE = /^FINDING .*\/(closed|residual|out_of_scope)\]:|^UNVERIFIED: /

  const finding = (id: string, status: string, severity: string, summary: string, firstSeenAt: number) => ({
    id,
    severity,
    status,
    summary,
    evidence: ["e"],
    firstSeenAt,
    updatedAt: 2,
  })

  const state = (findings: unknown[], unverified: unknown[] = []) =>
    ({
      status: "approved",
      source: "user",
      goal: "G",
      dod: ["d"],
      outOfScope: [],
      version: 1,
      updatedAt: 1,
      findings,
      completion: { unverified },
    }) as any

  const gap = () => ({ dod: "z".repeat(200), reason: "w".repeat(300) })

  // 23 residual findings whose detail line is `FINDING F-0101 [high/residual]: ` + 120
  // chars = 150, plus 2 gaps of 12 + 160 + 3 + 240 = 415: 25 items against an 800 budget.
  const detailFixture = () =>
    state(
      Array.from({ length: 23 }, (_, i) =>
        finding(`F-${String(i + 101).padStart(4, "0")}`, "residual", "high", "y".repeat(200), i + 1),
      ),
      [gap(), gap()],
    )

  // T1.1 — a surplus `open` finding is named line by line, then counted. Never silent.
  test("T1.1 open overflow is named line by line and then counted", () => {
    const findings = Array.from({ length: 40 }, (_, i) =>
      finding(`F-${String(i + 1).padStart(4, "0")}`, "open", i === 0 ? "critical" : "high", "x".repeat(200), i + 1),
    )
    const lines = formatGoalContext(state(findings)).split("\n")
    const shown = lines.filter((l) => OPEN_LINE.test(l))
    const named = lines.filter((l) => /^OPEN: F-/.test(l))
    expect(shown.length).toBeGreaterThan(0)
    expect(lines).toContain(`FINDING F-0001 [critical/open]: ${"x".repeat(160)}`)
    // OPEN_OVERFLOW_MAX_LINES = 25 names the surplus individually…
    expect(named.length).toBe(25)
    // …and the remainder is counted, so the loss is bounded by construction.
    expect(lines.some((l) => l.startsWith(`OPEN: +${40 - shown.length} findings open non affichés`))).toBe(true)
  })

  // T1.2 — the detail overflow marker names the dropped ids instead of swallowing them.
  test("T1.2 detail overflow marker names the dropped ids", () => {
    const lines = formatGoalContext(detailFixture()).split("\n")
    const marker = lines.find((l) => MARKER.test(l))
    expect(marker).toBeDefined()
    const shown = lines.filter((l) => DETAIL_LINE.test(l))
    // The marker counts exactly what the budget dropped, and names the leading ids.
    // A sorted residual finding precedes every gap, so the leading dropped ids here
    // are findings; the gaps are named only once the findings have all been shown.
    expect(marker!).toContain(`+${25 - shown.length} éléments non affichés`)
    expect(marker!).toContain("F-0106")
  })

  // T1.2b — the same holds for a dropped completion gap: its id reaches the marker.
  test("T1.2b a dropped completion gap is named by id in the marker", () => {
    const lines = formatGoalContext(
      state([finding("F-0001", "residual", "high", "y".repeat(200), 1)], [gap(), gap()]),
    ).split("\n")
    const marker = lines.find((l) => MARKER.test(l))
    expect(marker).toBeDefined()
    // One residual (152) + one gap (415) fit in 800; the second gap does not.
    expect(lines.filter((l) => DETAIL_LINE.test(l)).length).toBe(2)
    expect(marker!).toContain("UNVERIFIED-1")
  })

  // T1.3 — the `open` band is rendered before the detail band, so the closure barrier
  // (which only reads `open`) is never pushed out by a lower-priority item.
  // The fixture is deliberately adversarial: detail findings are fed FIRST, so the
  // pre-patch implementation, which renders `state.findings` in input order, emits a
  // detail line ahead of the `open` band and fails this assertion.
  test("T1.3 the open band precedes the detail band", () => {
    const findings = [
      ...Array.from({ length: 23 }, (_, i) =>
        finding(`F-1${String(i + 101).padStart(3, "0")}`, "residual", "high", "y".repeat(200), i + 1),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        finding(`F-0${i + 1}00`, "open", "critical", "x".repeat(200), i + 1),
      ),
    ]
    const lines = formatGoalContext(state(findings, [gap()])).split("\n")
    const lastOpen = lines.findLastIndex((l) => OPEN_LINE.test(l) || /^OPEN: /.test(l))
    const firstDetail = lines.findIndex((l) => DETAIL_LINE.test(l))
    expect(lastOpen).toBeGreaterThanOrEqual(0)
    expect(firstDetail).toBeGreaterThan(lastOpen)
  })

  // T1.4 — the detail tier is ONE tier. Its shown length is bounded by the single budget,
  // and its total by that budget plus a bounded marker allowance. Two renderBudgeted calls
  // on DETAIL_BUDGET_CHARS would return ~1600 chars for an announced 800 and fail here.
  test("T1.4 the detail tier total stays inside one budget, never the sum of two", () => {
    const lines = formatGoalContext(detailFixture()).split("\n")
    const shown = lines.filter((l) => DETAIL_LINE.test(l))
    const marker = lines.filter((l) => MARKER.test(l))
    const shownChars = shown.join("\n").length
    expect(shownChars).toBeLessThanOrEqual(800)
    expect(shownChars + marker.join("\n").length).toBeLessThanOrEqual(1000)
  })
})