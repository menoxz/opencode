import { rankDocuments } from "@/memory/search"
import { Effect } from "effect"
export type PreparedTool<T = unknown> = {
  readonly id: string
  readonly description: string
  readonly value: T
  // Optional retrieval metadata. `id` alone cannot tell a local tool from an
  // MCP one, nor which server owns it, so browsing by source/server needs it
  // explicitly rather than guessing from the name.
  readonly source?: "local" | "mcp"
  readonly server?: string
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

// Identity keys must be normalized the same way on both sides of a lookup.
// The historical code rewrote "_" only in the indexed id, so an exact
// "browser_snapshot" query could miss the very tool it named, and "-"/"_"
// spelling drift had no deterministic fallback.
const identityKey = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "_")

// Query tokens split on "_"/"-" so a compound catalog id matches its words.
// `tokens` keeps them whole, which is what the still-present coverage check
// in `selectTools` expects.
const searchTokens = (value: string) => tokens(value.replaceAll("_", " ").replaceAll("-", " "))

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

export type MatchReason = "exact_id" | "normalized_id" | "id_token" | "lexical"

export type RankedMatch<T = unknown> = {
  readonly tool: PreparedTool<T>
  readonly reason: MatchReason
  readonly score: number
}

const REASON_PRIORITY: Record<MatchReason, number> = {
  exact_id: 3,
  normalized_id: 2,
  id_token: 1,
  lexical: 0,
}

// Retrieval is ordered by match strength before lexical score: an exact
// identifier must never lose to a noisier description match, and ties break on
// the id rather than the registration order, so a catalog reshuffle cannot
// change the winner.
export function rankMatches<T>(catalog: PreparedCatalog<T>, query: string, limit = 8): RankedMatch<T>[] {
  if (!query.trim() || limit <= 0) return []
  const queryTokens = searchTokens(query)
  const needle = identityKey(query)
  const scored = rankDocuments(
    query,
    catalog.tools.map((item) => ({
      id: item.id,
      content: `${item.id.replaceAll("_", " ")} ${item.description}`,
      importance: 1,
      confidence: 1,
    })),
    catalog.tools.length,
  )
  const lexicalScore = new Map(scored.map((item) => [item.id, item.score]))
  const ranked: (RankedMatch<T> & { priority: number })[] = []
  for (const item of catalog.tools) {
    const overlap = [...searchTokens(item.id)].filter((token) => queryTokens.has(token)).length
    const lexical = lexicalScore.get(item.id) ?? 0
    const reason: MatchReason | undefined =
      item.id === query
        ? "exact_id"
        : identityKey(item.id) === needle
          ? "normalized_id"
          : overlap > 0
            ? "id_token"
            : lexical > 0
              ? "lexical"
              : undefined
    if (!reason) continue
    ranked.push({ tool: item, reason, score: overlap * 10 + lexical, priority: REASON_PRIORITY[reason] })
  }
  return ranked
    .sort((a, b) => b.priority - a.priority || b.score - a.score || a.tool.id.localeCompare(b.tool.id))
    .slice(0, limit)
    .map((entry) => ({ tool: entry.tool, reason: entry.reason, score: entry.score }))
}

export function search<T>(catalog: PreparedCatalog<T>, query: string, limit = 8) {
  return rankMatches(catalog, query, limit).map((match) => match.tool)
}

export type ResolvedId<T = unknown> =
  | { readonly tool: PreparedTool<T>; readonly match: "exact_id" | "normalized_id" }
  | { readonly ambiguous: readonly PreparedTool<T>[] }

// Deterministic identity lookup: raw equality first, then a normalized full-id
// match accepted only when it is unambiguous. This is the guarantee lexical
// scoring cannot give — an available, authorized tool is reachable by its id.
export function resolveExact<T>(catalog: PreparedCatalog<T>, id: string): ResolvedId<T> | undefined {
  if (!id.trim()) return undefined
  const needle = identityKey(id)
  const matches = catalog.tools.filter((item) => identityKey(item.id) === needle)
  if (matches.length === 0) return undefined
  if (matches.length > 1) return { ambiguous: matches }
  const tool = matches[0]!
  return { tool, match: tool.id === id ? "exact_id" : "normalized_id" }
}

export type BrowseOptions = { source?: "local" | "mcp"; server?: string; cursor?: string; limit?: number }

// Browsing is the escape hatch when lexical search misses: every authorized
// tool is reachable by stable id order, independent of any query vocabulary.
export function browse<T>(catalog: PreparedCatalog<T>, options: BrowseOptions = {}) {
  const limit = Math.max(1, Math.min(50, options.limit ?? 20))
  const items = catalog.tools
    .filter((item) => (options.source ? item.source === options.source : true))
    .filter((item) => (options.server ? item.server === options.server : true))
    .toSorted((a, b) => a.id.localeCompare(b.id))
  const offset = options.cursor ? items.findIndex((item) => item.id === options.cursor) + 1 : 0
  const start = Math.max(0, offset)
  const tools = items.slice(start, start + limit)
  const last = tools[tools.length - 1]
  return { tools, nextCursor: last && start + tools.length < items.length ? last.id : null, total: items.length }
}

// Per session: tool id -> expiry timestamp, or null when the model actually
// used the tool and it must stay available for the rest of the session.
type ActivationEntry = Map<string, number | null>

export class ActivationStore {
  private entries = new Map<string, ActivationEntry>()
  constructor(private readonly ttlMs = 15 * 60_000) {}

  private entry(sessionID: string) {
    const existing = this.entries.get(sessionID)
    if (existing) return existing
    const created: ActivationEntry = new Map()
    this.entries.set(sessionID, created)
    return created
  }

  private prune(entry: ActivationEntry, now: number) {
    for (const [id, expiresAt] of entry) if (expiresAt !== null && now > expiresAt) entry.delete(id)
  }

  activate(sessionID: string, ids: Iterable<string>, now = Date.now(), max = 32, ttlMs = this.ttlMs) {
    const entry = this.entry(sessionID)
    for (const id of ids) {
      if (entry.get(id) === null) continue
      entry.delete(id)
      entry.set(id, now + ttlMs)
    }
    this.prune(entry, now)
    // `max` already accounts for the batch just added, so dropping the oldest
    // entries first never evicts a tool the model just asked for.
    while (entry.size > Math.max(0, max)) entry.delete(entry.keys().next().value!)
  }

  // Called after a tool executes: a tool the model really used is not a bad
  // retrieval, so it graduates from the TTL window to session residency.
  promote(sessionID: string, id: string) {
    const entry = this.entries.get(sessionID)
    if (!entry || !entry.has(id)) return
    entry.delete(id)
    entry.set(id, null)
  }

  get(sessionID: string, now = Date.now()) {
    const entry = this.entries.get(sessionID)
    if (!entry) return new Set<string>()
    this.prune(entry, now)
    if (entry.size === 0) {
      this.entries.delete(sessionID)
      return new Set<string>()
    }
    return new Set(entry.keys())
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
