import { rankDocuments } from "@/memory/search"
import { Effect } from "effect"
export type PreparedTool<T = unknown> = {
  readonly id: string
  readonly description: string
  readonly value: T
}

export type PreparedCatalog<T = unknown> = {
  readonly version: string
  readonly createdAt: number
  readonly tools: readonly PreparedTool<T>[]
}

export type Selection<T = unknown> = {
  readonly tools: readonly PreparedTool<T>[]
  readonly mode: "full" | "jit"
  readonly reason: string
}

const CORE = new Set([
  "read",
  "glob",
  "grep",
  "apply_patch",
  "edit",
  "write",
  "bash",
  "task",
  "todowrite",
  "question",
  "skill",
])

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "create",
  "de",
  "des",
  "du",
  "et",
  "faire",
  "for",
  "in",
  "la",
  "le",
  "les",
  "of",
  "open",
  "pour",
  "the",
  "to",
  "un",
  "une",
])

const tokens = (value: string) =>
  new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_-]{2,}/gu)
      ?.filter((token) => !STOPWORDS.has(token)) ?? [],
  )

const cache = new WeakMap<object, Map<string, PreparedCatalog>>()

export function getPrepared(
  owner: object,
  version: string,
  build: () => readonly PreparedTool[],
  ttlMs = 30_000,
): { catalog: PreparedCatalog; hit: boolean } {
  const now = Date.now()
  const entries = cache.get(owner) ?? new Map<string, PreparedCatalog>()
  cache.set(owner, entries)
  const cached = entries.get(version)
  if (cached && now - cached.createdAt < ttlMs) return { catalog: cached, hit: true }

  const catalog = { version, createdAt: now, tools: build() } satisfies PreparedCatalog
  entries.clear()
  entries.set(version, catalog)
  return { catalog, hit: false }
}

export function getPreparedEffect<R, E, T>(
  owner: object,
  version: string,
  build: Effect.Effect<readonly PreparedTool<T>[], E, R>,
  ttlMs = 30_000,
): Effect.Effect<{ catalog: PreparedCatalog<T>; hit: boolean }, E, R> {
  return Effect.gen(function* () {
    const now = Date.now()
    const entries = cache.get(owner) ?? new Map<string, PreparedCatalog>()
    cache.set(owner, entries)
    const cached = entries.get(version) as PreparedCatalog<T> | undefined
    if (cached && now - cached.createdAt < ttlMs) return { catalog: cached, hit: true }
    const tools = yield* build
    const catalog = { version, createdAt: now, tools } satisfies PreparedCatalog<T>
    entries.clear()
    entries.set(version, catalog)
    return { catalog, hit: false }
  })
}

export function invalidate(owner?: object) {
  if (owner) cache.delete(owner)
}

export function selectTools<T>(
  catalog: PreparedCatalog<T>,
  query: string,
  options: { enabled: boolean; threshold?: number; maxTools?: number; always?: readonly string[] },
): Selection<T> {
  const threshold = options.threshold ?? 30
  const maxTools = Math.max(options.maxTools ?? 20, CORE.size)
  if (!options.enabled) return { tools: catalog.tools, mode: "full", reason: "disabled" }
  if (catalog.tools.length <= threshold) return { tools: catalog.tools, mode: "full", reason: "small-catalog" }
  if (!query.trim()) return { tools: catalog.tools, mode: "full", reason: "empty-query" }

  const always = new Set([...CORE, ...(options.always ?? [])])
  const candidateSlots = Math.max(1, maxTools - always.size)
  const ranked = rankDocuments(
    query,
    catalog.tools.map((item) => ({
      id: item.id,
      content: `${item.id.replaceAll("_", " ")} ${item.description}`,
      importance: 1,
      confidence: 1,
    })),
    candidateSlots,
  )
  const relevant = ranked.filter((item) => item.score > 0).map((item) => item.id)
  // No lexical evidence is deliberately a full-catalog fallback. This makes
  // JIT a latency optimization, never a reason to hide every unfamiliar tool.
  if (relevant.length === 0) return { tools: catalog.tools, mode: "full", reason: "no-confident-match" }

  const queryTokens = tokens(query)
  const selectedText = catalog.tools
    .filter((item) => relevant.includes(item.id))
    .map((item) => `${item.id} ${item.description}`)
    .join(" ")
  const selectedTokens = tokens(selectedText)
  const uncovered = [...queryTokens].filter((token) => !selectedTokens.has(token))
  // Conservative coverage gate: without provider-native deferred loading,
  // every meaningful user term must be represented by a selected tool.
  if (uncovered.length > 0)
    return { tools: catalog.tools, mode: "full", reason: "incomplete-query-coverage" }

  const ids = new Set([...always, ...relevant])
  const selected = catalog.tools.filter((item) => ids.has(item.id))
  if (selected.length >= catalog.tools.length)
    return { tools: catalog.tools, mode: "full", reason: "selection-equals-catalog" }
  return { tools: selected, mode: "jit", reason: "ranked" }
}

export const defaults = { core: CORE }

export * as ToolCatalog from "./tool-catalog"
