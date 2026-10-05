import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { JevSchema } from "./schema"

/**
 * A browser policy decision is only trustworthy if the model answered the question
 * we actually asked, about the page we actually observed.
 *
 * `jev-ultrafast` guards this the same way, and the guard is not optional: it
 * refuses a response whose `choice` is not the argmax of the probability table,
 * whose probabilities do not sum to 1, or whose id is not in the table of
 * observed elements. Without it a truncated or drifted response reads as a
 * confident decision about an element that was never on the page — the model
 * never has to be wrong about reality to hurt us, only about the question.
 *
 * Every rejection is a value, never a throw: the caller falls back to a
 * deterministic policy that is correct on its own.
 */

const log = Log.create({ service: "jev-browser-validate" })

/** How far the probability table may drift from a normalized distribution. */
export const SUM_TOLERANCE = 0.02

/** A single observed control, as the action space described it. */
export interface Element {
  /** 1-based; matches the index the model was shown. */
  readonly index: number
  readonly role: string
  readonly label: string
  readonly value?: string
  /** False when the control is not actionable right now (disabled, hidden, inert). */
  readonly actionable: boolean
}

export type Rejection =
  | "unknown_id"
  | "not_argmax"
  | "not_normalized"
  | "no_probabilities"
  | "not_choice"
  | "head_absent"
  | "empty_space"

export interface Valid {
  readonly ok: true
  readonly index: number
  readonly confidence: number
  readonly element: Element
}

export interface Invalid {
  readonly ok: false
  readonly reason: Rejection
  readonly detail: string
}

export type Result = Valid | Invalid

export interface Decided {
  readonly ok: true
  readonly operation: string
  readonly confidence: number
  /** Present only when the operation takes a target. */
  readonly index?: number
  readonly element?: Element
}

export type Outcome = Decided | Invalid

function invalid(reason: Rejection, detail: string): Invalid {
  return { ok: false, reason, detail }
}

/** Sum, argmax and top score of a probability table, or why it is unusable. */
type Table = Invalid | { readonly ok: true; readonly sum: number; readonly argmax: string; readonly highest: number; readonly choice: string }

function table(head: JevSchema.Answer | undefined, what: string): Table {
  if (head === undefined) return invalid("head_absent", `no ${what} answer was returned`)
  if (head.type !== "choice") return invalid("not_choice", `expected a choice ${what}, got ${head.type}`)
  if (!head.probabilities) return invalid("no_probabilities", `the ${what} carried no probability table`)

  let sum = 0
  let argmax = ""
  let highest = Number.NEGATIVE_INFINITY
  for (const [id, probability] of Object.entries(head.probabilities)) {
    if (!Number.isFinite(probability)) return invalid("not_normalized", `probability for "${id}" is not finite`)
    sum += probability
    if (probability > highest) {
      highest = probability
      argmax = id
    }
  }
  if (sum === 0) return invalid("not_normalized", `the ${what} probabilities sum to zero`)
  if (Math.abs(sum - 1) > SUM_TOLERANCE)
    return invalid("not_normalized", `${what} probabilities sum to ${sum.toFixed(4)}, outside 1 +/- ${SUM_TOLERANCE}`)
  return { ok: true, sum, argmax, highest, choice: head.choice }
}

/**
 * Validate one target head against the table it was asked about.
 *
 * `head` is whatever the endpoint returned for this question id: it may be
 * missing entirely when the call failed, was refused, or the model declined to
 * judge — none of which is a decision.
 */
export function target(head: JevSchema.Answer | undefined, elements: readonly Element[]): Result {
  if (elements.length === 0) return invalid("empty_space", "no actionable element was observed")
  const checked = table(head, "target")
  if (checked.ok === false) return checked

  const offered = new Set(elements.map((element) => String(element.index)))
  if (!offered.has(checked.choice))
    return invalid("unknown_id", `choice "${checked.choice}" is not an observed element index`)

  const element = elements.find((candidate) => String(candidate.index) === checked.choice)
  if (!element) return invalid("unknown_id", `element ${checked.choice} vanished from the table`)
  if (!element.actionable)
    return invalid("unknown_id", `element ${checked.choice} ("${element.label}") was observed as not actionable`)

  if (checked.choice !== checked.argmax)
    return invalid(
      "not_argmax",
      `choice "${checked.choice}" is not the argmax ("${checked.argmax}" scores ${checked.highest.toFixed(4)})`,
    )

  return { ok: true, index: element.index, confidence: checked.highest, element }
}

export interface OperationSpec {
  readonly id: string
  readonly takesTarget: boolean
}

/** The target head an operation is judged against; `undefined` when it takes none. */
export function headFor(spec: OperationSpec): string | undefined {
  return spec.takesTarget ? `${spec.id}_target` : undefined
}

/**
 * The whole decision, or a named reason it is not usable.
 *
 * The operation head is validated first, because it decides *which* target head
 * is authoritative: a speculative fan-out answers one target head per
 * operation, and only the head matching the chosen operation may act.
 */
export function decision(
  answers: Readonly<Record<string, JevSchema.Answer>>,
  operations: readonly OperationSpec[],
  elements: readonly Element[],
  find: (spec: OperationSpec) => string | undefined = headFor,
): Outcome {
  const checked = table(answers.operation, "operation head")
  if (checked.ok === false) return checked

  const spec = operations.find((entry) => entry.id === checked.choice)
  if (!spec) return invalid("unknown_id", `operation "${checked.choice}" is not in the action space`)
  if (checked.choice !== checked.argmax)
    return invalid("not_argmax", `operation "${checked.choice}" is not the argmax ("${checked.argmax}")`)

  const id = find(spec)
  if (id === undefined) return { ok: true, operation: spec.id, confidence: checked.highest }

  const element = target(answers[id], elements)
  if (!element.ok) return element
  return { ok: true, operation: spec.id, confidence: checked.highest, index: element.index, element: element.element }
}

/**
 * Record a rejection at debug level without deciding anything.
 *
 * Rejections are expected — a drifted page, a truncated response, a refused
 * endpoint — so they are logged once, never surfaced as errors.
 */
export const logRejection = (outcome: Outcome) =>
  Effect.sync(() => {
    if (!outcome.ok) log.debug("rejected", { reason: outcome.reason, detail: outcome.detail })
  })

export * as JevBrowserValidate from "./validate"