/**
 * Re-bless the golden manifest.
 *
 * This is deliberately a separate, explicit command. The runner fails in BOTH
 * directions — a defect that disappears is a failure too — because a detector
 * that quietly stops detecting looks exactly like progress. Re-blessing must
 * therefore be a decision a human takes, never something a test does for them.
 *
 * Usage: bun run script/golden-bless.ts
 */

import { existsSync, writeFileSync } from "node:fs"
import { diffFingerprint } from "../src/eval/golden/fingerprint"
import { discoverArtifacts, measure, MANIFEST_PATH, readManifest } from "../src/eval/golden"
import type { Manifest } from "../src/eval/golden/fingerprint"

const previous = safeReadManifest()
const artifacts = discoverArtifacts()

const manifest: Manifest = {
  version: 1,
  note: "Counts are measured by src/eval/golden validators on the real artifacts in fixtures/. Never edit them by hand: run `bun run script/golden-bless.ts`.",
  cases: artifacts.map((artifact) => {
    const measured = measure(artifact)
    return {
      id: artifact.id,
      artifact: artifact.id,
      kind: artifact.kind,
      sha256: measured.sha256,
      fingerprint: measured.fingerprint,
    }
  }),
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8")

console.log(`blessed ${manifest.cases.length} cases -> ${MANIFEST_PATH}`)
for (const entry of manifest.cases) {
  const before = previous?.cases.find((c) => c.id === entry.id)
  const total = Object.values(entry.fingerprint).reduce((sum, n) => sum + n, 0)
  console.log(`  ${entry.id.padEnd(48)} ${total} findings`)
  for (const drift of diffFingerprint(before?.fingerprint ?? {}, entry.fingerprint)) {
    const marker = before ? "changed" : "new"
    console.log(`      ${marker}: ${drift.code} ${drift.baseline} -> ${drift.current}`)
  }
}

function safeReadManifest(): Manifest | undefined {
  if (!existsSync(MANIFEST_PATH)) return undefined
  return readManifest()
}
