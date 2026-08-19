/**
 * Tests for sustained eval-regression detection (see eval/regression.ts).
 *
 * The headline case reproduces the exact measured outage from
 * AUDIT-opencodev2.md D5: 36 consecutive hourly runs at a 33 % pass rate over
 * 58 hours, against a 53.6 % historical baseline, which the existing
 * run-over-run comparison could not detect.
 *
 * Run: bun test src/eval/regression.test.ts
 */
import { describe, expect, test } from "bun:test"
import { EvalRegression } from "./regression"

const HOUR = 3_600_000
const NOW = 1_700_000_000_000

/** Newest-first samples, one per hour. */
const series = (rates: number[], suiteId = "sanity"): EvalRegression.Sample[] =>
  rates.map((passRate, i) => ({
    runId: `run-${i}`,
    suiteId,
    timestamp: NOW - i * HOUR,
    passRate,
  }))

/** The audited outage: 36 broken runs on top of a long healthy history. */
const outage = () => series([...Array(36).fill(0.33), ...Array(200).fill(0.536)])

describe("historicalBaseline", () => {
  test("is undefined without enough history", () => {
    expect(EvalRegression.historicalBaseline(series([0.5, 0.5]))).toBeUndefined()
  })

  test("is the median, so a minority of broken runs cannot drag it down", () => {
    expect(EvalRegression.historicalBaseline(outage())).toBeCloseTo(0.536, 3)
  })

  test("handles an even sample count", () => {
    expect(EvalRegression.historicalBaseline(series([0.4, 0.6, 0.6, 0.4, 0.5, 0.5]))).toBeCloseTo(0.5, 5)
  })
})

describe("detectSustained", () => {
  test("fires on the measured 58-hour outage", () => {
    const alert = EvalRegression.detectSustained(outage(), { now: NOW })
    expect(alert).not.toBeNull()
    if (!alert) throw new Error("unreachable")
    expect(alert.consecutive).toBe(36)
    expect(alert.currentPassRate).toBeCloseTo(0.33, 3)
    expect(alert.baselinePassRate).toBeCloseTo(0.536, 3)
    expect(alert.hoursBlind).toBeCloseTo(35, 0)
    expect(alert.suiteId).toBe("sanity")
  })

  test("would have fired after 2 runs, not 36", () => {
    // Only the two most recent runs are broken: the alarm must already ring.
    const early = series([0.33, 0.33, ...Array(200).fill(0.536)])
    const alert = EvalRegression.detectSustained(early, { now: NOW })
    expect(alert?.consecutive).toBe(2)
  })

  test("stays silent for a single bad run", () => {
    const blip = series([0.33, ...Array(200).fill(0.536)])
    expect(EvalRegression.detectSustained(blip, { now: NOW })).toBeNull()
  })

  test("stays silent on a healthy suite", () => {
    expect(EvalRegression.detectSustained(series(Array(50).fill(0.536)), { now: NOW })).toBeNull()
  })

  test("tolerates noise within the margin", () => {
    const noisy = series([0.50, 0.51, 0.49, ...Array(200).fill(0.536)])
    expect(EvalRegression.detectSustained(noisy, { now: NOW })).toBeNull()
  })

  test("stays silent without enough history to judge", () => {
    expect(EvalRegression.detectSustained(series([0.1, 0.1]), { now: NOW })).toBeNull()
  })

  test("is empty-safe", () => {
    expect(EvalRegression.detectSustained([], { now: NOW })).toBeNull()
  })

  test("a recovery run clears the alarm", () => {
    const recovered = series([0.60, ...Array(36).fill(0.33), ...Array(200).fill(0.536)])
    expect(EvalRegression.detectSustained(recovered, { now: NOW })).toBeNull()
  })

  test("respects an explicit baseline", () => {
    const flat = series(Array(50).fill(0.33))
    // Against its own median the suite looks stable — this is precisely the
    // blind spot of run-over-run comparison.
    expect(EvalRegression.detectSustained(flat, { now: NOW })).toBeNull()
    // Against the real historical baseline it is an outage.
    const alert = EvalRegression.detectSustained(flat, { baseline: 0.536, now: NOW })
    expect(alert?.consecutive).toBe(50)
  })

  test("honours a stricter minConsecutive", () => {
    const two = series([0.33, 0.33, ...Array(200).fill(0.536)])
    expect(EvalRegression.detectSustained(two, { minConsecutive: 3, now: NOW })).toBeNull()
  })
})

describe("format", () => {
  test("names the suite, the streak, the rates and the blind time", () => {
    const alert = EvalRegression.detectSustained(outage(), { now: NOW })
    if (!alert) throw new Error("expected alert")
    const text = EvalRegression.format(alert)
    expect(text).toContain("sanity")
    expect(text).toContain("36 consecutive runs")
    expect(text).toContain("33.0 %")
    expect(text).toContain("53.6 %")
  })
})
