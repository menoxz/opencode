import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { JevComplexity } from "@/jev/complexity"
import { JevDecide } from "@/jev/decide"

const host = (respond: () => Response) => {
  const seen: string[] = []
  const client = HttpClient.make((request) => {
    seen.push(request.url)
    return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
  })
  return { client, seen }
}

const answers = (small: number, needsDecomposition: number) => ({
  model: "typesafe/jev",
  answers: {
    small: { type: "noul" as const, noul: small },
    needs_decomposition: { type: "noul" as const, noul: needsDecomposition },
  },
})

const settings = { api_key: "test-key", base_url: "http://jev.test" }

const input = (overrides: Partial<JevComplexity.Input> = {}): JevComplexity.Input => ({
  task: "refactor the three tools so the budget accounting is shared",
  fallback: "complex",
  autoPlanAt: JevComplexity.DEFAULT_AUTO_PLAN_AT,
  timeoutMs: 1_000,
  enabled: true,
  circuit: JevDecide.makeCircuit(),
  ...overrides,
})

const classify = (client: HttpClient.HttpClient, overrides: Partial<JevComplexity.Input> = {}) =>
  Effect.runPromise(JevComplexity.classify(client, settings, input(overrides)))

describe("jev.complexity questions", () => {
  test("asks two noul questions because simple and complex are adjacent candidates", () => {
    const asked = JevComplexity.questions("fix a typo")
    expect(Object.keys(asked).sort()).toEqual(["needs_decomposition", "small"])
    for (const question of Object.values(asked)) expect(question?.type).toBe("noul")
  })

  test("quotes the task and truncates a very long one", () => {
    const asked = JevComplexity.questions("x".repeat(JevComplexity.MAX_TASK_CHARS + 500))
    const question = asked.small
    expect(question?.type === "noul" ? question.instructions : "").toContain("[truncated]")
  })
})

describe("jev.complexity interpret", () => {
  test("reads the highest probability as the level", () => {
    expect(JevComplexity.interpret(answers(0.1, 0.9))).toBe("complex")
    expect(JevComplexity.interpret(answers(0.9, 0.1))).toBe("simple")
  })

  test("reports moderate when the model is undecided", () => {
    expect(JevComplexity.interpret(answers(0.2, 0.4))).toBe("moderate")
  })

  test("abstains when an answer is missing or mistyped", () => {
    expect(JevComplexity.interpret({ model: "typesafe/jev", answers: {} })).toBeUndefined()
    expect(
      JevComplexity.interpret({
        model: "typesafe/jev",
        answers: { small: { type: "choice", choice: "small", confidence: 1 } },
      }),
    ).toBeUndefined()
  })
})

describe("jev.complexity classify", () => {
  test("returns the model's verdict and reaches Jev once", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1, 0.9)))
    const outcome = await classify(client)
    expect(outcome).toMatchObject({ source: "jev", value: "complex" })
    expect(seen).toHaveLength(1)
  })

  test("opens the auto-plan gate on a task Jev calls complex", async () => {
    const { client } = host(() => Response.json(answers(0.1, 0.9)))
    expect((await classify(client)).value).toBe("complex")
  })

  test("closes the auto-plan gate on a task Jev calls small", async () => {
    const { client } = host(() => Response.json(answers(0.9, 0.1)))
    expect((await classify(client)).value).toBe("simple")
  })

  test("falls back to the deterministic classifier when Jev errors", async () => {
    const { client, seen } = host(() => new Response("boom", { status: 500 }))
    const outcome = await classify(client, { fallback: "simple" })
    expect(outcome).toMatchObject({ source: "fallback", value: "simple", reason: "error" })
    expect(seen).toHaveLength(1)
  })

  test("falls back when the endpoint hangs past the timeout", async () => {
    const client = HttpClient.make(() => Effect.never)
    const outcome = await Effect.runPromise(
      JevComplexity.classify(client, settings, input({ timeoutMs: 20, fallback: "simple" })),
    )
    expect(outcome).toMatchObject({ source: "fallback", value: "simple", reason: "timeout" })
  })

  test("makes no call when the hook is disabled", async () => {
    const { client, seen } = host(() => Response.json(answers(0.1, 0.9)))
    const outcome = await classify(client, { enabled: false, fallback: "moderate" })
    expect(outcome).toMatchObject({ source: "fallback", value: "moderate", reason: "disabled" })
    expect(seen).toHaveLength(0)
  })

  test("stops calling once the breaker is open", async () => {
    const circuit = JevDecide.makeCircuit()
    const { client, seen } = host(() => new Response("boom", { status: 500 }))
    for (let i = 0; i < JevDecideThreshold(); i++)
      await Effect.runPromise(JevComplexity.classify(client, settings, input({ circuit })))
    const outcome = await Effect.runPromise(JevComplexity.classify(client, settings, input({ circuit })))
    expect(outcome).toMatchObject({ source: "fallback", reason: "circuit-open" })
    expect(seen).toHaveLength(JevDecideThreshold())
  })
})

// Mirrors JevDecide.DEFAULT_BREAKER_THRESHOLD, which the complexity hook uses.
function JevDecideThreshold() {
  return 3
}