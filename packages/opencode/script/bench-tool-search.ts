// Reproducible retrieval probe for the lean tool catalog.
//
// Run: bun run script/bench-tool-search.ts   (from packages/opencode)
//
// It is a regression signal for ranking changes, not a production metric: the
// corpus is small and curated, so it proves the guarantee and exposes the
// lexical ceiling rather than estimating real-world accuracy.

import { ToolCatalog, type PreparedTool } from "../src/session/tool-catalog"

export type BenchKind = "identity" | "lexical" | "paraphrase"

export type BenchCase = { readonly query: string; readonly expected: string; readonly kind: BenchKind }

export const benchmarkCatalog: PreparedTool[] = (
  [
    ["read", "Read a local file"],
    ["write", "Write a file to disk"],
    ["glob", "Find files by pattern"],
    ["grep", "Search file contents with a regular expression"],
    ["inspect_batch", "Run several read-only inspections in one call"],
    ["mcp-terminal_command_run", "Run a shell command in a terminal"],
    ["mcp-terminal_ssh_run", "Run a command on a remote host over SSH"],
    ["web-browser_browser_use", "Interact with a web page: click, type, navigate"],
    ["web-browser_take_screenshot", "Capture a screenshot of the page"],
    ["llm-memory-tool_memory_retrieve", "Retrieve relevant memories as context"],
    ["llm-memory-tool_memory_store", "Store a new piece of knowledge in project memory"],
    ["developer-tools_port_check", "Check whether a TCP port is open"],
    ["mobile-mcp_tap", "Tap a coordinate on a mobile device screen"],
    ["secret-vault_get_secret", "Read a secret value from the vault"],
  ] as const
).map(([id, description]) => ({ id, description, value: {} }))

export const benchmarkCases: BenchCase[] = [
  // Identity: the query is the exact tool id. Must be 100% at rank 1.
  { query: "read", expected: "read", kind: "identity" },
  { query: "grep", expected: "grep", kind: "identity" },
  { query: "inspect_batch", expected: "inspect_batch", kind: "identity" },
  { query: "mcp-terminal_command_run", expected: "mcp-terminal_command_run", kind: "identity" },
  { query: "web-browser_browser_use", expected: "web-browser_browser_use", kind: "identity" },
  { query: "llm-memory-tool_memory_store", expected: "llm-memory-tool_memory_store", kind: "identity" },
  { query: "mobile-mcp_tap", expected: "mobile-mcp_tap", kind: "identity" },
  { query: "secret-vault_get_secret", expected: "secret-vault_get_secret", kind: "identity" },

  // Lexical: the query shares at least one content token with the right tool.
  { query: "run a shell command", expected: "mcp-terminal_command_run", kind: "lexical" },
  { query: "execute over ssh", expected: "mcp-terminal_ssh_run", kind: "lexical" },
  { query: "click and type on a page", expected: "web-browser_browser_use", kind: "lexical" },
  { query: "capture a screenshot", expected: "web-browser_take_screenshot", kind: "lexical" },
  { query: "retrieve memories", expected: "llm-memory-tool_memory_retrieve", kind: "lexical" },
  { query: "store a memory", expected: "llm-memory-tool_memory_store", kind: "lexical" },
  { query: "check tcp port", expected: "developer-tools_port_check", kind: "lexical" },
  { query: "tap the screen", expected: "mobile-mcp_tap", kind: "lexical" },
  { query: "read a secret", expected: "secret-vault_get_secret", kind: "lexical" },
  { query: "search file contents", expected: "grep", kind: "lexical" },

  // Paraphrase: no shared token. Documents the lexical ceiling, no threshold.
  { query: "photograph the webpage", expected: "web-browser_take_screenshot", kind: "paraphrase" },
  { query: "remember this fact", expected: "llm-memory-tool_memory_store", kind: "paraphrase" },
  { query: "is the port listening", expected: "developer-tools_port_check", kind: "paraphrase" },
]

const benchmarkCatalogRef = { version: "bench", createdAt: 0, tools: benchmarkCatalog }

function rate(kind: BenchKind, limit: number) {
  const cases = benchmarkCases.filter((item) => item.kind === kind)
  const hits = cases.filter((item) =>
    ToolCatalog.search(benchmarkCatalogRef, item.query, limit)
      .map((tool) => tool.id)
      .includes(item.expected),
  )
  return { kind, hits: hits.length, total: cases.length, rate: cases.length === 0 ? 0 : hits.length / cases.length }
}

export function runBenchmark() {
  const rows = [rate("identity", 1), rate("identity", 5), rate("lexical", 1), rate("lexical", 5), rate("paraphrase", 5)]
  return { catalog: benchmarkCatalogRef, rows }
}

if (import.meta.main) {
  const { rows } = runBenchmark()
  for (const row of rows) console.log(`${row.kind.padEnd(12)} @${row.kind === "identity" ? "" : ""}${row.hits}/${row.total} (${(row.rate * 100).toFixed(0)}%)`)
  const identity = rows.find((row) => row.kind === "identity")
  const lexical = rows.find((row) => row.kind === "lexical")
  console.log(`\nidentity tier: ${identity?.hits}/${identity?.total}`)
  console.log(`lexical tier:  ${lexical?.hits}/${lexical?.total}`)
}
