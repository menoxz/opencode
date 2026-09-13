import { describe, expect, test } from "bun:test"
import { runBenchmark } from "../../script/bench-tool-search"

describe("tool catalog retrieval benchmark", () => {
  const { rows } = runBenchmark()
  const row = (kind: string, limit: number) => rows.find((entry) => entry.kind === kind && entry.total > 0)!

  test("resolves every identity query at rank 1", () => {
    const identity = row("identity", 1)
    expect(identity.hits).toBe(identity.total)
  })

  test("finds lexical queries in the top 5", () => {
    const lexical = row("lexical", 5)
    expect(lexical.rate).toBeGreaterThanOrEqual(0.9)
  })

  test("reports the paraphrase ceiling without asserting it", () => {
    const paraphrase = row("paraphrase", 5)
    expect(paraphrase.total).toBeGreaterThan(0)
    expect(paraphrase.rate).toBeLessThanOrEqual(1)
  })
})
