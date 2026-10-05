import { JevBrowserActionSpace } from "./action-space"
import { JevBrowserValidate } from "./validate"
import type { Element } from "./validate"

/**
 * An a11y snapshot, turned into an action space and back into a plan.
 *
 * The browser driver already publishes a stable `uid` per element on every
 * snapshot. That uid is the only handle the policy layer is allowed to hold: a
 * decision names an index into the observed table, the table maps it to a uid,
 * and the driver resolves the uid against a fresh snapshot. Nothing in this path
 * can emit a CSS selector, a coordinate or an expression — the model cannot
 * address the page, it can only point at something that was on the page when we
 * looked.
 *
 * The consequence is deliberate: a page that changes between the decision and
 * the click invalidates the uid, and the driver re-observes. That is the cheap
 * half of `jev-ultrafast`'s fingerprint check, and the expensive half — a node
 * identity check against the live document — belongs to the driver, not here.
 */

/** One line of an accessibility snapshot, as the driver publishes it. */
export interface SnapshotEntry {
  readonly uid: string
  readonly role: string
  readonly name: string
  readonly value?: string
  /** Forced by the caller; defaults to a role-based judgement. */
  readonly actionable?: boolean
}

/** True when the driver can act on this entry without further evidence. */
export function isDrivable(entry: SnapshotEntry): boolean {
  if (!entry.uid) return false
  if (entry.actionable !== undefined) return entry.actionable
  if (STRUCTURAL.has(entry.role)) return false
  return ACTIONABLE.has(entry.role)
}

/**
 * Roles that carry no action. They are dropped before an index is assigned, so a
 * heading or a paragraph can never consume a slot in the criteria table.
 */
const STRUCTURAL = new Set([
  "alert",
  "banner",
  "complementary",
  "contentinfo",
  "definition",
  "dialog",
  "figure",
  "form",
  "generic",
  "group",
  "heading",
  "img",
  "list",
  "listitem",
  "log",
  "main",
  "navigation",
  "none",
  "note",
  "paragraph",
  "progressbar",
  "region",
  "separator",
  "status",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "tooltip",
  "tree",
  "treeitem",
  "WebArea",
  "StaticText",
  "text",
  "article",
  "cell",
  "row",
])

/** Roles the driver can drive directly. Anything else is offered but not claimed. */
const ACTIONABLE = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "DisclosureTriangle",
  "popover",
])

function isActionable(entry: SnapshotEntry): boolean {
  return isDrivable(entry)
}

/**
 * Assign the 1-based indices the model will see.
 *
 * Index order follows the snapshot order, so the same page always yields the same
 * table and a decision can be compared across steps.
 */
export function toElements(entries: readonly SnapshotEntry[]): Element[] {
  const elements: Element[] = []
  for (const entry of entries) {
    // A control with no uid cannot be addressed, and a control the driver
    // reports as inert or structural cannot be acted on. Both are dropped before
    // an index is assigned, so neither can consume a slot in the criteria table
    // nor be named by a decision.
    if (!entry.uid) continue
    if (!isActionable(entry)) continue
    elements.push({
      index: elements.length + 1,
      role: entry.role,
      label: entry.name || entry.role,
      value: entry.value,
      actionable: true,
    })
  }
  return elements
}

/** The uid an index refers to. The index space is what the model ever sees. */
export interface Binding {
  readonly index: number
  readonly uid: string
  readonly role: string
  readonly label: string
}

/**
 * Pair each index with the uid it came from.
 *
 * Both lists must be the same length and in the same order; anything else means
 * the caller paired a decision with a different snapshot than the one the model
 * was shown, which is precisely the drift this module exists to make visible.
 */
export function bind(elements: readonly Element[], entries: readonly SnapshotEntry[]): Binding[] {
  const usable = entries.filter((entry) => isDrivable(entry))
  if (usable.length !== elements.length)
    throw new Error(`snapshot drift: ${elements.length} elements were decided on, ${usable.length} are drivable`)
  return elements.map((element, position) => {
    const entry = usable[position]!
    return { index: element.index, uid: entry.uid, role: element.role, label: element.label }
  })
}

/**
 * What the driver should do next.
 *
 * `fill` carries no value: the decision picks the field, and the text to type is
 * the harness' business, not the decision model's. Inventing a value here would
 * be the policy layer writing to a page on the model's behalf, which is the line
 * this whole module exists to hold.
 */
export type Plan =
  | { readonly kind: "click"; readonly uid: string; readonly reason: string }
  | { readonly kind: "fill"; readonly uid: string; readonly reason: string }
  | { readonly kind: "scroll"; readonly reason: string }
  | { readonly kind: "wait"; readonly reason: string }
  | { readonly kind: "done"; readonly reason: string }
  | { readonly kind: "blocked"; readonly reason: string }
  | { readonly kind: "retry"; readonly reason: string; readonly detail: string }

function bound(bindings: readonly Binding[], index: number | undefined): Binding | undefined {
  if (index === undefined) return undefined
  return bindings.find((binding) => binding.index === index)
}

function labelled(target: Binding | undefined, fallback: string): string {
  return target ? `${target.role} "${target.label}"` : fallback
}

/**
 * Turn a decision into a plan, or refuse it.
 *
 * A decided operation whose element cannot be bound is a `retry`, never a
 * silent success: the caller re-observes and asks again rather than clicking
 * something it did not observe.
 */
export function plan(
  outcome: JevBrowserValidate.Outcome,
  bindings: readonly Binding[],
): Plan {
  if (!outcome.ok) return { kind: "retry", reason: "rejected", detail: `${outcome.reason}: ${outcome.detail}` }

  const target = bound(bindings, outcome.index)

  switch (outcome.operation) {
    case "CLICK":
    case "SELECT":
      if (!target) return { kind: "retry", reason: "unbound_target", detail: `no element for index ${outcome.index}` }
      return { kind: "click", uid: target.uid, reason: `click the ${labelled(target, "chosen control")}` }
    case "TYPE_TEXT":
      if (!target) return { kind: "retry", reason: "unbound_target", detail: `no element for index ${outcome.index}` }
      return { kind: "fill", uid: target.uid, reason: `type into the ${labelled(target, "chosen field")}` }
    case "SCROLL":
      return { kind: "scroll", reason: "scroll to bring the next part of the page into view" }
    case "WAIT":
      return { kind: "wait", reason: "wait for the page to settle before deciding again" }
    case "DONE":
      return { kind: "done", reason: "the model judges every requirement visibly satisfied" }
    default:
      return { kind: "blocked", reason: `the model reports no supported operation advances the goal` }
  }
}

/**
 * Build the step to ask about, from a snapshot.
 *
 * `url` and `title` ride in the state so the model can tell a page change from a
 * re-render; `history` is what the loop already did, which is the only memory it
 * gets — there is no hidden conversation state to drift out of sync.
 */
export function step(
  goal: string,
  entries: readonly SnapshotEntry[],
  context: { url?: string; title?: string; history?: readonly string[]; rules?: readonly string[] },
): JevBrowserPolicyStep {
  return {
    goal,
    observed: {
      url: context.url,
      title: context.title,
      text: undefined,
      elements: toElements(entries),
      recent_actions: context.history ?? [],
    },
    rules: context.rules ?? [],
  }
}

export interface JevBrowserPolicyStep {
  readonly goal: string
  readonly observed: JevBrowserActionSpace.Observation
  readonly rules?: readonly string[]
}

export * as JevBrowserSnapshot from "./snapshot"