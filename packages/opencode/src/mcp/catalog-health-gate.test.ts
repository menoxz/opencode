import { describe, expect, test } from "bun:test"
import { isCatalogEligible, shouldDisconnectAfterHealthFailures } from "./index"

describe("MCP catalog eligibility gate", () => {
  test("keeps a client with no recorded health failure", () => {
    expect(isCatalogEligible(0)).toBe(true)
  })

  test("removes a client from the catalog at the first health failure", () => {
    expect(isCatalogEligible(1)).toBe(false)
  })

  test("never removes a client that the transport threshold still keeps", () => {
    // The gate must be strictly stricter than shouldDisconnectAfterHealthFailures,
    // otherwise it changes resilience instead of hiding the catalogue.
    for (const failures of [1, 2])
      if (shouldDisconnectAfterHealthFailures(failures)) throw new Error("gate/disconnect thresholds must diverge")
    expect(isCatalogEligible(1)).toBe(false)
    expect(isCatalogEligible(2)).toBe(false)
    expect(shouldDisconnectAfterHealthFailures(3)).toBe(true)
  })

  test("is monotonic in the failure count and returns at zero", () => {
    // The failure counter is deleted on a successful ping and on reconnect,
    // which is what restores eligibility.
    expect([0, 1, 2, 3, 4].map((n) => isCatalogEligible(n))).toEqual([true, false, false, false, false])
  })
})
