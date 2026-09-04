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

export function search<T>(catalog: PreparedCatalog<T>, query: string, limit = 8) {
  if (!query.trim() || limit <= 0) return []
  const queryTokens = tokens(query)
  const exact = catalog.tools
    .map((item, index) => ({
      item,
      index,
      score: [...tokens(item.id.replaceAll("_", " "))].filter((token) => queryTokens.has(token)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
  const ranked = rankDocuments(
    query,
    catalog.tools.map((item) => ({
      id: item.id,
      content: `${item.id.replaceAll("_", " ")} ${item.description}`,
      importance: 1,
      confidence: 1,
    })),
    Math.max(limit, 1),
  )
  const rankedIDs = ranked.filter((item) => item.score > 0).map((item) => item.id)
  const semantic = rankedIDs.flatMap((id) => catalog.tools.find((item) => item.id === id) ?? [])
  return [...exact, ...semantic]
    .filter((item, index, values) => values.findIndex((other) => other.id === item.id) === index)
    .slice(0, limit)
}

export class ActivationStore {
  private entries = new Map<string, { ids: Set<string>; expiresAt: number }>()
  constructor(private readonly ttlMs = 15 * 60_000) {}
  activate(sessionID: string, ids: Iterable<string>, now = Date.now(), max = 32, ttlMs = this.ttlMs) {
    const current = this.get(sessionID, now)
    for (const id of ids) {
      current.delete(id)
      current.add(id)
    }
    while (current.size > Math.max(0, max)) current.delete(current.values().next().value!)
    this.entries.set(sessionID, { ids: current, expiresAt: now + ttlMs })
  }
  get(sessionID: string, now = Date.now()) {
    const entry = this.entries.get(sessionID)
    if (!entry || now > entry.expiresAt) {
      this.entries.delete(sessionID)
      return new Set<string>()
    }
    return new Set(entry.ids)
  }
  clear(sessionID?: string) {
    if (sessionID) this.entries.delete(sessionID)
    else this.entries.clear()
  }
}

export function selectTools<T>(
  catalog: PreparedCatalog<T>,
  query: string,
  options: {
    enabled: boolean
    threshold?: number
    maxTools?: number
    always?: readonly string[]
    core?: readonly string[]
    fallback?: "full" | "core"
    requireCoverage?: boolean
  },
): Selection<T> {
  const legacy = options.core === undefined && options.fallback === undefined && options.requireCoverage === undefined
  if (legacy) {
    const threshold = options.threshold ?? 30
    const maxTools = Math.max(options.maxTools ?? 20, CORE.size)
    if (!options.enabled) return { tools: catalog.tools, mode: "full", reason: "disabled" }
    if (catalog.tools.length <= threshold) return { tools: catalog.tools, mode: "full", reason: "small-catalog" }
    if (!query.trim()) return { tools: catalog.tools, mode: "full", reason: "empty-query" }
    const always = new Set([...CORE, ...(options.always ?? [])])
    const candidateSlots = Math.max(1, maxTools - always.size)
    const relevant = search(catalog, query, candidateSlots).map((item) => item.id)
    if (relevant.length === 0) return { tools: catalog.tools, mode: "full", reason: "no-confident-match" }
    const queryTokens = tokens(query)
    const selectedText = catalog.tools.filter((item) => relevant.includes(item.id)).map((item) => `${item.id} ${item.description}`).join(" ")
    const selectedTokens = tokens(selectedText)
    const uncovered = [...queryTokens].filter((token) => !selectedTokens.has(token))
    if (uncovered.length > 0) return { tools: catalog.tools, mode: "full", reason: "incomplete-query-coverage" }
    const ids = new Set([...always, ...relevant])
    const selected = catalog.tools.filter((item) => ids.has(item.id))
    if (selected.length >= catalog.tools.length) return { tools: catalog.tools, mode: "full", reason: "selection-equals-catalog" }
    return { tools: selected, mode: "jit", reason: "ranked" }
  }
  const threshold = options.threshold ?? 30
  const core = new Set(options.core ?? CORE)
  const always = new Set(options.always ?? [])
  const maxTools = Math.max(1, options.maxTools ?? 20)
  const available = new Set(catalog.tools.map((item) => item.id))
  // Core tools are never evicted: the lean cap guard guarantees room for core
  // plus a margin of dynamic slots, so sticky activations only compete among
  // themselves for the remaining slots (callers pass them most-recent first).
  const coreIds = [...core].filter((id) => available.has(id)).slice(0, maxTools)
  const stickyIds = [...always].filter((id) => available.has(id) && !core.has(id)).slice(0, Math.max(0, maxTools - coreIds.length))
  const required = [...coreIds, ...stickyIds]
  const compact = (ids: Iterable<string>) => {
    const selected = new Set([...ids].filter((id) => available.has(id)).slice(0, maxTools))
    return catalog.tools.filter((item) => selected.has(item.id))
  }
  if (!options.enabled) return { tools: catalog.tools, mode: "full", reason: "disabled" }
  if (catalog.tools.length <= threshold) return { tools: catalog.tools, mode: "full", reason: "small-catalog" }
  if (!query.trim()) {
    if (options.fallback === "core") return { tools: compact(required), mode: "jit", reason: "empty-query-core" }
    return { tools: catalog.tools, mode: "full", reason: "empty-query" }
  }

  const candidateSlots = Math.max(0, maxTools - required.length)
  const relevant = search(catalog, query, candidateSlots).map((item) => item.id)
  if (relevant.length === 0) {
    if (options.fallback === "core") return { tools: compact(required), mode: "jit", reason: "no-confident-match-core" }
    return { tools: catalog.tools, mode: "full", reason: "no-confident-match" }
  }

  if (options.requireCoverage !== false) {
    const queryTokens = tokens(query)
    const selectedText = catalog.tools
      .filter((item) => relevant.includes(item.id))
      .map((item) => `${item.id} ${item.description}`)
      .join(" ")
    const selectedTokens = tokens(selectedText)
    const uncovered = [...queryTokens].filter((token) => !selectedTokens.has(token))
    if (uncovered.length > 0)
      return { tools: catalog.tools, mode: "full", reason: "incomplete-query-coverage" }
  }

  const ids = [...required, ...relevant].filter((id, index, values) => values.indexOf(id) === index)
  const selected = compact(ids)
  if (selected.length >= catalog.tools.length)
    return { tools: catalog.tools, mode: "full", reason: "selection-equals-catalog" }
  return { tools: selected, mode: "jit", reason: "ranked" }
}

export const defaults = { core: CORE }

export * as ToolCatalog from "./tool-catalog"
