import { describe, expect, test } from "bun:test"
import { JevBrowserActionSpace } from "./action-space"
import type { Element } from "./validate"

const page: Element[] = [
  { index: 1, role: "combobox", label: "Where from?", value: "", actionable: true },
  { index: 2, role: "combobox", label: "Where to?", value: "London", actionable: true },
  { index: 3, role: "button", label: "Search", actionable: true },
  { index: 4, role: "button", label: "Clear", actionable: false },
]

const GOAL = "Find one-way flights from Zurich to London for one adult in economy."

describe("JevBrowserActionSpace.space", () => {
  test("asks one operation head plus one target head per targetable operation", () => {
    const built = JevBrowserActionSpace.space(GOAL, { url: "https://x.test", elements: page })
    expect(Object.keys(built.questions)).toEqual([
      "operation",
      "CLICK_target",
      "TYPE_TEXT_target",
      "SELECT_target",
    ])
    const operation = built.questions.operation
    expect(operation?.type).toBe("choice")
    if (operation?.type !== "choice") return
    expect(Object.keys(operation.criteria)).toEqual([
      "CLICK",
      "TYPE_TEXT",
      "SELECT",
      "SCROLL",
      "WAIT",
      "DONE",
      "BLOCKED",
    ])
    expect(built.truncated).toBe(0)
  })

  test("the operation head never takes a target for DONE or SCROLL", () => {
    const built = JevBrowserActionSpace.space(GOAL, { elements: page })
    expect(built.questions.DONE_target).toBeUndefined()
    expect(built.questions.SCROLL_target).toBeUndefined()
  })

  test("a field already holding a value shows that value in its criterion", () => {
    const built = JevBrowserActionSpace.space(GOAL, { elements: page })
    const head = built.questions.CLICK_target
    if (head?.type !== "choice") throw new Error("CLICK_target must be a choice")
    expect(head.criteria["2"]).toContain("current value: London")
    expect(head.criteria["1"]).toContain("current value: (empty)")
  })

  test("an element observed as not actionable is never offered", () => {
    const built = JevBrowserActionSpace.space(GOAL, { elements: page })
    const head = built.questions.CLICK_target
    if (head?.type !== "choice") throw new Error("CLICK_target must be a choice")
    expect(Object.keys(head.criteria)).toEqual(["1", "2", "3"])
    expect(built.ids).toEqual([1, 2, 3])
  })

  test("an empty page asks the operation head alone", () => {
    const built = JevBrowserActionSpace.space(GOAL, { elements: [] })
    expect(Object.keys(built.questions)).toEqual(["operation"])
    expect(built.ids).toEqual([])
  })

  test("a page with only non-actionable controls asks the operation head alone", () => {
    const built = JevBrowserActionSpace.space(GOAL, { elements: [page[3]!] })
    expect(Object.keys(built.questions)).toEqual(["operation"])
  })

  test("the goal and the page travel in state, nothing else does", () => {
    const built = JevBrowserActionSpace.space(GOAL, {
      url: "https://x.test/flights",
      title: "Flights",
      text: "Zurich to London",
      elements: page,
      recent_actions: ["CLICK 1"],
    })
    expect(built.state.page.url).toBe("https://x.test/flights")
    expect(built.state.recent_actions).toEqual(["CLICK 1"])
    const head = built.questions.operation
    if (head?.type !== "choice") throw new Error("operation must be a choice")
    expect(JSON.stringify(head.instructions)).toContain("Zurich")
  })

  test("a long page truncates deterministically at the endpoint limit", () => {
    const many: Element[] = Array.from({ length: 300 }, (_, i) => ({
      index: i + 1,
      role: "button",
      label: `control ${i + 1}`,
      actionable: true,
    }))
    const built = JevBrowserActionSpace.space(GOAL, { elements: many })
    const head = built.questions.CLICK_target
    if (head?.type !== "choice") throw new Error("CLICK_target must be a choice")
    expect(Object.keys(head.criteria)).toHaveLength(JevBrowserActionSpace.MAX_CRITERIA)
    expect(built.truncated).toBe(300 - JevBrowserActionSpace.MAX_CRITERIA)
  })

  test("a label is collapsed to one line but keeps its punctuation", () => {
    const built = JevBrowserActionSpace.space(GOAL, {
      elements: [{ index: 1, role: "button", label: 'Say "hi"\nplease', actionable: true }],
    })
    const head = built.questions.CLICK_target
    if (head?.type !== "choice") throw new Error("CLICK_target must be a choice")
    expect(head.criteria["1"]).toBe('[1] Say "hi" please — role: button, current value: (empty)')
  })

  test("an unlabelled control still gets a readable criterion", () => {
    const built = JevBrowserActionSpace.space(GOAL, {
      elements: [{ index: 1, role: "button", label: "   ", actionable: true }],
    })
    const head = built.questions.CLICK_target
    if (head?.type !== "choice") throw new Error("CLICK_target must be a choice")
    expect(head.criteria["1"]).toBe("[1] (unlabelled) — role: button, current value: (empty)")
  })
})