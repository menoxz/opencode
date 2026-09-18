import { describe, expect, test } from "bun:test"
import {
  defaultMcpHealthIntervalMs,
  isDisconnected,
  mcpUnavailableMessage,
  shouldDisconnectAfterHealthFailures,
} from "./index"

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

  test("promises a background reconnect only when the health loop can deliver it", () => {
    const armed = mcpUnavailableMessage("llm-memory-tool", "memory_store", true, false)
    expect(armed).toContain("reconnects automatically")

    const disabled = mcpUnavailableMessage("llm-memory-tool", "memory_store", false, false)
    expect(disabled).not.toContain("reconnects automatically")
    expect(disabled).toContain("mcp_autoreconnect=false")
    expect(disabled).toContain("mcp reload")
  })

  test("keeps server and tool names in the dropped-mid-call branch", () => {
    const dropped = mcpUnavailableMessage("secret-vault", "get_secret", false, true)
    expect(dropped).toContain("secret-vault")
    expect(dropped).toContain("get_secret")
    expect(dropped).toContain("dropped mid-call")
  })
})
