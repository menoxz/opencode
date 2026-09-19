import { Schema } from "effect"

/**
 * Probability gate. A `noul` answer is a single probability that the risky
 * outcome is true, so the guard escalates exactly when that probability is at
 * or above the threshold. It is deliberately pure so the policy can be
 * unit-tested without a network call.
 */

export const DEFAULT_THRESHOLD = 0.5

/** Permissions whose auto-allow is worth re-checking against the guard. */
export const DEFAULT_PERMISSIONS: ReadonlyArray<string> = ["write", "shell", "workspace_handoff"]

export const Verdict = Schema.Literals(["allow", "escalate"]).annotate({ identifier: "JevVerdict" })
export type Verdict = Schema.Schema.Type<typeof Verdict>

export const Assessment = Schema.Struct({
  verdict: Verdict,
  probability: Schema.Number,
  reason: Schema.String,
}).annotate({ identifier: "JevAssessment" })
export type Assessment = Schema.Schema.Type<typeof Assessment>

export function assess(probability: number, threshold: number = DEFAULT_THRESHOLD): Assessment {
  const percent = `${(probability * 100).toFixed(1)}%`
  return probability >= threshold
    ? {
        verdict: "escalate",
        probability,
        reason: `the model put ${percent} probability on the risky outcome, at or above the ${threshold.toFixed(2)} threshold`,
      }
    : {
        verdict: "allow",
        probability,
        reason: `the model put only ${percent} probability on the risky outcome, below the ${threshold.toFixed(2)} threshold`,
      }
}

export * as JevGuard from "./guard"
