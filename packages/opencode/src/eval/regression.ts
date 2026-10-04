/**
 * Sustained-regression detection for the eval suite.
 *
 * Measured problem (see AUDIT-opencodev2.md, D5): the Sanity suite ran every
 * hour and sat at a 33 % pass rate for 36 consecutive runs across 58 hours
 * against a historical average of 53.6 %, and nothing ever fired.
 *
 * The reason is structural, not a missing notification: `detectRegression` in
 * eval/index.ts compares the latest run to the *immediately preceding* run. A
 * suite that is uniformly broken produces a run-over-run delta of exactly zero,
 * so a permanent outage is indistinguishable from perfect stability. The alarm
 * could not fire by construction.
 *
 * This module compares recent runs against the historical baseline instead, and
 * fires when the failure persists — which is the signal an operator actually
 * cares about. The baseline is the median of observed pass rates, so a minority
 * streak of bad runs cannot drag the reference down to meet itself.
 */

export type Sample = {
  runId: string
  suiteId: string
  timestamp: number
  passRate: number
}

export type Alert = {
  suiteId: string
  /** Number of consecutive runs below the baseline, newest-first. */
  consecutive: number
  currentPassRate: number
  baselinePassRate: number
  /** Timestamp of the oldest run in the failing streak. */
  since: number
  /** How long the suite has been failing unnoticed. */
  hoursBlind: number
  runIds: string[]
}

/** Consecutive runs under baseline before the alarm fires. */
export const MIN_CONSECUTIVE = 2

/** Pass-rate drop under baseline that counts as a regression. */
export const MARGIN = 0.05

/**
 * Median pass rate — robust to a minority of broken runs, unlike the mean.
 * Returns undefined when there is not enough history to judge.
 */
export function historicalBaseline(samples: Sample[], minimum = 5): number | undefined {
  if (samples.length < minimum) return undefined
  const rates = samples.map((s) => s.passRate).sort((a, b) => a - b)
  const mid = Math.floor(rates.length / 2)
  return rates.length % 2 === 0 ? (rates[mid - 1] + rates[mid]) / 2 : rates[mid]
}

/**
 * Detect a regression that has persisted. `samples` must be newest-first, which
 * is the order `metrics.listReports` returns.
 */
export function detectSustained(
  samples: Sample[],
  opts: { baseline?: number; minConsecutive?: number; margin?: number; now?: number } = {},
): Alert | null {
  if (samples.length === 0) return null

  const baseline = opts.baseline ?? historicalBaseline(samples)
  if (baseline === undefined) return null

  const minConsecutive = opts.minConsecutive ?? MIN_CONSECUTIVE
  const margin = opts.margin ?? MARGIN
  const floor = baseline - margin

  const streak: Sample[] = []
  for (const sample of samples) {
    if (sample.passRate >= floor) break
    streak.push(sample)
  }

  if (streak.length < minConsecutive) return null

  const oldest = streak[streak.length - 1]
  const now = opts.now ?? Date.now()

  return {
    suiteId: streak[0].suiteId,
    consecutive: streak.length,
    currentPassRate: streak[0].passRate,
    baselinePassRate: baseline,
    since: oldest.timestamp,
    hoursBlind: Math.max(0, (now - oldest.timestamp) / 3_600_000),
    runIds: streak.map((s) => s.runId),
  }
}

const percent = (value: number) => `${(value * 100).toFixed(1)} %`

/** Operator-facing prose. Deliberately blunt: this is the sonnette. */
export function format(alert: Alert): string {
  return [
    `EVAL REGRESSION — suite "${alert.suiteId}" has been failing for ${alert.consecutive} consecutive runs.`,
    `Pass rate ${percent(alert.currentPassRate)} against a baseline of ${percent(alert.baselinePassRate)}.`,
    `Failing since ${new Date(alert.since).toISOString()} (${alert.hoursBlind.toFixed(1)} h).`,
    `Affected runs: ${alert.runIds.slice(0, 5).join(", ")}${alert.runIds.length > 5 ? ", …" : ""}`,
    `A run-over-run comparison cannot see this: every run is equally broken, so the delta is zero.`,
  ].join("\n")
}

export * as EvalRegression from "./regression"
