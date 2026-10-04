import { beforeEach, describe, expect, test } from "bun:test"
import {
  EnvironmentLedger,
  buildEnvironmentCapsule,
  environmentStateEnabled,
  formatAge,
  inferScope,
  interpretMcpOutcome,
  isEnvironmentTool,
  ledgerFor,
  recordToolResult,
  recordUnknownOutcome,
  resetEnvironment,
  summarizeMcpResult,
} from "./environment"

const source = { kind: "mcp" as const, name: "browser_use" }

describe("EnvironmentLedger", () => {
  let ledger: EnvironmentLedger
  beforeEach(() => {
    ledger = new EnvironmentLedger()
  })

  test("assigns monotonic ids and a per-scope revision", () => {
    const first = ledger.record({ scope: "tab:cart", source, summary: "cart", truth: "observed", at: 1_000 })
    const second = ledger.record({ scope: "tab:cart", source, summary: "checkout", truth: "observed", at: 2_000 })
    const other = ledger.record({ scope: "tab:help", source, summary: "help", truth: "observed", at: 3_000 })
    expect(first.id).toBe("obs-1")
    expect(second.id).toBe("obs-2")
    expect(first.revision).toBe(1)
    expect(second.revision).toBe(2)
    expect(other.revision).toBe(1)
  })

  test("supersedes earlier observations of the same scope only", () => {
    const stale = ledger.record({ scope: "tab:cart", source, summary: "old", truth: "observed", at: 1_000 })
    const fresh = ledger.record({ scope: "tab:cart", source, summary: "new", truth: "observed", at: 2_000 })
    const other = ledger.record({ scope: "tab:help", source, summary: "help", truth: "observed", at: 3_000 })
    expect(stale.supersededBy).toBe(fresh.id)
    expect(fresh.supersededBy).toBeUndefined()
    expect(other.supersededBy).toBeUndefined()
    expect(ledger.current("tab:cart").map((item) => item.id)).toEqual([fresh.id])
  })

  test("defaults scope and keeps the anchor lookup by id", () => {
    const observation = ledger.record({ source, summary: "anything", truth: "inferred", at: 1_000 })
    expect(observation.scope).toBe("environment")
    expect(ledger.anchor(observation.id)?.summary).toBe("anything")
    expect(ledger.anchor("obs-999")).toBeUndefined()
    ledger.reset()
    expect(ledger.list()).toHaveLength(0)
    expect(ledger.anchor(observation.id)).toBeUndefined()
  })
})

describe("tool outcome interpretation", () => {
  test("a clean MCP failure is an error, a payload is observed", () => {
    expect(interpretMcpOutcome({ isError: true })).toBe("error")
    expect(interpretMcpOutcome({ isError: false })).toBe("observed")
    expect(interpretMcpOutcome({})).toBe("observed")
  })

  test("summarizes text, image-only and error results", () => {
    expect(summarizeMcpResult({ content: [{ type: "text", text: "Filters panel is open" }] })).toBe(
      "Filters panel is open",
    )
    expect(summarizeMcpResult({ content: [{ type: "image" }] })).toBe("returned 1 image(s)")
    expect(summarizeMcpResult({ content: [] })).toBe("tool returned no textual content")
    expect(summarizeMcpResult({ isError: true, content: [{ type: "text", text: "element not found" }] })).toBe(
      "error: element not found",
    )
  })

  test("infers scope from an explicit target before the fallback", () => {
    expect(inferScope({ url: "https://shop.test/cart" }, "server")).toBe("https://shop.test/cart")
    expect(inferScope({ window: "Excel" }, "server")).toBe("Excel")
    expect(inferScope({ other: 1 }, "server")).toBe("server")
    expect(inferScope(null, "server")).toBe("server")
  })

  test("formats age into a short human unit", () => {
    expect(formatAge(500)).toBe("now")
    expect(formatAge(12_000)).toBe("12s")
    expect(formatAge(4 * 60_000)).toBe("4m")
    expect(formatAge(3 * 3_600_000)).toBe("3h")
  })
})

