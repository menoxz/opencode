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

  test("uses a compact core fallback without exposing the complete catalog", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: [tool("read", "Read files"), tool("inspect_batch", "Batch reads"), ...Array.from({ length: 40 }, (_, i) => tool(`other_${i}`, `Other ${i}`))],
    }
    const selected = ToolCatalog.selectTools(catalog, "unknown business symbol foobar", {
      enabled: true, threshold: 10, maxTools: 6, core: ["read", "inspect_batch"], fallback: "core", requireCoverage: false,
    })
    expect(selected.mode).toBe("jit")
    expect(selected.reason).toBe("no-confident-match-core")
    expect(selected.tools.map((item) => item.id)).toEqual(["read", "inspect_batch"])
  })

  test("enforces maxTools after core, always and ranked tools are combined", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: [tool("read", "Read files"), tool("skill", "Load skills"), tool("github_issue", "Create GitHub issue"), tool("github_pr", "Create GitHub pull request"), ...Array.from({ length: 40 }, (_, i) => tool(`other_${i}`, `Other ${i}`))],
    }
    const selected = ToolCatalog.selectTools(catalog, "github issue pull request", {
      enabled: true, threshold: 10, maxTools: 4, core: ["read"], always: ["skill"], requireCoverage: false,
    })
    expect(selected.mode).toBe("jit")
    expect(selected.tools.length).toBeLessThanOrEqual(4)
    expect(selected.tools.map((item) => item.id)).toEqual(expect.arrayContaining(["read", "skill"]))
  })

  test("keeps activated tools sticky until their TTL expires", () => {
    const store = new ToolCatalog.ActivationStore(100)
    store.activate("session-1", ["browser_snapshot"], 1_000)
    expect(store.get("session-1", 1_050)).toEqual(new Set(["browser_snapshot"]))
    expect(store.get("session-1", 1_101)).toEqual(new Set())
    store.activate("session-2", ["a", "b", "c"], 2_000, 2)
    expect(store.get("session-2", 2_001)).toEqual(new Set(["b", "c"]))
  })

  test("sticky always tools survive core saturation of the cap", () => {
    const catalog = {
      version: "v1",
      createdAt: Date.now(),
      tools: [tool("browser_snapshot", "Capture browser page"), ...Array.from({ length: 40 }, (_, i) => tool(`other_${i}`, `Other ${i}`))],
    }
    const core = ["read", "glob", "grep", "edit", "write", "bash", "task", "todowrite"]
    const selected = ToolCatalog.selectTools(catalog, "unknown request", {
      enabled: true, threshold: 0, maxTools: 4, core, always: ["browser_snapshot"], fallback: "core", requireCoverage: false,
    })
    expect(selected.mode).toBe("jit")
    expect(selected.tools.map((item) => item.id)).toContain("browser_snapshot")
    expect(selected.tools.length).toBeLessThanOrEqual(4)
  })

  test("ranks deferred tools without exposing their schemas", () => {
    const catalog = { version: "v1", createdAt: Date.now(), tools: [tool("browser_snapshot", "Capture browser page"), tool("ssh_exec", "Run command on remote server"), tool("github_issue", "Create GitHub issue")] }
    expect(ToolCatalog.search(catalog, "inspect browser page", 2).map((item) => item.id)).toEqual(["browser_snapshot"])
  })

  test("activates a searched tool only on the next selection", () => {
    const catalog = { version: "v1", createdAt: Date.now(), tools: [tool("read", "Read files"), tool("browser_snapshot", "Capture browser page"), ...Array.from({ length: 40 }, (_, i) => tool(`other_${i}`, `Other ${i}`))] }
    const store = new ToolCatalog.ActivationStore()
    const first = ToolCatalog.selectTools(catalog, "unknown request", { enabled: true, threshold: 0, maxTools: 2, core: ["read"], fallback: "core", requireCoverage: false })
    expect(first.tools.map((item) => item.id)).toEqual(["read"])
    const found = ToolCatalog.search(catalog, "browser page", 1).map((item) => item.id)
    store.activate("session", found)
    const second = ToolCatalog.selectTools(catalog, "unknown request", { enabled: true, threshold: 0, maxTools: 2, core: ["read"], always: [...store.get("session")], fallback: "core", requireCoverage: false })
    expect(second.tools.map((item) => item.id)).toEqual(["read", "browser_snapshot"])
  })

  test("prioritizes an exact tool id over semantically noisy descriptions", () => {
    const catalog = { version: "v1", createdAt: Date.now(), tools: [
      tool("write", "Write a file"),
      tool("mcp-terminal_ssh_config_import", "Import an SSH config file"),
      tool("web-browser_get_vscode_problems", "Read editor file problems"),
    ] }
    expect(ToolCatalog.search(catalog, "write file", 2)[0]?.id).toBe("write")
  })
})
