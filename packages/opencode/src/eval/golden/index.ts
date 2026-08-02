/**
 * Golden eval-set — real deliverables, deterministic validators, measured baseline.
 *
 * The corpus under `fixtures/` is made of unmodified production artifacts. Their
 * anomaly counts in `manifest.json` are measured by the validators in this
 * directory, never authored by hand: a baseline someone typed is a wish, not a
 * measurement.
 *
 * @module eval/golden
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { bpmnFindings } from "./bpmn"
import { formioFindings } from "./formio"
import { toFingerprint, type Finding, type Fingerprint, type Manifest, type Validator } from "./fingerprint"

const here = path.dirname(fileURLToPath(import.meta.url))

export const FIXTURES_DIR = path.join(here, "fixtures")
export const MANIFEST_PATH = path.join(here, "manifest.json")

/** Artifact kind → the validator that fingerprints it. */
export const VALIDATORS: Record<string, Validator> = {
  bpmn: bpmnFindings,
  formio: formioFindings,
}

export interface Artifact {
  /** Stable case id, e.g. `bpmn/sample-leave-request-as-is.bpmn`. */
  id: string
  kind: string
  absolutePath: string
}

/**
 * Every fixture on disk, sorted. Discovery is by directory name so a new
 * artifact cannot be added without also being measured — a fixture that no rule
 * ever reads would be decoration.
 */
export function discoverArtifacts(): Artifact[] {
  return Object.keys(VALIDATORS)
    .flatMap((kind) => {
      const dir = path.join(FIXTURES_DIR, kind)
      return readdirSync(dir)
        .sort()
        .map((file) => ({ id: `${kind}/${file}`, kind, absolutePath: path.join(dir, file) }))
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export interface Measurement {
  findings: Finding[]
  fingerprint: Fingerprint
  sha256: string
}

/** Measure one artifact. Pure with respect to its bytes: same input, same output. */
export function measure(artifact: Artifact): Measurement {
  const bytes = readFileSync(artifact.absolutePath)
  const findings = VALIDATORS[artifact.kind](bytes.toString("utf-8"))
  return {
    findings,
    fingerprint: toFingerprint(findings),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest
}

export * as Golden from "."
