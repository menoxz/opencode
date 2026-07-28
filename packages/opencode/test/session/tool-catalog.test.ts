import { describe, expect, test } from "bun:test"
import { ToolCatalog, type PreparedTool } from "../../src/session/tool-catalog"

const tool = (id: string, description: string): PreparedTool => ({ id, description, value: {} })

describe("session tool hot-path catalog", () => {
  test("reuses a prepared version and invalidates explicitly", () => {
    const owner = {}
    let builds = 0
    const build = () => {
      builds++
      return [tool("read", "Read files")]
    }
    expect(ToolCatalog.getPrepared(owner, "v1", build).hit).toBe(false)
    expect(ToolCatalog.getPrepared(owner, "v1", build).hit).toBe(true)
    expect(builds).toBe(1)
    ToolCatalog.invalidate(owner)
    expect(ToolCatalog.getPrepared(owner, "v1", build).hit).toBe(false)
    expect(builds).toBe(2)
  })

  test("selects relevant tools while preserving core tools", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: [
        tool("read", "Read a local file"),
        tool("github_create_issue", "Create an issue in a GitHub repository"),
        ...Array.from({ length: 40 }, (_, index) => tool(`other_${index}`, `Unrelated capability ${index}`)),
      ],
    }
    const selected = ToolCatalog.selectTools(catalog, "open a github issue", { enabled: true, threshold: 10, maxTools: 12 })
    expect(selected.mode).toBe("jit")
    expect(selected.tools.map((item) => item.id)).toContain("github_create_issue")
    expect(selected.tools.map((item) => item.id)).toContain("read")
    expect(selected.tools.length).toBeLessThan(catalog.tools.length)
  })

  test("falls back to the complete catalog without confident matches", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: Array.from({ length: 35 }, (_, index) => tool(`tool_${index}`, `Capability ${index}`)),
    }
    const selected = ToolCatalog.selectTools(catalog, "zzzz-unseen-intent", { enabled: true, threshold: 10 })
    expect(selected.mode).toBe("full")
    expect(selected.reason).toBe("no-confident-match")
    expect(selected.tools).toHaveLength(35)
  })

  test("falls back when a multi-intent query is only partially covered", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: [
        tool("github_issue", "Create a GitHub issue"),
        ...Array.from({ length: 35 }, (_, index) => tool(`tool_${index}`, `Capability ${index}`)),
      ],
    }
    const selected = ToolCatalog.selectTools(catalog, "create github issue and deploy production", {
      enabled: true,
      threshold: 10,
    })
    expect(selected.mode).toBe("full")
    expect(selected.reason).toBe("incomplete-query-coverage")
    expect(selected.tools).toHaveLength(catalog.tools.length)
  })
})
