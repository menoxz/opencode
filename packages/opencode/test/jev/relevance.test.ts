import { beforeEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevHooks } from "@/jev/hooks"
import { JevRelevance } from "@/jev/relevance"
import * as JevState from "@/jev/state"

const settings = { relevance: { enabled: true }, api_key: "test-key", base_url: "http://jev.test" }

const observed = [{ tool: "bash", target: "git status --short", step: 1, summary: " M src/a.ts" }]

const answers = (newInformation: number) => ({
  model: "openjev-latest",
  answers: { new_information: { type: "noul", noul: newInformation } },
})

const host = (respond: () => Response) => {
  const seen: string[] = []
  const client = HttpClient.make((request) => {
    seen.push(request.url)
    return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
  })
  return { client, seen }
}

const input = {
  sessionID: "ses_relevance",
  tool: "bash",
  args: { command: "git status" },
  observed,
  request: "why is the build failing?",
}

const judge = (client: HttpClient.HttpClient, override: JevHooks.JevSettings = settings) =>
  Effect.runPromise(JevHooks.relevance(client, override, input))

describe("relevance question", () => {
  test("asks one noul question that quotes the observed surface and the candidate call", () => {
    const questions = JevRelevance.relevanceQuestions({ tool: "bash", args: "git status", observed, request: "fix it" })
    const question = questions.new_information
    expect(question?.type).toBe("noul")
    expect(question?.type === "noul" ? question.instructions : "").toContain("git status --short")
    expect(question?.type === "noul" ? question.instructions : "").toContain("git status")
    expect(question?.criteria).toBeDefined()
  })

  test("bounds the quoted surface", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      tool: "read",
      target: `src/file-${index}.ts`,
      step: index,
      summary: "x".repeat(40),
    }))
    expect(JevRelevance.observedSurface(many).length).toBeLessThanOrEqual(JevRelevance.MAX_SURFACE_CHARS + 1)
  })
})

describe("relevance thresholds", () => {
  test("classifies at or below the redundant threshold", () => {
    expect(JevRelevance.assess(0.1).verdict).toBe("redundant")
    expect(JevRelevance.assess(JevRelevance.DEFAULT_REDUNDANT_AT).verdict).toBe("redundant")
  })

  test("classifies the doubtful band between the thresholds", () => {
    expect(JevRelevance.assess(0.4).verdict).toBe("ambiguous")
  })

  test("classifies at or above the ambiguous threshold as useful", () => {
    expect(JevRelevance.assess(0.9).verdict).toBe("useful")
  })

  test("abstains when the answer is missing or mistyped", () => {
    expect(JevRelevance.interpret({ model: "openjev-latest", answers: {} })).toBeUndefined()
    expect(
      JevRelevance.interpret({ model: "openjev-latest", answers: { new_information: { type: "noul", noul: 0.2 } } })?.verdict,
    ).toBe("redundant")
  })
})

describe("relevance hook", () => {
  beforeEach(() => JevState.reset())

  test("returns a verdict and reaches Jev once", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1)))
    const first = await judge(client)
    expect(first).toMatchObject({ verdict: "redundant", cached: false })
    expect(seen).toHaveLength(1)
  })

  test("reuses the verdict of an identical judgement", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1)))
    await judge(client)
    const second = await judge(client)
    expect(second).toMatchObject({ verdict: "redundant", cached: true })
    expect(seen).toHaveLength(1)
  })

  test("asks again when the observed surface changed", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1)))
    await judge(client)
    await Effect.runPromise(
      JevHooks.relevance(client, settings, { ...input, observed: [...observed, { tool: "read", target: "b.ts", step: 2, summary: "y" }] }),
    )
    expect(seen).toHaveLength(2)
  })

  test("does nothing when the section is disabled", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1)))
    expect(await judge(client, { api_key: "test-key" })).toBeUndefined()
    expect(seen).toHaveLength(0)
  })

  test("abstains when Jev cannot be reached", async () => {
    const { client } = host(() => new Response("boom", { status: 500 }))
    expect(await judge(client)).toBeUndefined()
  })
})
