import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"
import { decide, makeCircuit, type Circuit, type Outcome } from "./decide"

/**
 * Task complexity as a calibrated verdict instead of a substring count.
 *
 * The deterministic classifier this replaces counted English keywords against
 * task text with a bidirectional `includes`, so a French grammatical word
 * scored as many "complex" signals as the word "deploy". Measured over 20 real
 * user prompts it returned "complex" 16 times and "simple" never, leaving the
 * auto-planning gate permanently open.
 *
 * Two `noul` questions replace it, because `noul` is the axis measured to be
 * reliable (29/29, Brier 0.0197, calibrated in both tails) while `choice` fails
 * on adjacent candidates — and simple/moderate/complex are adjacent. Three
 * levels are still produced: each probability is cut at its own threshold and
 * the residual band between them is "moderate", which is the honest answer when
 * the model is undecided.
 *
 * One call per session. If JEV is unavailable the caller's heuristic verdict is
 * returned instead, so the gate still opens on large tasks — degraded, not dead.
 */

export type Complexity = "simple" | "moderate" | "complex"

/** At or above this probability the task is treated as the named level. */
export const DEFAULT_AUTO_PLAN_AT = 0.5

/** Round-trip bound. The observed median is ~830 ms with a 4.3 s tail. */
export const DEFAULT_TIMEOUT_MS = 5_000

/** The task text is the only state; a long one is truncated, never the question. */
export const MAX_TASK_CHARS = 2_000

export const STATE = "Judge one task statement for a coding agent. Decide only the task itself, never the surrounding conversation."

export function questions(task: string): Record<string, JevSchema.Question> {
  const quoted = task.length > MAX_TASK_CHARS ? `${task.slice(0, MAX_TASK_CHARS)}\n[truncated]` : task
  return {
    small: {
      type: "noul",
      instructions: `Task statement:\n"""\n${quoted}\n"""\nIs this a small, single-step task that a developer completes in a few minutes, without needing a written plan?`,
      criteria: {
        true: "it is a small single-step task needing no written plan",
        false: "it is not a small single-step task",
      },
    },
    needs_decomposition: {
      type: "noul",
      instructions: `Task statement:\n"""\n${quoted}\n"""\nIs this a complex task requiring decomposition into several planned steps, spanning multiple files or subsystems?`,
      criteria: {
        true: "it is complex and needs a decomposed plan",
        false: "it is not complex and does not need a decomposed plan",
      },
    },
  }
}

/**
 * Map the two probabilities onto the three levels. Returns `undefined` when an
 * answer is missing, which `decide` treats as an abstention rather than a
 * failure, so a partial answer does not open the circuit breaker.
 */
export function interpret(response: JevSchema.Response, autoPlanAt: number = DEFAULT_AUTO_PLAN_AT): Complexity | undefined {
  const small = response.answers["small"]
  const complex = response.answers["needs_decomposition"]
  if (small?.type !== "noul" || complex?.type !== "noul") return undefined
  if (complex.noul >= autoPlanAt) return "complex"
  if (small.noul >= autoPlanAt) return "simple"
  return "moderate"
}

export interface Input {
  readonly task: string
  /** The deterministic verdict, used whenever JEV cannot answer. */
  readonly fallback: Complexity
  readonly autoPlanAt: number
  readonly timeoutMs: number
  readonly enabled: boolean
  readonly circuit: Circuit
}

export function classify(
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: Input,
): Effect.Effect<Outcome<Complexity>> {
  const request: JevSchema.Request = { state: STATE, questions: questions(input.task) }
  return decide<Complexity>({
    label: "complexity",
    circuit: input.circuit,
    enabled: input.enabled,
    timeoutMs: input.timeoutMs,
    fallback: () => input.fallback,
    run: JevClient.decide(http, request, settings).pipe(Effect.map((response) => interpret(response, input.autoPlanAt))),
  })
}

/**
 * Process-wide breaker. The endpoint being unreachable is a property of the
 * process, not of one call, so the breaker must outlive a single hook.
 */
export const circuit = makeCircuit()

export * as JevComplexity from "./complexity"