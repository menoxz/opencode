import { describe, expect, test } from "bun:test"
import { aggregateAgentMetrics } from "./session-info"

describe("session agent metrics", () => {
  test("aggregates child cost and tokens by agent", () => {
    const result = aggregateAgentMetrics([
      { agent: "qa", cost: 3, tokens: { input: 10, output: 2, reasoning: 1, cache: { read: 20, write: 0 } } },
      { agent: "qa", cost: 2, tokens: { input: 5, output: 1, reasoning: 0, cache: { read: 10, write: 0 } } },
      { agent: "security", cost: 1, tokens: { input: 4, output: 1, reasoning: 2, cache: { read: 3, write: 0 } } },
    ] as any)
    expect(result.qa).toEqual({ sessions: 2, cost: 5, input: 15, output: 3, reasoning: 1, cacheRead: 30, cacheWrite: 0 })
    expect(result.security.sessions).toBe(1)
  })
})
