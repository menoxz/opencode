/**
 * Golden fingerprints — make real deliverables verifiable.
 *
 * A fingerprint is a deterministic `anomaly code → count` map computed from a
 * real production artifact. The baseline is recorded in a manifest, and the
 * runner fails when the fingerprint drifts **in either direction**:
 *
 * - an anomaly that appears or grows is a regression;
 * - an anomaly that disappears or shrinks is an improvement that must be
 *   acknowledged deliberately, by re-blessing the manifest.
 *
 * The second direction is what makes the set an oracle rather than a ratchet: a
 * validator that silently stops detecting things would otherwise look like
 * progress.
 *
 * @module eval/golden/fingerprint
 */

/** Anomaly code → number of occurrences. Codes are stable identifiers. */
export type Fingerprint = Record<string, number>

/** One detected anomaly, with enough context for a human to locate it. */
export interface Finding {
  code: string
  detail: string
}

/** A validator turns raw artifact bytes into findings. */
export type Validator = (source: string) => Finding[]

/** How a fingerprint entry moved relative to the baseline. */
export type Direction = "appeared" | "disappeared" | "increased" | "decreased"

export interface Drift {
  code: string
  baseline: number
  current: number
  direction: Direction
}

/** One golden case: a real artifact and the fingerprint measured on it. */
export interface GoldenCase {
  id: string
  /** Path relative to the fixtures root, forward slashes. */
  artifact: string
  kind: string
  /** SHA-256 of the artifact bytes, so a silently edited fixture is detected. */
  sha256: string
  fingerprint: Fingerprint
}

export interface Manifest {
  version: number
  /** Human note explaining that numbers are measured, never authored by hand. */
  note: string
  cases: GoldenCase[]
}

/** Collapse findings into a fingerprint. */
export function toFingerprint(findings: Finding[]): Fingerprint {
  const out: Fingerprint = {}
  for (const finding of findings) out[finding.code] = (out[finding.code] ?? 0) + 1
  return sortKeys(out)
}

/** Stable key order, so a manifest diff stays readable. */
export function sortKeys(fingerprint: Fingerprint): Fingerprint {
  const out: Fingerprint = {}
  for (const key of Object.keys(fingerprint).sort()) out[key] = fingerprint[key]
  return out
}

/** Every drift between a baseline and a current fingerprint, both directions. */
export function diffFingerprint(baseline: Fingerprint, current: Fingerprint): Drift[] {
  const codes = new Set([...Object.keys(baseline), ...Object.keys(current)])
  const drifts: Drift[] = []
  for (const code of [...codes].sort()) {
    const before = baseline[code] ?? 0
    const after = current[code] ?? 0
    if (before === after) continue
    drifts.push({ code, baseline: before, current: after, direction: directionOf(before, after) })
  }
  return drifts
}

function directionOf(before: number, after: number): Direction {
  if (before === 0) return "appeared"
  if (after === 0) return "disappeared"
  return after > before ? "increased" : "decreased"
}

const VERDICT: Record<Direction, string> = {
  appeared: "REGRESSION — a defect that did not exist is now detected",
  increased: "REGRESSION — this defect got worse",
  disappeared: "IMPROVEMENT — re-bless the manifest if this is intended, or the detector broke",
  decreased: "IMPROVEMENT — re-bless the manifest if this is intended, or the detector broke",
}

/**
 * Human-readable failure report. It must name the artifact, the code, both
 * numbers and the direction: "the fingerprint changed" is not actionable.
 */
export function formatDrift(
  caseId: string,
  artifact: string,
  drifts: Drift[],
  findings: Finding[],
): string {
  const lines = [`golden fingerprint drifted for "${caseId}" (${artifact})`]
  for (const drift of drifts) {
    lines.push(`  ${drift.code}: ${drift.baseline} -> ${drift.current}  [${VERDICT[drift.direction]}]`)
    const examples = findings.filter((f) => f.code === drift.code).slice(0, 3)
    for (const example of examples) lines.push(`      ${example.detail}`)
  }
  lines.push(`  Re-bless deliberately with: bun run script/golden-bless.ts`)
  return lines.join("\n")
}
