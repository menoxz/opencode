import { describe, expect, test } from "bun:test"
import { Result, Schema } from "effect"
import { JevSchema } from "@/jev/schema"

const decodeRequest = Schema.decodeUnknownResult(JevSchema.Request)
const decodeResponse = Schema.decodeUnknownResult(JevSchema.Response)
const encodeRequest = Schema.encodeSync(JevSchema.Request)

const request = {
  state: "The host is up and the user asked to delete old build artifacts.",
  questions: [
    { id: "target", kind: "choice", prompt: "Which path should be removed?", options: ["dist", "src"] },
    { id: "risk", kind: "score", prompt: "How risky is this action?" },
    { id: "destructive", kind: "noul", prompt: "Is the action destructive?" },
  ],
} as const

describe("jev.schema", () => {
  test("decodes every typed question kind", () => {
    const result = decodeRequest(request)
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) expect(result.success.questions).toHaveLength(3)
  })

  test("keeps versioned model ids open ended", () => {
    expect(Result.isSuccess(decodeRequest({ ...request, model: "jev-1.13.0" }))).toBe(true)
  })

  test("rejects an unknown question kind", () => {
    const result = decodeRequest({ ...request, questions: [{ id: "x", kind: "essay", prompt: "?" }] })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("rejects a choice question without options", () => {
    const result = decodeRequest({ ...request, questions: [{ id: "x", kind: "choice", prompt: "?" }] })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("decodes answers with probabilities and calibrated confidence", () => {
    const result = decodeResponse({
      model: "jev-latest",
      answers: [
        { id: "target", kind: "choice", choice: "dist", probabilities: { dist: 0.9, src: 0.1 }, confidence: 0.98 },
        { id: "risk", kind: "score", score: 0.2, confidence: 0.81 },
        { id: "destructive", kind: "noul", noul: true, confidence: 0.72 },
      ],
    })
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success.answers[0].probabilities).toEqual({ dist: 0.9, src: 0.1 })
      expect(result.success.answers[2].noul).toBe(true)
    }
  })

  test("requires the calibrated confidence on every answer", () => {
    const result = decodeResponse({ model: "jev-latest", answers: [{ id: "risk", kind: "score", score: 0.2 }] })
    expect(Result.isFailure(result)).toBe(true)
  })

  test("round-trips the request through the encoder used on the wire", () => {
    expect(encodeRequest(decodeRequest(request).pipe(Result.getOrThrow))).toEqual(request)
  })
})
