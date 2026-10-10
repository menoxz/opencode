import { Cause, Duration, Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"

/**
 * One bounded JEV decision, with a deterministic fallback for every failure mode.
 *
 * The harness makes decisions on the critical path of a turn, so a JEV call can
 * never be allowed to hang the loop or throw into it. Every caller names a
 * fallback that is correct on its own — a substring classifier, a filter verdict,
 * a pass-through — and this wrapper owns everything else:
 *
 *   - a bounded timeout, because a hung request must not hold the turn;
 *   - a circuit breaker, so an unreachable model costs one timeout per reset
 *     window instead of one per tool call;
 *   - an abstention path, because a JEV hook that returns `undefined` answered
 *     but declined to judge, which is not a transport failure;
 *   - a total catch, so any defect in the JEV path degrades to the fallback
 *     rather than propagating.
 *
 * The fallback is always returned as a value, never thrown, so a caller cannot
 * accidentally treat "JEV was unavailable" as "JEV said no".
 */

const log = Log.create({ service: "jev-decide" })

/** Why the deterministic answer was used instead of the model's. */
export type Fallback =
  /** JEV is switched off in configuration. */
  | "disabled"
  /** The circuit breaker is open: too many consecutive failures. */
  | "circuit-open"
  /** The request exceeded the timeout. */
  | "timeout"
  /** The request failed for any other reason (network, schema, defect). */
  | "error"
  /** JEV answered but abstained, returning no usable value. */
  | "incomplete"

export type Outcome<T> =
  | { readonly source: "jev"; readonly value: T; readonly latencyMs: number }
  | { readonly source: "fallback"; readonly value: T; readonly reason: Fallback }

export function isJev<A, B>(outcome: Outcome<A> | Outcome<B>): outcome is { source: "jev"; value: A; latencyMs: number } {
  return outcome.source === "jev"
}

/** Consecutive-failure state. Held by the caller so each hook owns its own. */
export interface Circuit {
  failures: number
  openedAt: number
}

export function makeCircuit(): Circuit {
  return { failures: 0, openedAt: 0 }
}

/** Failures tolerated before the breaker opens. */
export const DEFAULT_BREAKER_THRESHOLD = 3
/** How long the breaker stays open before one probe is allowed through. */
export const DEFAULT_BREAKER_RESET_MS = 30_000

/**
 * Default bound on one bounded Jev decision, in milliseconds.
 *
 * Sized for the slowest transport that can answer a batch. The System One
 * endpoint answered a 20-question batch in ~0.7–2 s, but the harness decision
 * model (`jev.decision_model`, see `@/decision/model`) is a chat completion and
 * needs more. Under-bounding here silently disables the feature it protects —
 * measured once already, when a healthy endpoint needed 8 s against a 5 s bound —
 * so the bound is generous; the circuit breaker, not a tight timeout, is what
 * keeps a dead endpoint cheap.
 */
export const DEFAULT_HOOK_TIMEOUT_MS = 15_000

export function isOpen(circuit: Circuit, threshold = DEFAULT_BREAKER_THRESHOLD, resetMs = DEFAULT_BREAKER_RESET_MS, now = Date.now()): boolean {
  return circuit.openedAt > 0 && now - circuit.openedAt < resetMs && circuit.failures >= threshold
}

function recordSuccess(circuit: Circuit) {
  circuit.failures = 0
  circuit.openedAt = 0
}

function recordFailure(circuit: Circuit, threshold: number, now: number) {
  circuit.failures += 1
  if (circuit.failures >= threshold) circuit.openedAt = now
}

/** Outcome of the attempt, before the fallback is applied. */
type Settled<T> = { kind: "ok"; value: T | undefined } | { kind: "err" }

export interface Options<T, E = unknown> {
  /** Identifies the call site in logs and in the fallback reason. */
  readonly label: string
  /** Circuit state owned by the caller. */
  readonly circuit: Circuit
  /** When false, the fallback is returned without any network call. */
  readonly enabled: boolean
  /** Bound on the round-trip. */
  readonly timeoutMs: number
  /** The JEV call. Returning `undefined` means JEV abstained. Any error it raises
   * is caught here and turned into the fallback, never propagated. */
  readonly run: Effect.Effect<T | undefined, E>
  /** The deterministic answer. Must be correct without any model. */
  readonly fallback: () => T
  readonly breakerThreshold?: number
  readonly breakerResetMs?: number
}

/**
 * Run a JEV decision under a timeout and a circuit breaker, always yielding a
 * value. Never fails: every path ends on either the model's answer or the
 * caller's fallback.
 */
export function decide<T, E = unknown>(options: Options<T, E>): Effect.Effect<Outcome<T>> {
  const threshold = options.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD
  const resetMs = options.breakerResetMs ?? DEFAULT_BREAKER_RESET_MS

  if (!options.enabled) return Effect.succeed({ source: "fallback", value: options.fallback(), reason: "disabled" })
  if (isOpen(options.circuit, threshold, resetMs))
    return Effect.succeed({ source: "fallback", value: options.fallback(), reason: "circuit-open" })

  const started = Date.now()
  return options.run.pipe(
    // The failure is caught before the timeout so the two stay distinguishable:
    // a timeout interrupts the effect and yields None, a failure yields {err}.
    Effect.map((value): Settled<T> => ({ kind: "ok", value })),
    Effect.catchCause((cause) => {
      log.warn("jev decision failed, using the deterministic fallback", {
        label: options.label,
        cause: Cause.pretty(cause).slice(0, 300),
      })
      return Effect.succeed({ kind: "err" } as const)
    }),
    Effect.timeoutOption(Duration.millis(options.timeoutMs)),
    Effect.map((settled) => {
      if (Option.isNone(settled)) {
        recordFailure(options.circuit, threshold, Date.now())
        return { source: "fallback", value: options.fallback(), reason: "timeout" as const }
      }
      if (settled.value.kind === "err") {
        recordFailure(options.circuit, threshold, Date.now())
        return { source: "fallback", value: options.fallback(), reason: "error" as const }
      }
      // A model that answered but declined to judge is not an outage: it must
      // not open the breaker, it must simply defer to the fallback.
      if (settled.value.value === undefined) {
        recordSuccess(options.circuit)
        log.debug("jev abstained, using the deterministic fallback", { label: options.label })
        return { source: "fallback", value: options.fallback(), reason: "incomplete" as const }
      }
      recordSuccess(options.circuit)
      return { source: "jev", value: settled.value.value, latencyMs: Date.now() - started }
    }),
  )
}

export * as JevDecide from "./decide"