import { beforeEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevHooks } from "@/jev/hooks"
import { JevNextAction } from "@/jev/next-action"
import { JevSchema } from "@/jev/schema"
import * as JevState from "@/jev/state"

const base = { api_key: "test-key", base_url: "http://jev.test" }

const host = (respond: () => Response) => {
  const seen: string[] = []
  const client = HttpClient.make((request) => {
    seen.push(request.url)
    return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
  })
  return { client, seen }
}

const reviewAnswers: JevSchema.Response = {
  model: "openjev-latest",
  answers: {
    correctness: { type: "score", score: 0.9, confidence: 0.9 },
    complexity: { type: "score", score: 0.2, confidence: 0.8 },
    security: { type: "score", score: 0.1, confidence: 0.8 },
  },
}

const mergedAnswers: JevSchema.Response = {
  model: "openjev-latest",
  answers: {
    ...reviewAnswers.answers,
    next_action: { type: "choice", choice: "verify", confidence: 0.8, probabilities: { verify: 0.8, answer: 0.2 } },
  },
}

const post = (client: HttpClient.HttpClient, settings: JevHooks.JevSettings) =>
  Effect.runPromise(
    JevHooks.post(client, settings, {
      sessionID: "ses_next_action",
      tool: "bash",
      args: { command: "bun test" },
      output: "3 pass, 0 fail",
      nextAction: { verdict: "progress", stagnant: 0, goal: "make the tests pass" },
    }),
  )

describe("next action question", () => {
  test("offers the closed option set with its meanings", () => {
    const questions = JevNextAction.nextActionQuestions({
      tool: "bash",
      verdict: "progress",
      stagnant: 1,
      summary: "3 pass",
      phase: "verify",
      steps: ["research", "implement", "verify"],
      goal: "make the tests pass",
    })
    const question = questions.next_action
    expect(question?.type).toBe("choice")
    expect(question?.type === "choice" ? Object.keys(question.criteria) : []).toEqual([...JevNextAction.ACTIONS])
    const instructions = question?.type === "choice" ? question.instructions : ""
    expect(instructions).toContain("CURRENT PHASE: verify")
    expect(instructions).toContain("STAGNATION: 1")
    expect(instructions).toContain("make the tests pass")
  })

  test("reads the chosen option and abstains on an unknown one", () => {
    expect(JevNextAction.interpret(mergedAnswers)?.action).toBe("verify")
    expect(
      JevNextAction.interpret(
        { model: "m", answers: { next_action: { type: "choice", choice: "teleport", confidence: 1 } } } satisfies JevSchema.Response,
      ),
    ).toBeUndefined()
    expect(JevNextAction.interpret({ model: "m", answers: {} })).toBeUndefined()
  })

  test("renders one guidance line", () => {
    expect(JevNextAction.render({ action: "verify", reason: JevNextAction.MEANING.verify })).toBe(
      `[jev next action] verify — ${JevNextAction.MEANING.verify}`,
    )
  })
})

describe("one round-trip per step", () => {
  beforeEach(() => JevState.reset())

  test("merges the review and the next action into a single Jev call", async () => {
    const { client, seen } = host(() => Response.json(mergedAnswers))
    const result = await post(client, { ...base, guard: { threshold: 0.5 }, review: { enabled: true }, next_action: { enabled: true } })
    expect(seen).toHaveLength(1)
    expect(result.annotation).toContain("[jev review]")
    expect(result.annotation).toContain("[jev next action] verify")
    expect(JevState.currentNextAction("ses_next_action")).toMatchObject({ tool: "bash", action: "verify" })
  })

  test("still costs one call when only the next action is enabled", async () => {
    const { client, seen } = host(() => Response.json(mergedAnswers))
    const result = await post(client, { ...base, next_action: { enabled: true } })
    expect(seen).toHaveLength(1)
    expect(result.annotation).toContain("[jev next action] verify")
    expect(result.annotation).not.toContain("[jev review]")
  })

  test("costs no call at all when both are disabled", async () => {
    const { client, seen } = host(() => Response.json(mergedAnswers))
    const result = await post(client, { ...base })
    expect(seen).toHaveLength(0)
    expect(result.annotation).toBeUndefined()
  })

  test("abstains without an annotation when Jev cannot be reached", async () => {
    const { client } = host(() => new Response("boom", { status: 500 }))
    const result = await post(client, { ...base, review: { enabled: true }, next_action: { enabled: true } })
    expect(result.annotation).toBeUndefined()
  })
})
