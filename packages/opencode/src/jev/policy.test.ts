import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevBrowserActionSpace } from "./action-space"
import { JevClient } from "./client"
import { JevBrowserPolicy } from "./policy"
import { JevBrowserValidate } from "./validate"

/**
 * The composition, and above all its refusal path.
 *
 * `run` is the only place the action space, the wire call and the validation meet.
 * What matters is that a step which could not be decided says so, with a reason,
 * and never returns a partial answer a loop might act on: without a key the call
 * cannot happen, and the layer must abstain rather than invent a target.
 */

const page = [
  { index: 1, role: "combobox", label: "Where from?", value: "", actionable: true },
  { index: 2, role: "combobox", label: "Where to?", value: "", actionable: true },
  { index: 3, role: "button", label: "Search", actionable: true },
  { index: 4, role: "button", label: "Reset", actionable: false },
]

const GOAL = "Find one-way flights from Zurich to London for one adult in economy."

const step: JevBrowserPolicy.Step = {
  goal: GOAL,
  observed: { url: "https://flights.test/search", title: "Flights", elements: page },
}

/** An HttpClient that fails the test if it is ever called. */
function forbidden() {
  return HttpClient.make(() => {
    throw new Error("no HTTP call was expected: the step must abstain before dialling")
  })
}

/**
 * Run `body` with `COMMAND_CODE_API_KEY` removed, restoring the environment
 * afterwards.
 *
 * It has to await the body. Callers hand it a `runPromise`, which is pending
 * when `body()` returns: restoring the key in a synchronous `finally` would put
 * it back before the effect under test ever read it, and a machine that has the
 * key exported then fails with `call_failed` instead of `not_configured`.
 */
async function withoutKey<A>(body: () => Promise<A>): Promise<A> {
  const previous = process.env.COMMAND_CODE_API_KEY
  delete process.env.COMMAND_CODE_API_KEY
  try {
    return await body()
  } finally {
    if (previous === undefined) delete process.env.COMMAND_CODE_API_KEY
    else process.env.COMMAND_CODE_API_KEY = previous
  }
}

describe("JevBrowserPolicy.preview", () => {
  test("builds the questions without calling anything", () => {
    const space = JevBrowserPolicy.preview(step)
    expect(Object.keys(space.questions)).toEqual(["operation", "CLICK_target", "TYPE_TEXT_target", "SELECT_target"])
    expect(space.ids).toEqual([1, 2, 3])
    expect(space.truncated).toBe(0)
  })

  test("never asks more questions than the locked endpoint accepts", () => {
    // The action space emits one head per targetable operation, so a future
    // operation nobody re-checked would silently break every step at HTTP 400.
    expect(JevBrowserPolicy.questionCount(step)).toBeLessThanOrEqual(JevClient.MAX_QUESTIONS_PER_CALL)
    const crowded = JevBrowserPolicy.questionCount({
      goal: GOAL,
      observed: { elements: Array.from({ length: 300 }, (_, i) => ({ index: i + 1, role: "button", label: `b${i + 1}`, actionable: true })) },
    })
    expect(crowded).toBeLessThanOrEqual(JevClient.MAX_QUESTIONS_PER_CALL)
  })

  test("the page travels in state, the goal travels in the questions", () => {
    const space = JevBrowserPolicy.preview(step)
    expect(space.state.page.url).toBe("https://flights.test/search")
    const head = space.questions.operation
    if (head?.type !== "choice") throw new Error("operation must be a choice")
    expect(JSON.stringify(head.instructions)).toContain("Zurich")
  })
})

describe("JevBrowserPolicy.run without a key", () => {
  test("abstains, names the reason, and never dials", async () => {
    const outcome = await withoutKey(() =>
      Effect.runPromise(Effect.exit(JevBrowserPolicy.run(forbidden(), undefined, step))),
    )

    expect(Exit.isSuccess(outcome)).toBe(true)
    if (!Exit.isSuccess(outcome)) return
    const result = outcome.value
    if (!("kind" in result) || result.kind !== "abstained")
      throw new Error(`expected an abstention, got ${JSON.stringify(result)}`)
    expect(result.reason).toBe("not_configured")
    expect(result.detail).toContain(JevClient.PROVIDER_ENV_KEY)
  })

  test("an abstention still carries the action space it would have asked about", async () => {
    const outcome = await withoutKey(() =>
      Effect.runPromise(Effect.exit(JevBrowserPolicy.run(forbidden(), { api_key: undefined }, step))),
    )
    if (!Exit.isSuccess(outcome)) throw new Error("expected success")
    const result = outcome.value
    if (!("kind" in result) || result.kind !== "abstained")
      throw new Error(`expected an abstention, got ${JSON.stringify(result)}`)
    expect(result.space.ids).toEqual([1, 2, 3])
    expect("index" in result).toBe(false)
  })
})

describe("JevBrowserActionSpace and the validator agree on head names", () => {
  test("every head the space emits is the one the validator asks for", () => {
    const space = JevBrowserPolicy.preview(step)
    for (const operation of space.operations) {
      const head = JevBrowserValidate.headFor(operation)
      if (head === undefined) {
        expect(space.questions[`${operation.id}_target`]).toBeUndefined()
      } else {
        expect(space.questions[head]).toBeDefined()
      }
    }
  })
})

describe("JevBrowserActionSpace.OPERATIONS", () => {
  test("no operation targets a control it also declares as needing no target", () => {
    for (const operation of JevBrowserActionSpace.OPERATIONS) {
      if (operation.takesTarget) continue
      expect(operation.description.length).toBeGreaterThan(0)
    }
    expect(JevBrowserActionSpace.OPERATIONS.filter((operation) => operation.takesTarget).map((o) => o.id)).toEqual([
      "CLICK",
      "TYPE_TEXT",
      "SELECT",
    ])
  })
})
