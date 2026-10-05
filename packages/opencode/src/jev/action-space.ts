import { JevSchema } from "./schema"
import type { Element } from "./validate"

/**
 * The action space, built from what was just observed on the page.
 *
 * `jev-ultrafast`'s insight is that the tool list is not a fixed vocabulary: it
 * is regenerated from the elements currently on screen, indexed `[1]`, `[2]`, …
 * so one request can carry the operation head *and* one target head per
 * operation. The model picks an index; it never emits a selector, a coordinate
 * or a script, so nothing it says can address the page on its own.
 *
 * Two consequences this module enforces rather than hopes for:
 *
 *   - a control the observation marked as not actionable is never offered, so a
 *     disabled or hidden element cannot be chosen at all;
 *   - a control that already holds a value is still offered, but its current
 *     value travels in the criterion description, so the model can see that
 *     re-filling it is not progress.
 *
 * The number of criteria is bounded by the endpoint contract (255 options per
 * choice question), so a page with hundreds of controls truncates in a
 * deterministic order rather than being refused.
 */

export interface Operation {
  readonly id: string
  readonly description: string
  /** True when the operation needs an element index to act on. */
  readonly takesTarget: boolean
}

/**
 * The operations a browser loop can take. `DONE` and `BLOCKED` deliberately
 * take no target: they are claims about the goal, not acts on the page, and
 * asking the model to also name an element for them is how a finished run
 * acquires one last pointless click.
 */
export const OPERATIONS: readonly Operation[] = [
  { id: "CLICK", takesTarget: true, description: "Click an observed control, menu option or suggestion." },
  { id: "TYPE_TEXT", takesTarget: true, description: "Type into an observed editable field. The value comes from the goal." },
  { id: "SELECT", takesTarget: true, description: "Pick an observed dropdown value." },
  { id: "SCROLL", takesTarget: false, description: "Scroll to bring more of the page into view." },
  { id: "WAIT", takesTarget: false, description: "Wait for the page to settle before deciding again." },
  { id: "DONE", takesTarget: false, description: "Every requirement of the goal is visibly satisfied." },
  { id: "BLOCKED", takesTarget: false, description: "No supported operation can advance the goal." },
]

/** Maximum options the endpoint accepts in one choice question. */
export const MAX_CRITERIA = 255

export interface Observation {
  readonly url?: string
  readonly title?: string
  /** Visible text of the page, truncated by the caller if large. */
  readonly text?: string
  readonly elements: readonly Element[]
  /** What the loop already did, oldest first, so the model can see progress. */
  readonly recent_actions?: readonly string[]
}

export interface Space {
  /** Everything the questions depend on; the model sees nothing else. */
  readonly state: {
    readonly page: { readonly url?: string; readonly title?: string; readonly text?: string }
    readonly elements: readonly { index: number; role: string; label: string; value: string; actionable: boolean }[]
    readonly recent_actions: readonly string[]
  }
  /** The operations offered, in a fixed order. */
  readonly operations: readonly Operation[]
  /** The element indexes actually offered as criteria, in order. */
  readonly ids: readonly number[]
  readonly questions: Readonly<Record<string, JevSchema.Question>>
  /** Criteria dropped because the page exceeded MAX_CRITERIA. */
  readonly truncated: number
}

/**
 * Collapse a label to one line, keeping its punctuation.
 *
 * Quotes and punctuation carry meaning for a decision model ("Save" vs "Save as"),
 * so they are kept. Only line breaks and runs of whitespace are collapsed, and an
 * empty label gets a placeholder: a criterion the model cannot read is worse than
 * a blunt one.
 */
function quote(label: string): string {
  return label.replace(/\s+/g, " ").trim() || "(unlabelled)"
}

function value(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : "(empty)"
}

/** Only actionable controls are offered; indexes keep the observation's order. */
export function offerable(elements: readonly Element[]): Element[] {
  return elements.filter((element) => element.actionable)
}

function criteria(elements: readonly Element[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const element of elements) {
    const description =
      element.value === undefined || element.value.trim() === ""
        ? `[${element.index}] ${quote(element.label)} — role: ${element.role}, current value: (empty)`
        : `[${element.index}] ${quote(element.label)} — role: ${element.role}, current value: ${value(element.value)}`
    out[String(element.index)] = description
  }
  return out
}

/**
 * Build the request for one step.
 *
 * `goal` is the objective being advanced. `rules` are extra constraints the
 * caller wants the model to weigh (a required order of fields, a control to
 * leave alone); they travel with the question so they cannot be lost in `state`.
 */
export function space(goal: string, observed: Observation, rules: readonly string[] = []): Space {
  const actionable = offerable(observed.elements).slice(0, MAX_CRITERIA)
  const truncated = offerable(observed.elements).length - actionable.length
  const ids = actionable.map((element) => element.index)
  // Question ids in the order the endpoint must be asked: the operation head
  // first, then one target head per targetable operation, in OPERATIONS order.
  const wanted = ["operation", ...OPERATIONS.filter((operation) => operation.takesTarget).map((o) => `${o.id}_target`)]
  const questions: Record<string, JevSchema.Question> = {
    operation: {
      type: "choice",
      instructions: {
        goal,
        rules: [
          "Advance the goal from the CURRENT page using exactly one operation.",
          "Fill a required field before submitting the form that contains it.",
          ...rules,
        ],
      },
      criteria: Object.fromEntries(OPERATIONS.map((operation) => [operation.id, operation.description])),
    },
  }

  // One target head per targetable operation, in the same request. The endpoint
  // answers all of them, but only the head matching the chosen operation is
  // allowed to act — the rest are discarded, not ranked.
  if (actionable.length > 0) {
    const table = criteria(actionable)
    for (const operation of OPERATIONS) {
      if (!operation.takesTarget) continue
      questions[`${operation.id}_target`] = {
        type: "choice",
        instructions: {
          goal,
          operation: operation.id,
          rules: [
            "Choose the single best observed element index.",
            "Do not choose a field that already holds the requested value.",
            ...rules,
          ],
        },
        criteria: table,
      }
    }
  }

  return {
    state: {
      page: { url: observed.url, title: observed.title, text: observed.text },
      elements: actionable.map((element) => ({
        index: element.index,
        role: element.role,
        label: element.label,
        value: element.value ?? "",
        actionable: element.actionable,
      })),
      recent_actions: observed.recent_actions ?? [],
    },
    operations: OPERATIONS,
    ids,
    questions: pick(questions, wanted),
    truncated,
  }
}

/** Keep question ids in a deterministic order without inventing names. */
function pick(
  questions: Record<string, JevSchema.Question>,
  order: readonly string[],
): Record<string, JevSchema.Question> {
  const out: Record<string, JevSchema.Question> = {}
  for (const id of order) if (questions[id]) out[id] = questions[id]!
  return out
}

export * as JevBrowserActionSpace from "./action-space"