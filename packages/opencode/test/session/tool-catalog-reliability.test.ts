import { describe, expect, test } from "bun:test"
import { ToolCatalog, type PreparedTool } from "../../src/session/tool-catalog"

const tool = (id: string, description: string, extra: Partial<PreparedTool> = {}): PreparedTool => ({
  id,
  description,
  value: {},
  ...extra,
})
const catalog = (...tools: PreparedTool[]) => ({ version: "v1", createdAt: 0, tools })

describe("tool catalog retrieval reliability", () => {
  test("resolves an exact underscored id that lexical scoring misses", () => {
    const c = catalog(tool("browser_snapshot", "Capture browser page"), tool("ssh_exec", "Run command on remote server"))
    expect(ToolCatalog.search(c, "browser_snapshot", 3).map((item) => item.id)).toEqual(["browser_snapshot"])
  })

  test("prefers the exact id over an earlier longer id and is order independent", () => {
    const a = catalog(tool("write_file", ""), tool("write", ""))
    const b = catalog(tool("write", ""), tool("write_file", ""))
    expect(ToolCatalog.resolveExact(a, "write")).toEqual({ tool: a.tools[1]!, match: "exact_id" })
    expect(ToolCatalog.search(a, "write", 1)[0]?.id).toBe("write")
    expect(ToolCatalog.search(b, "write", 1)[0]?.id).toBe("write")
  })

  test("normalizes hyphen/underscore and case for identity lookups", () => {
    const c = catalog(tool("mcp-terminal_command_run", "Run a shell command"))
    const resolved = ToolCatalog.resolveExact(c, "MCP-Terminal_command_run")
    expect(resolved && "tool" in resolved ? resolved.match : undefined).toBe("normalized_id")
    expect(ToolCatalog.resolveExact(c, "missing")).toBeUndefined()
    expect(ToolCatalog.resolveExact(c, "   ")).toBeUndefined()
  })

  test("reports an ambiguous normalized id instead of guessing", () => {
    const c = catalog(tool("a_b", "first"), tool("a-b", "second"))
    const resolved = ToolCatalog.resolveExact(c, "a_b")
    if (!resolved || !("ambiguous" in resolved)) throw new Error("expected an ambiguous resolution")
    expect(resolved.ambiguous.map((item) => item.id)).toEqual(["a_b", "a-b"])
  })

  test("keeps an exact id above a noisier description match", () => {
    const c = catalog(
      tool("write", "Write a file"),
      tool("mcp-terminal_ssh_config_import", "Import an SSH config file"),
      tool("web-browser_get_vscode_problems", "Read editor file problems"),
    )
    expect(ToolCatalog.search(c, "write file", 2)[0]?.id).toBe("write")
  })

  test("browses every authorized tool once, across pages", () => {
    const c = catalog(
      ...Array.from({ length: 25 }, (_, index) => tool(`tool_${String(index).padStart(2, "0")}`, `Capability ${index}`)),
    )
    const first = ToolCatalog.browse(c, { limit: 10 })
    const second = ToolCatalog.browse(c, { limit: 10, cursor: first.nextCursor ?? undefined })
    const third = ToolCatalog.browse(c, { limit: 10, cursor: second.nextCursor ?? undefined })
    const ids = [...first.tools, ...second.tools, ...third.tools].map((item) => item.id)
    expect(ids).toHaveLength(25)
    expect(new Set(ids).size).toBe(25)
    expect(first.total).toBe(25)
    expect(third.nextCursor).toBeNull()
  })

  test("browse filters by source and server metadata", () => {
    const c = catalog(
      tool("read", "Read files", { source: "local" }),
      tool("mcp-terminal_command_run", "Run a command", { source: "mcp", server: "mcp-terminal" }),
      tool("web-browser_browser_use", "Drive a page", { source: "mcp", server: "web-browser" }),
    )
    expect(ToolCatalog.browse(c, { source: "local" }).tools.map((item) => item.id)).toEqual(["read"])
    expect(ToolCatalog.browse(c, { server: "web-browser" }).tools.map((item) => item.id)).toEqual([
      "web-browser_browser_use",
    ])
  })
})
