import { describe, expect, test } from "bun:test"
import { JevBrowserActionSpace } from "./action-space"
import { JevBrowserSnapshot } from "./snapshot"
import type { SnapshotEntry } from "./snapshot"
import { JevBrowserValidate } from "./validate"

const operations = JevBrowserActionSpace.OPERATIONS

const entries: SnapshotEntry[] = [
  { uid: "e1", role: "heading", name: "Flights" },
  { uid: "e2", role: "combobox", name: "Where from?" },
  { uid: "e3", role: "combobox", name: "Where to?", value: "London" },
  { uid: "e4", role: "button", name: "Search" },
  { uid: "e5", role: "StaticText", name: "Cheapest CHF 118" },
  { uid: "e6", role: "button", name: "Reset", actionable: false },
  { uid: "e7", role: "link", name: "Privacy" },
]

describe("JevBrowserSnapshot.toElements", () => {
  test("drops structural roles and assigns contiguous indices", () => {
    const elements = JevBrowserSnapshot.toElements(entries)
    expect(elements.map((element) => element.label)).toEqual([
      "Where from?",
      "Where to?",
      "Search",
      "Privacy",
    ])
    expect(elements.map((element) => element.index)).toEqual([1, 2, 3, 4])
  })

  test("a control the driver marked inert is never offered", () => {
    const elements = JevBrowserSnapshot.toElements(entries)
    expect(elements.some((element) => element.label === "Reset")).toBe(false)
  })

  test("a control with no uid cannot be addressed and takes no index", () => {
    const elements = JevBrowserSnapshot.toElements([
      { uid: "", role: "button", name: "Ghost" },
      { uid: "e9", role: "button", name: "Real" },
    ])
    expect(elements.map((element) => element.label)).toEqual(["Real"])
    expect(elements[0]?.index).toBe(1)
  })

  test("an unnamed control falls back to its role so it stays readable", () => {
    const elements = JevBrowserSnapshot.toElements([{ uid: "e1", role: "button", name: "" }])
    expect(elements[0]?.label).toBe("button")
  })

  test("an unknown role is not offered, because we cannot promise the driver can act on it", () => {
    // The safe direction is the one that loses a step rather than the one that
    // invents a capability: an unrecognised role is withheld from the model, the
    // model picks another control, the loop progresses. Offering it would let a
    // decision name something the driver may only be able to read.
    const elements = JevBrowserSnapshot.toElements([{ uid: "e1", role: "SomeNewWidget", name: "Widget" }])
    expect(elements).toHaveLength(0)
  })

  test("a structural role forced actionable by the driver is trusted", () => {
    // The driver is the authority on what it can drive; our table is a
    // conservative default, not an override.
    const elements = JevBrowserSnapshot.toElements([
      { uid: "e1", role: "heading", name: "Heading that is also a link", actionable: true },
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]?.label).toBe("Heading that is also a link")
  })
})

describe("JevBrowserSnapshot.bind", () => {
  test("pairs each index with the uid it was assigned from", () => {
    const elements = JevBrowserSnapshot.toElements(entries)
    const bindings = JevBrowserSnapshot.bind(elements, entries)
    expect(bindings.map((binding) => binding.uid)).toEqual(["e2", "e3", "e4", "e7"])
    expect(bindings[0]).toMatchObject({ index: 1, role: "combobox", label: "Where from?" })
  })

  test("a snapshot that changed between decision and execution is refused", () => {
    const elements = JevBrowserSnapshot.toElements(entries)
    // The page re-rendered and lost a control: the decision was made against a
    // table that no longer describes anything, so it must not be executed.
    expect(() => JevBrowserSnapshot.bind(elements, entries.slice(0, 4))).toThrow(/snapshot drift/)
  })
})

describe("JevBrowserSnapshot.plan", () => {
  const bindings = JevBrowserSnapshot.bind(JevBrowserSnapshot.toElements(entries), entries)

  test("a click becomes a uid, never a selector or a coordinate", () => {
    const outcome = JevBrowserValidate.decision(
      {
        operation: { type: "choice", choice: "CLICK", confidence: 0.9, probabilities: { CLICK: 0.9, DONE: 0.1 } },
        CLICK_target: { type: "choice", choice: "1", confidence: 0.8, probabilities: { "1": 0.8, "2": 0.2 } },
      },
      operations,
      JevBrowserSnapshot.toElements(entries),
    )
    expect(JevBrowserSnapshot.plan(outcome, bindings)).toEqual({
      kind: "click",
      uid: "e2",
      reason: 'click the combobox "Where from?"',
    })
  })

  test("a type decision names the field and no value", () => {
    const outcome = JevBrowserValidate.decision(
      {
        operation: { type: "choice", choice: "TYPE_TEXT", confidence: 0.9, probabilities: { TYPE_TEXT: 1 } },
        TYPE_TEXT_target: { type: "choice", choice: "2", confidence: 0.8, probabilities: { "2": 1 } },
      },
      operations,
      JevBrowserSnapshot.toElements(entries),
    )
    const action = JevBrowserSnapshot.plan(outcome, bindings)
    expect(action.kind).toBe("fill")
    expect(action).toMatchObject({ uid: "e3" })
    expect(Object.keys(action)).not.toContain("value")
  })

  test("operations with no target map to their own actions", () => {
    const decided = (operation: string) =>
      JevBrowserValidate.decision(
        { operation: { type: "choice", choice: operation, confidence: 1, probabilities: { [operation]: 1 } } },
        operations,
        JevBrowserSnapshot.toElements(entries),
      )
    expect(JevBrowserSnapshot.plan(decided("SCROLL"), bindings)).toMatchObject({ kind: "scroll" })
    expect(JevBrowserSnapshot.plan(decided("WAIT"), bindings)).toMatchObject({ kind: "wait" })
    expect(JevBrowserSnapshot.plan(decided("DONE"), bindings)).toMatchObject({ kind: "done" })
    expect(JevBrowserSnapshot.plan(decided("BLOCKED"), bindings)).toMatchObject({ kind: "blocked" })
  })

  test("a rejected decision becomes a retry, never an action", () => {
    const rejected = { ok: false, reason: "not_argmax", detail: "choice \"3\" is not the argmax" } as const
    expect(JevBrowserSnapshot.plan(rejected, bindings)).toMatchObject({ kind: "retry", reason: "rejected" })
  })

  test("a decided element that cannot be bound asks for a fresh look", () => {
    const outcome = JevBrowserValidate.decision(
      {
        operation: { type: "choice", choice: "CLICK", confidence: 0.9, probabilities: { CLICK: 1 } },
        CLICK_target: { type: "choice", choice: "1", confidence: 0.8, probabilities: { "1": 1 } },
      },
      operations,
      JevBrowserSnapshot.toElements(entries),
    )
    expect(JevBrowserSnapshot.plan(outcome, [])).toMatchObject({ kind: "retry", reason: "unbound_target" })
  })
})

describe("JevBrowserSnapshot.step", () => {
  test("carries the goal, the drivable controls and the loop history", () => {
    const built = JevBrowserSnapshot.step("Find a flight to London", entries, {
      url: "https://flights.test/",
      title: "Flights",
      history: ["click e2"],
    })
    expect(built.observed.url).toBe("https://flights.test/")
    expect(built.observed.elements.map((element) => element.label)).toEqual([
      "Where from?",
      "Where to?",
      "Search",
      "Privacy",
    ])
    expect(built.observed.recent_actions).toEqual(["click e2"])
  })
})