import { describe, expect, test } from "bun:test"
import { Result, Schema } from "effect"
import { JevSchema } from "@/jev/schema"

const decodeRequest = Schema.decodeUnknownResult(JevSchema.Request)
const decodeResponse = Schema.decodeUnknownResult(JevSchema.Response)
const encodeRequest = Schema.encodeSync(JevSchema.Request)

const request: JevSchema.Request = {
  state: "The host is up and the user asked to delete old build artifacts.",
  questions: {
    target: {
      type: "choice",
      instructions: "Which path should be removed?",
      criteria: { dist: "Build output that can be regenerated.", src: "Hand written sources." },
    },
    risk: {
      type: "score",
      instructions: "How risky is deleting that path?",
      criteria: ["Safe and reversible.", "Recoverable with effort.", "Destructive and irreversible."],
    },
    destructive: {
      type: "noul",
      instructions: "Is the action destructive?",
      criteria: { true: "It deletes data that cannot be recovered.", false: "It only removes regenerable output." },
    },
  },
}

describe("jev.schema", () => {
  test("decodes every typed question as a map keyed by id", () => {
    const result = decodeRequest(request)
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) expect(Object.keys(result.success.questions)).toEqual(["target", "risk", "destructive"])
  })

  test("keeps versioned model ids open ended", () => {
    expect(Result.isSuccess(decodeRequest({ ...request, model: "jev-1.13.0" }))).toBe(true)
  })

  test("rejects an unknown question type", () => {
    const result = decodeRequest({
      ...request,
      questions: { x: { type: "essay", instructions: "?" } },
    })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("rejects a choice question without criteria", () => {
    const result = decodeRequest({
      ...request,
      questions: { x: { type: "choice", instructions: "?" } },
    })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("rejects a question without instructions", () => {
    const result = decodeRequest({ ...request, questions: { x: { type: "noul" } } })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("decodes a noul answer as a probability with no confidence", () => {
    const result = decodeResponse({ model: "jev-latest", answers: { destructive: { type: "noul", noul: 0.07 } } })
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) expect(result.success.answers.destructive).toEqual({ type: "noul", noul: 0.07 })
  })

  test("decodes choice and score answers with probabilities, legend and confidence", () => {
    const result = decodeResponse({
      model: "jev-latest",
      usage: { input_tokens: 210, output_tokens: 12 },
      answers: {
        target: { type: "choice", choice: "dist", probabilities: { dist: 0.9, src: 0.1 }, confidence: 0.98 },
        risk: { type: "score", score: 0.2, legend: { "0": "safe", "1": "risky" }, confidence: 0.81 },
      },
    })
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success.answers.target).toMatchObject({ probabilities: { dist: 0.9, src: 0.1 } })
      expect(result.success.answers.risk).toMatchObject({ legend: { "0": "safe", "1": "risky" } })
      expect(result.success.usage).toEqual({ input_tokens: 210, output_tokens: 12 })
    }
  })

  test("requires the calibrated confidence on choice and score answers", () => {
    const result = decodeResponse({ model: "jev-latest", answers: { risk: { type: "score", score: 0.2 } } })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("round-trips the request through the encoder used on the wire", () => {
    expect(encodeRequest(decodeRequest(request).pipe(Result.getOrThrow))).toEqual(request)
  })
})
