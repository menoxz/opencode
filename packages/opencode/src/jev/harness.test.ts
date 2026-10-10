import { describe, expect, test } from "bun:test"
import { JevHarness } from "./harness"
import { JevSchema } from "./schema"

const request = (questions: Record<string, any>): JevSchema.Request =>
  ({ state: "The agent is editing a file.", questions }) as JevSchema.Request

describe("JevHarness.render", () => {
  test("carries the state, every question id, its type and its instructions", () => {
    const text = JevHarness.render(
      request({
        a: { type: "noul", instructions: "Is this needed?", criteria: { true: "yes", false: "no" } },
        b: { type: "choice", instructions: "Which phase?", criteria: { read: "read it", edit: "edit it" } },
      }),
    )
    expect(text).toContain("The agent is editing a file.")
    expect(text).toContain("id: a")
    expect(text).toContain("type: noul")
    expect(text).toContain("Is this needed?")
    expect(text).toContain("yes means: yes")
    expect(text).toContain("options: read | edit")
    expect(text).toContain("Answer all 2 question(s) as JSON.")
  })

  test("renders structured payloads as JSON rather than [object Object]", () => {
    const text = JevHarness.render(request({ a: { type: "noul", instructions: { lines: ["x"] } } }))
    expect(text).toContain('{"lines":["x"]}')
  })
})

describe("JevHarness.parse", () => {
  const noul = request({ a: { type: "noul", instructions: "q" }, b: { type: "noul", instructions: "q" } })

  test("reads one probability per question id", () => {
    const answers = JevHarness.parse('{"answers":{"a":0.9,"b":0.1}}', noul)!
    expect(answers.a).toEqual({ type: "noul", noul: 0.9 })
    expect(answers.b).toEqual({ type: "noul", noul: 0.1 })
  })

  test("tolerates code fences, prose and nested or string values", () => {
    expect(JevHarness.parse('```json\n{"answers":{"a":1,"b":0}}\n```', noul)!.a).toEqual({ type: "noul", noul: 1 })
    expect(JevHarness.parse('Here you go: {"answers":{"a":{"noul":0.4}}}', noul)!.a).toEqual({
      type: "noul",
      noul: 0.4,
    })
    expect(JevHarness.parse('{"answers":{"a":"0.7"}}', noul)!.a).toEqual({ type: "noul", noul: 0.7 })
  })

  test("clamps out-of-range probabilities instead of inventing a verdict", () => {
    expect(JevHarness.parse('{"answers":{"a":4,"b":-2}}', noul)!.a).toEqual({ type: "noul", noul: 1 })
    expect(JevHarness.parse('{"answers":{"a":4,"b":-2}}', noul)!.b).toEqual({ type: "noul", noul: 0 })
  })

  test("accepts the bare answer table as well as an `answers` wrapper", () => {
    expect(JevHarness.parse('{"a":0.3}', noul)!.a).toEqual({ type: "noul", noul: 0.3 })
  })

  test("ignores ids the batch never asked for", () => {
    const answers = JevHarness.parse('{"answers":{"a":0.5,"zzz":0.9}}', noul)!
    expect(Object.keys(answers)).toEqual(["a"])
  })

  test("a choice answer must be one of the declared options", () => {
    const choice = request({ c: { type: "choice", instructions: "q", criteria: { read: "r", edit: "e" } } })
    expect(JevHarness.parse('{"answers":{"c":"edit"}}', choice)!.c).toEqual({
      type: "choice",
      choice: "edit",
      confidence: 1,
    })
    expect(JevHarness.parse('{"answers":{"c":"deploy"}}', choice)).toBeUndefined()
    expect(JevHarness.parse('{"answers":{"c":{"choice":"read"}}}', choice)!.c).toEqual({
      type: "choice",
      choice: "read",
      confidence: 1,
    })
  })

  test("a score answer becomes a position", () => {
    const score = request({ s: { type: "score", instructions: "q", criteria: ["low", "high"] } })
    expect(JevHarness.parse('{"answers":{"s":0.75}}', score)!.s).toEqual({
      type: "score",
      score: 0.75,
      confidence: 1,
    })
  })

  test("an unusable reply is an abstention, never a fabricated answer", () => {
    expect(JevHarness.parse("", noul)).toBeUndefined()
    expect(JevHarness.parse("I cannot answer.", noul)).toBeUndefined()
    expect(JevHarness.parse('{"answers":{}}', noul)).toBeUndefined()
    expect(JevHarness.parse('{"answers":{"a":"maybe"}}', noul)).toBeUndefined()
    expect(JevHarness.parse("{not json}", noul)).toBeUndefined()
  })
})
