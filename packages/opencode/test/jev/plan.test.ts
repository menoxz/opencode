import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevContext } from "@/jev/context"
import { JevPlan } from "@/jev/plan"
import * as JevState from "@/jev/state"

const decide = (body: unknown) => {
  let hits = 0
  const client = HttpClient.make((request) => {
    hits += 1
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body)))
  })
  return { client, hits: () => hits }
}

const body = (shape: string, steps: readonly string[]) => ({
  model: "openjev-latest",
  answers: {
    shape: { type: "choice", choice: shape, probabilities: { [shape]: 0.8 }, confidence: 0.8 },
    ...Object.fromEntries(
      JevPlan.PLAN_STEPS.map((step) => [`step_${step}`, { type: "noul", noul: steps.includes(step) ? 0.9 : 0.1 }]),
    ),
  },
})

describe("JevPlan.planQuestions", () => {
  test("asks one shape choice and one necessity question per phase", () => {
    const questions = JevPlan.planQuestions("wire the prune pass")
    expect(questions.shape.type).toBe("choice")
    expect(Object.keys(questions)).toEqual(["shape", ...JevPlan.PLAN_STEPS.map((step) => `step_${step}`)])
    expect(Object.values(questions).filter((question) => question.type === "noul")).toHaveLength(JevPlan.PLAN_STEPS.length)
  })

  test("quotes the request in every question", () => {
    const prompt = "wire the prune pass"
    for (const question of Object.values(JevPlan.planQuestions(prompt))) expect(question.instructions).toContain(prompt)
  })

  test("bounds the prompt it sends", () => {
    const questions = JevPlan.planQuestions("z".repeat(JevPlan.MAX_PROMPT_CHARS + 5_000))
    expect(questions.shape.instructions).toContain("z".repeat(JevPlan.MAX_PROMPT_CHARS))
    expect(questions.shape.instructions).not.toContain("z".repeat(JevPlan.MAX_PROMPT_CHARS + 1))
  })
})

describe("JevPlan.plan", () => {
  test("keeps the phases Jev answered yes and drops the rest, in phase order", async () => {
    const { client, hits } = decide(body("change", ["commit", "edit", "verify"]))
    const plan = await Effect.runPromise(
      JevPlan.plan(client, { api_key: "test-key" }, { prompt: "fix the guard", fingerprint: "fp1" }),
    )
    expect(plan).toEqual({ fingerprint: "fp1", shape: "change", steps: ["edit", "verify", "commit"] })
    expect(hits()).toBe(1)
  })

  test("returns nothing when Jev did not pick a shape", async () => {
    const { client } = decide({ model: "openjev-latest", answers: { shape: { type: "noul", noul: 0.9 } } })
    expect(await Effect.runPromise(JevPlan.plan(client, { api_key: "test-key" }, { prompt: "hello", fingerprint: "fp2" }))).toBeUndefined()
  })

  test("plans no phase for a request that needs no tool", async () => {
    const { client } = decide(body("answer", []))
    const plan = await Effect.runPromise(
      JevPlan.plan(client, { api_key: "test-key" }, { prompt: "what is the current version", fingerprint: "fp3" }),
    )
    expect(plan).toEqual({ fingerprint: "fp3", shape: "answer", steps: [] })
  })
})

describe("JevPlan.render", () => {
  test("names the shape and the phases in order", () => {
    expect(JevPlan.render({ fingerprint: "fp", shape: "change", steps: ["edit", "verify", "commit"] })).toContain(
      "shape=change; required phases=edit -> verify -> commit",
    )
  })

  test("says none when no phase is required", () => {
    expect(JevPlan.render({ fingerprint: "fp", shape: "answer", steps: [] })).toContain("required phases=none")
  })
})

describe("jev context plan injection", () => {
  test("injects the plan checklist into the session context", () => {
    JevState.reset()
    JevState.setPlan("ses_plan", { fingerprint: "fp", shape: "change", steps: ["edit", "verify"] })
    const block = JevContext.block({ sessionID: "ses_plan" })
    expect(block).toContain("[jev plan]")
    expect(block).toContain("required phases=edit -> verify")
  })

  test("stays out of the block when no plan was drawn", () => {
    JevState.reset()
    JevState.setRoute("ses_noplan", { model: "build", complexity: 0.8, threshold: 0.38 })
    expect(JevContext.block({ sessionID: "ses_noplan" })).not.toContain("[jev plan]")
  })
})
