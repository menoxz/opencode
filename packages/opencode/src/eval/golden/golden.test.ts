/**
 * Golden runner.
 *
 * Each case compares the fingerprint measured now against the blessed baseline.
 * A drift fails the test in BOTH directions:
 *
 * - a defect that appears or grows is a regression;
 * - a defect that disappears or shrinks fails too, because the most likely cause
 *   is not that the artifact improved but that the detector stopped detecting.
 *   Silence must be earned, so it has to be re-blessed on purpose.
 *
 * Run with `bun test`, or on its own with `bun run test:golden`.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { diffFingerprint, formatDrift, toFingerprint } from "./fingerprint"
import { discoverArtifacts, measure, readManifest, VALIDATORS } from "."

const manifest = readManifest()
const artifacts = discoverArtifacts()

describe("golden fingerprints", () => {
  test("every fixture on disk is covered by the manifest", () => {
    const covered = new Set(manifest.cases.map((c) => c.id))
    const uncovered = artifacts.filter((a) => !covered.has(a.id)).map((a) => a.id)
    expect(uncovered).toEqual([])
  })

  test("every manifest case still exists on disk", () => {
    const present = new Set(artifacts.map((a) => a.id))
    const missing = manifest.cases.filter((c) => !present.has(c.id)).map((c) => c.id)
    expect(missing).toEqual([])
  })

  test("the corpus is not vacuously clean", () => {
    // A fingerprint set where nothing is ever detected would pass forever while
    // proving nothing. At least one real anomaly must be under measurement.
    const total = manifest.cases
      .flatMap((c) => Object.values(c.fingerprint))
      .reduce((sum, n) => sum + n, 0)
    expect(total).toBeGreaterThan(0)
  })

  for (const artifact of artifacts) {
    const baseline = manifest.cases.find((c) => c.id === artifact.id)
    if (!baseline) continue

    test(`${artifact.id} matches its blessed fingerprint`, () => {
      const measured = measure(artifact)
      const problems: string[] = []

      // A fixture edited without re-blessing would silently invalidate the
      // baseline, so the bytes themselves are pinned.
      if (measured.sha256 !== baseline.sha256)
        problems.push(
          `artifact bytes changed: sha256 ${baseline.sha256.slice(0, 12)} -> ${measured.sha256.slice(0, 12)}`,
        )

      const drifts = diffFingerprint(baseline.fingerprint, measured.fingerprint)
      if (drifts.length > 0)
        problems.push(formatDrift(artifact.id, artifact.absolutePath, drifts, measured.findings))

      if (problems.length > 0) throw new Error(problems.join("\n"))
    })
  }

  test("validators are deterministic across repeated runs", () => {
    for (const artifact of artifacts) {
      const source = readFileSync(artifact.absolutePath, "utf-8")
      const once = toFingerprint(VALIDATORS[artifact.kind](source))
      const twice = toFingerprint(VALIDATORS[artifact.kind](source))
      expect(twice).toEqual(once)
    }
  })
})