describe("MCP result normalization", () => {
  test("records a successful environment call with scope, source and freshness", () => {
    const ledger = new EnvironmentLedger()
    const observation = recordToolResult(ledger, {
      name: "browser_use",
      args: { url: "https://shop.test/cart" },
      at: 5_000,
      relevant: true,
      attachmentCount: 1,
      result: { content: [{ type: "text", text: "cart page with 3 items" }] },
    })
    expect(observation.scope).toBe("https://shop.test/cart")
    expect(observation.source).toEqual({ kind: "mcp", name: "browser_use" })
    expect(observation.truth).toBe("observed")
    expect(observation.at).toBe(5_000)
    expect(observation.attachmentCount).toBe(1)
    expect(observation.action).toBe("browser_use")
    expect(observation.summary).toBe("cart page with 3 items")
  })

  test("records a clean MCP error as error, not observed", () => {
    const ledger = new EnvironmentLedger()
    const observation = recordToolResult(ledger, {
      name: "desktop_click",
      args: {},
      at: 1,
      relevant: true,
      attachmentCount: 0,
      result: { isError: true, content: [{ type: "text", text: "element not found" }] },
    })
    expect(observation.truth).toBe("error")
    expect(observation.summary).toBe("error: element not found")
  })

  test("records a thrown transport error as an unknown outcome", () => {
    const ledger = new EnvironmentLedger()
    const observation = recordUnknownOutcome(ledger, {
      name: "browser_use",
      args: { tab: "checkout" },
      at: 9,
      relevant: true,
      cause: "socket closed",
    })
    expect(observation.scope).toBe("checkout")
    expect(observation.truth).toBe("unknown")
    expect(observation.summary).toContain("outcome unknown")
    expect(observation.summary).toContain("socket closed")
  })

  test("classifies environment tools versus unrelated MCP calls", () => {
    expect(isEnvironmentTool("browser_use", {})).toBe(true)
    expect(isEnvironmentTool("desktop_click", {})).toBe(true)
    expect(isEnvironmentTool("memory_retrieve", { url: "https://x" })).toBe(true)
    expect(isEnvironmentTool("memory_retrieve", { query: "hello" })).toBe(false)
  })

  test("capsule keeps environment state and anomalies, drops unrelated MCP noise", () => {
    const ledger = new EnvironmentLedger()
    recordToolResult(ledger, {
      name: "memory_retrieve",
      args: { query: "x" },
      at: 1,
      relevant: false,
      attachmentCount: 0,
      result: { content: [{ type: "text", text: "secret memory" }] },
    })
    expect(buildEnvironmentCapsule(ledger, { now: 1 })).toBe("")

    recordToolResult(ledger, {
      name: "browser_use",
      args: { url: "https://shop.test" },
      at: 2,
      relevant: true,
      attachmentCount: 0,
      result: { content: [{ type: "text", text: "home" }] },
    })
    const capsule = buildEnvironmentCapsule(ledger, { now: 2 })
    expect(capsule).toContain("browser_use")
    expect(capsule).not.toContain("secret memory")
  })
})

describe("buildEnvironmentCapsule", () => {
  test("is empty without observations", () => {
    expect(buildEnvironmentCapsule(new EnvironmentLedger())).toBe("")
  })

  test("reports current observations, freshness, staleness and the last action", () => {
    const ledger = new EnvironmentLedger()
    ledger.record({
      scope: "tab:shop",
      source,
      summary: "cart with 3 items",
      detail: { url: "https://shop.test/cart", title: "Cart" },
      truth: "observed",
      at: 100_000,
      action: "browser_use",
    })
    ledger.record({
      scope: "app:excel",
      source: { kind: "mcp", name: "desktop_click" },
      summary: "click failed: element not found",
      truth: "error",
      at: 1_000,
      action: "desktop_click",
    })
    const capsule = buildEnvironmentCapsule(ledger, { now: 112_000, freshMs: 60_000 })
    expect(capsule).toContain("<environment_state>")
    expect(capsule).toContain("</environment_state>")
    expect(capsule).toContain("[obs-1] tab:shop · rev 1 · observed · 12s")
    expect(capsule).toContain("url=https://shop.test/cart")
    expect(capsule).toContain("[obs-2] app:excel · rev 1 · error")
    expect(capsule).toContain("STALE")
    expect(capsule).toContain("last action: desktop_click → error (obs-2)")
  })

  test("excludes superseded observations from the capsule", () => {
    const ledger = new EnvironmentLedger()
    ledger.record({ scope: "tab:shop", source, summary: "cart page", truth: "observed", at: 1_000 })
    ledger.record({ scope: "tab:shop", source, summary: "payment page", truth: "observed", at: 2_000 })
    const capsule = buildEnvironmentCapsule(ledger, { now: 2_000 })
    expect(capsule).toContain("payment page")
    expect(capsule).not.toContain("cart page")
  })

  test("stays within the character budget while keeping its tags", () => {
    const ledger = new EnvironmentLedger()
    for (let index = 0; index < 20; index++) {
      ledger.record({
        scope: `tab:${index}`,
        source,
        summary: `observation ${index} with a deliberately long description that consumes characters`,
        truth: "observed",
        at: index,
      })
    }
    const capsule = buildEnvironmentCapsule(ledger, { now: 20, maxChars: 400 })
    expect(capsule.length).toBeLessThanOrEqual(400)
    expect(capsule.startsWith("<environment_state>")).toBe(true)
    expect(capsule.endsWith("</environment_state>")).toBe(true)
  })
})

describe("environmentStateEnabled", () => {
  test("agent flag wins, then config, otherwise off", () => {
    expect(environmentStateEnabled({ agentFlag: true, configFlag: false })).toBe(true)
    expect(environmentStateEnabled({ agentFlag: false, configFlag: true })).toBe(false)
    expect(environmentStateEnabled({ configFlag: true })).toBe(true)
    expect(environmentStateEnabled({})).toBe(false)
  })
})

describe("session registry", () => {
  test("isolates ledgers per session and resets by id", () => {
    resetEnvironment()
    ledgerFor("ses_a").record({ source, summary: "a", truth: "observed", at: 1 })
    ledgerFor("ses_b").record({ source, summary: "b", truth: "observed", at: 1 })
    expect(ledgerFor("ses_a").list()).toHaveLength(1)
    expect(ledgerFor("ses_b").list()).toHaveLength(1)
    resetEnvironment("ses_a")
    expect(ledgerFor("ses_a").list()).toHaveLength(0)
    expect(ledgerFor("ses_b").list()).toHaveLength(1)
    resetEnvironment()
  })
})
