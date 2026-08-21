import { describe, expect, test } from "bun:test"
import { validateNetworkAuthentication } from "../../src/cli/network"

describe("network authentication policy", () => {
  test("allows loopback bindings without a password", () => {
    for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
      expect(() => validateNetworkAuthentication(hostname)).not.toThrow()
    }
  })

  test("rejects exposed bindings without a password", () => {
    for (const hostname of ["0.0.0.0", "192.168.1.10", "server.internal"]) {
      expect(() => validateNetworkAuthentication(hostname)).toThrow("OPENCODE_SERVER_PASSWORD")
    }
  })

  test("allows exposed bindings with a password", () => {
    expect(() => validateNetworkAuthentication("0.0.0.0", "secret")).not.toThrow()
  })
})
