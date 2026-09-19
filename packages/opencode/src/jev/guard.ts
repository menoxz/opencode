import { Schema } from "effect"

/**
 * Calibrated-confidence gate. Jev reports a calibrated confidence with every
 * answer; this turns that number into a decision about whether an otherwise
 * automatic action still deserves a human. It is deliberately pure so the
 * policy can be unit-tested without a network call.
 */

export const DEFAULT_THRESHOLD = 0.8

/** Permissions whose auto-allow is worth re-checking against the guard. */
export const DEFAULT_PERMISSIONS: ReadonlyArray<string> = ["write", "shell", "workspace_handoff"]

export const Verdict = Schema.Literals(["allow", "escalate"]).annotate({ identifier: "JevVerdict" })
export type Verdict = Schema.Schema.Type<typeof Verdict>

export const Assessment = Schema.Struct({
  verdict: Verdict,
  confidence: Schema.Number,
  reason: Schema.String,
}).annotate({ identifier: "JevAssessment" })
export type Assessment = Schema.Schema.Type<typeof Assessment>

export function assess(
  answer: { confidence: number; noul?: boolean },
  threshold: number = DEFAULT_THRESHOLD,
): Assessment {
  if (answer.confidence < threshold)
    return {
      verdict: "escalate",
      confidence: answer.confidence,
      reason: `calibrated confidence ${answer.confidence.toFixed(2)} is below the ${threshold.toFixed(2)} threshold`,
    }
  if (answer.noul === true)
    return {
      verdict: "escalate",
      confidence: answer.confidence,
      reason: "flagged as destructive, irreversible or security-sensitive",
    }
  return { verdict: "allow", confidence: answer.confidence, reason: "confident and not flagged" }
}

export * as JevGuard from "./guard"
