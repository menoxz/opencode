import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevSkills } from "./skills"
import { JevTools } from "./tools"
import { makeCircuit } from "./decide"

/**
 * The selectors sit on the critical path of a step: the system prompt and the
 * tool catalogue wait for them, so an endpoint that accepts the connection and
 * never answers must cost one bounded wait, and then nothing at all.
 *
 * Regression: on a live install a failing skill selection parked a step for
 * 285 s with one core pegged and no log line — the session looked frozen and the
 * interrupt key reached nothing, because the call was unbounded.
 */

/** A client that accepts the request and never answers. */
function hanging(onCall?: () => void) {
  return HttpClient.make(() => {
    onCall?.()
    return Effect.never
  })
}

describe("JevSkills.select is bounded", () => {
  test("a selector that never answers yields the deterministic fallback, fast", async () => {
    const started = Date.now()
    const chosen = await Effect.runPromise(
      JevSkills.select(hanging(), undefined, {
        prompt: "build a process flow",
        skills: [
          { name: "bpmn", description: "BPMN cartography" },
          { name: "xlsx", description: "spreadsheets" },
        ],
        timeoutMs: 50,
        circuit: makeCircuit(),
      }),
    )
    const elapsed = Date.now() - started
    expect(chosen).toBeUndefined()
    expect(elapsed).toBeLessThan(1_000)
  })

  test("the breaker stops calling an endpoint that keeps failing", async () => {
    let calls = 0
    const client = hanging(() => calls++)
    const options = {
      prompt: "build a process flow",
      skills: [{ name: "bpmn", description: "BPMN cartography" }],
      timeoutMs: 20,
      circuit: makeCircuit(),
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await Effect.runPromise(JevSkills.select(client, undefined, options))).toBeUndefined()
    }
    const before = calls
    expect(await Effect.runPromise(JevSkills.select(client, undefined, options))).toBeUndefined()
    // The breaker is open, so the fourth attempt spends no round-trip at all.
    expect(calls).toBe(before)
  })
})

describe("JevTools.select is bounded", () => {
  test("a selector that never answers yields the lexical fallback, fast", async () => {
    const started = Date.now()
    const chosen = await Effect.runPromise(
      JevTools.select(hanging(), undefined, {
        query: "read a file",
        tools: [{ id: "read", description: "read a file" }],
        timeoutMs: 50,
        circuit: makeCircuit(),
      }),
    )
    expect(chosen).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})
