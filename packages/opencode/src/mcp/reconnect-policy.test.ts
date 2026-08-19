import { describe, expect, test } from "bun:test"
import { defaultMcpHealthIntervalMs, isDisconnected, shouldDisconnectAfterHealthFailures } from "./index"

describe("MCP reconnect policy", () => {
  test("uses a conservative default health interval", () => {
    expect(defaultMcpHealthIntervalMs).toBe(30_000)
  })

  test("treats an expired Streamable HTTP session as disconnected", () => {
    expect(isDisconnected(new Error("MCP error -32600: Session not found"))).toBe(true)
  })

  test("keeps a client after one transient health failure", () => {
    expect(shouldDisconnectAfterHealthFailures(1)).toBe(false)
    expect(shouldDisconnectAfterHealthFailures(2)).toBe(false)
  })

  test("disconnects after three consecutive health failures", () => {
    expect(shouldDisconnectAfterHealthFailures(3)).toBe(true)
  })
})
