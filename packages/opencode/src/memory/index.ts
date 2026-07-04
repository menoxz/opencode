/**
 * Memory — Native vector memory system for opencode.
 *
 * Replaces the external `llm-memory-tool` Python MCP server with a native
 * TypeScript implementation backed by SQLite + hybrid BM25/vector search.
 *
 * Features:
 * 1. Store knowledge (facts, decisions, patterns) with auto-embedding
 * 2. Hybrid semantic + keyword search (BM25 + cosine similarity)
 * 3. Auto-consolidation (decay, prune, merge)
 * 4. Post-mortem session analysis and learning extraction
 * 5. Cross-session pattern detection
 *
 * Architecture:
 * ┌──────────┐    ┌──────────────┐    ┌────────────┐
 * │ Memory   │───▶│ Embeddings   │───▶│ AI SDK     │
 * │ Service  │    │ Service      │    │ or local   │
 * │          │    │              │    │ n-gram     │
 * │          │    └──────────────┘    └────────────┘
 * │          │    ┌──────────────┐
 * │          │───▶│ MemoryStore  │───▶ SQLite
 * │          │    │ (BM25+vec)   │
 * │          │    └──────────────┘
 * │          │    ┌──────────────┐
 * │          │───▶│ PostMortem   │───▶ Session analysis
 * │          │    └──────────────┘
 * │          │    ┌──────────────┐
 * │          │───▶│ Patterns     │───▶ Cross-session
 * │          │    └──────────────┘
 * └──────────┘
 *
 * Module shape: single-namespace directory with self-reexport at bottom.
 */

import { Effect, Context, Layer, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as MemoryStore from "./store"
import * as Embedding from "./embedding"
import * as PostMortem from "./post-mortem"
import * as Patterns from "./patterns"
import {
  hybridRank,
  assembleContextText,
  type SearchOptions,
  type HybridDocument,
  type RankWeights,
} from "./search"
import { consolidate, type ConsolidationStore } from "./consolidation"
import { extractKeywords, type Interface as EmbeddingInterface } from "./embedding"
import type { PostMortemReport } from "./post-mortem"
import type { PatternReport } from "./patterns"

const log = Log.create({ service: "memory" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Memory type discriminator. */
export const MemoryType = Schema.Union([
  Schema.Literal("semantic"),
  Schema.Literal("episodic"),
  Schema.Literal("procedural"),
  Schema.Literal("profile"),
  Schema.Literal("learning"),
  Schema.Literal("pattern"),
])
export type MemoryType = Schema.Schema.Type<typeof MemoryType>

/** A single memory entry. */
export interface MemoryEntry {
  id: string
  content: string
  memoryType: string
  tags: string[]
  importance: number
  projectId: string
  source: string
  createdAt: number
  updatedAt: number
  confidence: number
  /** True if this memory has a vector embedding stored */
  hasEmbedding: boolean
  /** Context when this memory was encoded */
  encodingContext?: string
  /** Query context associated with this memory */
  queryContext?: string
  /** Times this memory has been retrieved */
  accessCount?: number
  /** Last retrieval timestamp */
  lastAccessAt?: number
  /** Explicit user feedback: -1 downvote, 0 neutral, +1 upvote */
  feedback?: number
}

/** Search result with relevance score. */
export interface SearchResult {
  entry: MemoryEntry
  score: number
  bm25Score?: number
  vectorScore?: number
}

/** Memory system statistics. */
export interface MemoryStats {
  total: number
  byType: Record<string, number>
  averageConfidence: number
  lastConsolidated: number | null
  withEmbeddings: number
  usingAIEmbeddings: boolean
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Store a new memory entry. Auto-generates embedding. */
  readonly store: (entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "hasEmbedding">) => Effect.Effect<string>

  /** Retrieve relevant memories by hybrid semantic + keyword search. */
  readonly retrieve: (
    query: string,
    opts?: SearchOptions & { projectId?: string },
  ) => Effect.Effect<{ entries: MemoryEntry[]; contextText: string; results: SearchResult[] }>

  /** Get a single memory by ID. */
  readonly get: (id: string) => Effect.Effect<MemoryEntry | null>

  /** Soft-delete a memory (hard delete from DB). */
  readonly delete: (id: string) => Effect.Effect<boolean>

  /** List memories with pagination and filters. */
  readonly list: (opts?: {
    projectId?: string
    memoryType?: string
    minConfidence?: number
    page?: number
    pageSize?: number
  }) => Effect.Effect<{ entries: MemoryEntry[]; total: number }>

  /** Run consolidation cycle (decay, prune, merge). */
  readonly consolidate: (dryRun?: boolean) => Effect.Effect<{
    decayed: number
    pruned: number
    merged: number
    remainingBefore: number
    remainingAfter: number
    details: string[]
  }>

  /** Get memory system statistics. */
  readonly stats: () => Effect.Effect<MemoryStats>

  /** Health check. */
  readonly health: () => Effect.Effect<{ ok: boolean; version: string }>

  /** Analyze a session post-mortem and extract learnings. */
  readonly analyzeSession: (sessionId: string) => Effect.Effect<PostMortemReport>

  /** Detect cross-session patterns. */
  readonly detectPatterns: (opts?: { sinceDays?: number }) => Effect.Effect<PatternReport>

  /** Get the embedding service (for direct access if needed). */
  readonly embedding: EmbeddingInterface

  /** Record feedback on a memory (positive/negative) and adjust confidence/importance. */
  readonly feedback: (id: string, type: "positive" | "negative") => Effect.Effect<void>

  /** Record an outcome for a memory retrieved in context, so the retrieveur learns. */
  readonly recordUsage: (
    id: string,
    outcome: "useful" | "not-useful" | "neutral",
  ) => Effect.Effect<void>

  /** Generate cue variants for a memory to improve recall. */
  readonly generateCueVariants: (id: string) => Effect.Effect<string[]>

  /** Get the memory graph centered on a memory with configurable depth. */
  readonly graph: (memoryId: string, depth?: number) => Effect.Effect<{
    center: MemoryEntry | null
    nodes: MemoryEntry[]
    links: Array<{ source: string; target: string; type: string; strength: number }>
  }>

  /** Find the shortest graph path between two memories. */
  readonly graphPath: (fromId: string, toId: string) => Effect.Effect<MemoryEntry[]>

  /** Mirror: a self-reflective digest of the memory store. */
  readonly mirror: (opts?: { sinceMs?: number; topK?: number }) => Effect.Effect<MirrorReport>
}

/** A reflective snapshot of what the agent remembers. */
export interface MirrorReport {
  /** Snapshot timestamp in ms. */
  now: number
  /** Human-readable window. */
  windowMs: number
  /** Total memories in store. */
  total: number
  /** Memories created inside the window. */
  createdInWindow: number
  /** Memories updated (or accessed) inside the window. */
  touchedInWindow: number
  /** Type breakdown. */
  byType: Record<string, number>
  /** Top projects by stored memory count. */
  topProjects: Array<{ projectId: string; count: number }>
  /** Top tags across all memories. */
  topTags: Array<{ tag: string; count: number }>
  /** Most important recent memory per type. */
  highlights: Array<{
    type: string
    content: string
    importance: number
    projectId: string
    ageHours: number
  }>
  /** "State of mind" derived from dominant memory types. */
  stateOfMind: string
  /** Average confidence trend (0-1). */
  averageConfidence: number
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseRowTags(rawTags: string): string[] {
  try {
    const parsed = JSON.parse(rawTags)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((tag): tag is string => typeof tag === "string")
  } catch {
    return []
  }
}

function feedbackToScore(feedback: string | null): number {
  if (feedback === "positive") return 1
  if (feedback === "negative") return -1
  return 0
}

function rowToEntry(row: MemoryStore.MemoryRow): MemoryEntry {
  return {
    id: row.id,
    content: row.content,
    memoryType: row.memory_type,
    tags: parseRowTags(row.tags),
    importance: row.importance,
    projectId: row.project_id,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confidence: row.confidence,
    hasEmbedding: row.embedding !== null,
    encodingContext: row.encoding_context ?? undefined,
    queryContext: row.query_context ?? undefined,
    accessCount: row.access_count ?? 0,
    lastAccessAt: row.last_access_at ?? undefined,
    feedback: feedbackToScore(row.feedback),
  }
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

const MEMORY_VERSION = "2.0.0-hybrid"

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* MemoryStore.Service

    // Lazy-load sub-services to break circular module init
    const eMod = yield* Effect.promise(() => import("./embedding"))
    const ptMod = yield* Effect.promise(() => import("./patterns"))

    const embedding = yield* eMod.Service
    const patterns = yield* ptMod.Service

        // ---- store with auto-embedding ----
    const store_ = Effect.fn("Memory.store")(function* (
      entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "hasEmbedding">,
    ) {
      // Generate embedding
      const vec = yield* embedding.embed(entry.content)
      const modelName = embedding.isUsingAI ? "ai-sdk" : "local-n-gram"

      // Auto-tag: extract keywords from content if tags are empty or insufficient
      const finalTags = (entry.tags && entry.tags.length >= 2)
        ? entry.tags
        : [...new Set([...(entry.tags ?? []), ...extractKeywords(entry.content, 5)])]

      // Insert with embedding
      const id = yield* store.insert({
        content: entry.content,
        memory_type: entry.memoryType,
        tags: JSON.stringify(finalTags),
        importance: entry.importance,
        project_id: entry.projectId,
        source: entry.source,
        confidence: entry.confidence ?? 1.0,
        embedding: JSON.stringify(vec),
        embedding_model: modelName,
      })

      // Store encoding context data if provided
      if (entry.encodingContext || entry.queryContext) {
        yield* store.setEncodingData(id, entry.encodingContext ?? null, entry.queryContext ?? null)
      }

      log.info("stored memory with embedding", { id, type: entry.memoryType, dim: vec.length })
      return id
    })

    // ---- retrieve with hybrid search ----
    const retrieve = Effect.fn("Memory.retrieve")(function* (
      query: string,
      opts?: SearchOptions & { projectId?: string },
    ) {
      const topK = opts?.topK ?? 10
      const tokenBudget = opts?.tokenBudget ?? 600
      const alpha = opts?.alpha ?? 0.4
      const minScore = opts?.minScore ?? 0

      // Generate query embedding
      const queryVec = yield* embedding.embed(query)

      // Get vector search results
      const vectorResults = yield* store.searchVector(queryVec, topK * 2)
      const vectorIdSet = new Set(vectorResults.map((r) => r.row.id))

      // Get keyword search results (for docs without embeddings or for BM25 boost)
      const keywordRows = yield* store.search(query, topK * 3)

      // Merge: keyword-only rows that weren't in vector results
      const allRows = new Map<string, MemoryStore.MemoryRow>()
      for (const vr of vectorResults) allRows.set(vr.row.id, vr.row)
      for (const kr of keywordRows) allRows.set(kr.id, kr)

      const docs: HybridDocument[] = Array.from(allRows.values()).map((row) => ({
        id: row.id,
        content: row.content,
        importance: row.importance,
        confidence: row.confidence,
        embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : undefined,
        createdAt: row.created_at,
        lastAccessAt: row.last_access_at ?? undefined,
        feedback: feedbackToScore(row.feedback),
        projectId: row.project_id,
        memoryType: row.memory_type,
      }))

      // Hybrid + composite rank
      const scored = hybridRank(
        query,
        queryVec,
        docs,
        topK,
        alpha,
        minScore,
        opts?.projectId,
        undefined,
        opts?.rank,
      )

      // Apply project filter if needed
      const filtered = opts?.projectId
        ? scored.filter((s) => {
            const row = allRows.get(s.id)
            return row?.project_id === opts.projectId
          })
        : scored

      // Spreading activation boost (memory linking — Phase 0)
      // Memories strongly linked to high-scoring results get a small boost
      const LINK_BOOST_FACTOR = 0.1
      const LINK_INJECTED_BOOST_FACTOR = 0.2
      const MIN_LINK_STRENGTH = 0.3

      if (filtered && filtered.length > 0) {
        const scoredDocMap = new Map(filtered.map(d => [d.id, d]))
        const boostAmounts = new Map<string, number>()

        for (const doc of filtered) {
          const links = yield* store.getStrongLinks(doc.id, MIN_LINK_STRENGTH)
          for (const link of links) {
            // Determine which end of the link is the target
            const targetId = link.sourceMemoryId === doc.id ? link.targetMemoryId : link.sourceMemoryId
            if (scoredDocMap.has(targetId)) {
              const currentBoost = boostAmounts.get(targetId) ?? 0
              boostAmounts.set(targetId, currentBoost + link.strength * doc.score * LINK_BOOST_FACTOR)
            }
          }
        }

        // Apply boosts
        for (const [id, boost] of boostAmounts) {
          const doc = scoredDocMap.get(id)
          if (doc) {
            doc.score += boost
          }
        }

        // Re-sort
        filtered.sort((a, b) => b.score - a.score)
      }

      const entries = filtered.map((s) => {
        const row = allRows.get(s.id)!
        return rowToEntry(row)
      })

      const contextText = assembleContextText(filtered, tokenBudget)

      const results: SearchResult[] = filtered.map((s) => {
        const row = allRows.get(s.id)!
        return {
          entry: rowToEntry(row),
          score: s.score,
          bm25Score: s.bm25Score,
          vectorScore: s.vectorScore,
        }
      })

      // Phase 0 — Reconsolidation side-effects (fire and forget)
      // Record usage for each retrieved memory and link co-retrieved ones
      const now = Date.now()
      const injectedIds = new Set(
        results
          .filter(r => contextText.includes(r.entry.content.substring(0, 50)))
          .map(r => r.entry.id),
      )

      for (const result of results) {
        const isInjected = injectedIds.has(result.entry.id)
        yield* recordUsage(result.entry.id, isInjected ? "useful" : "neutral")
      }

      // Create links between co-retrieved memories
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          yield* store.createOrUpdateLink({
            sourceMemoryId: results[i].entry.id,
            targetMemoryId: results[j].entry.id,
            linkType: "co-retrieved",
          })
        }
      }

      return { entries, contextText, results }
    })

    // ---- get ----
    const get = Effect.fn("Memory.get")(function* (id: string) {
      const row = yield* store.findById(id)
      return row ? rowToEntry(row) : null
    })

    // ---- delete ----
    const delete_ = Effect.fn("Memory.delete")(function* (id: string) {
      return yield* store.deleteById(id)
    })

    // ---- list ----
    const list = Effect.fn("Memory.list")(function* (opts?: {
      projectId?: string
      memoryType?: string
      minConfidence?: number
      page?: number
      pageSize?: number
    }) {
      const page = opts?.page ?? 1
      const pageSize = opts?.pageSize ?? 10
      const offset = (page - 1) * pageSize

      const { rows, total } = yield* store.list({
        projectId: opts?.projectId,
        memoryType: opts?.memoryType,
        minConfidence: opts?.minConfidence,
        offset,
        limit: pageSize,
      })

      return {
        entries: rows.map(rowToEntry),
        total,
      }
    })

    // ---- consolidate ----
    let lastConsolidated: number | null = null

    const consolidate_ = Effect.fn("Memory.consolidate")(function* (dryRun: boolean = false) {
      const consolidationStore: ConsolidationStore = {
        getAll: () => store.getAll(),
        updateConfidence: (id, confidence) => store.updateConfidence(id, confidence),
        updateContent: (id, content) => store.updateContent(id, content),
        deleteById: (id) => store.deleteById(id),
      }

      const result = yield* consolidate(consolidationStore, dryRun)

      if (!dryRun) {
        lastConsolidated = Date.now()
        log.info("consolidation complete", {
          decayed: result.decayed,
          pruned: result.pruned,
          merged: result.merged,
          remaining: result.remainingAfter,
        })
      }

      return result
    })

    // ---- stats ----
    const stats = Effect.fn("Memory.stats")(function* () {
      const s = yield* store.stats()
      const allRows = yield* store.getAll()
      const withEmbeddings = allRows.filter((r) => r.embedding !== null).length
      return {
        total: s.total,
        byType: s.byType,
        averageConfidence: s.averageConfidence,
        lastConsolidated,
        withEmbeddings,
        usingAIEmbeddings: embedding.isUsingAI,
      } satisfies MemoryStats
    })

    // ---- health ----
    const health = Effect.fn("Memory.health")(function* () {
      try {
        yield* store.count()
        return { ok: true, version: MEMORY_VERSION }
      } catch (e) {
        log.error("memory health check failed", { error: String(e) })
        return { ok: false, version: MEMORY_VERSION }
      }
    })

    // ---- analyzeSession ----
    const analyzeSession = Effect.fnUntraced(function* (sessionId: string) {
      const pmMod = yield* Effect.promise(() => import("./post-mortem"))
      const postMortemSvc = yield* Effect.option(Effect.service(pmMod.Service)).pipe(Effect.map((o: any) => o._tag === "Some" ? o.value : null))
      if (!postMortemSvc) {
        log.warn("PostMortem service not available — skipping session analysis", { sessionId })
        return {
          summary: { sessionId, projectId: "global", taskDescription: "", duration: 0, toolsUsed: [], toolCallCount: 0, errors: [], success: true, keyDecisions: [], patternsFound: [], suggestions: [], fileChanges: [], tokenUsage: { input: 0, output: 0, total: 0, cost: 0 } },
          learnings: [],
          recommendations: [],
        }
      }
      const report = yield* postMortemSvc.analyze(sessionId)
      // Auto-store learnings
      const learnings = yield* postMortemSvc.extractLearnings(report)
      for (const learning of learnings) {
        yield* store_({
          content: learning.content,
          memoryType: learning.type === "pattern" ? "pattern"
            : learning.type === "decision" ? "semantic"
            : learning.type === "pitfall" ? "episodic"
            : "procedural",
          tags: learning.tags,
          importance: learning.confidence,
          projectId: report.summary.projectId || report.summary.sessionId,
          source: "post-mortem",
          confidence: learning.confidence,
        })
      }
      log.info("session analyzed and learnings stored", {
        sessionId,
        learningsStored: learnings.length,
      })

      // ---- Self-Improve recording (pure function, no Effect service) ----
      try {
        // Import pure function — no Effect layer dependency needed
        const siMod: typeof import("@/self-improve") = yield* Effect.promise(
          () => import("@/self-improve"),
        ) as any

        const outcome: {
          sessionId: string; taskType: string; modelId: string; success: boolean
          tokensUsed: number; toolCalls: number; errors: string[]; durationMs: number
          paramsUsed: { temperature?: number; topP?: number; maxOutputTokens?: number }
        } = {
          sessionId,
          taskType: (report.summary.taskDescription || "general").slice(0, 60),
          modelId: "unknown",
          success: report.summary.success,
          tokensUsed: report.summary.tokenUsage.total,
          toolCalls: report.summary.toolCallCount,
          errors: report.summary.errors.map((e: any) => e.message),
          durationMs: report.summary.duration || 0,
          paramsUsed: {},
        }

        const source = `self-improve/${outcome.taskType}/${outcome.modelId}`
        const existingEntries = (yield* list({ memoryType: "procedural", pageSize: 200 })).entries
        const existingProfile = siMod.storedProfileFromMemoryEntries(existingEntries, source)

        // Compute updated profile cumulatively (pure math, no external service dependency)
        const profile = siMod.updateProfile(existingProfile, outcome)

        // Persist via memory store (already available)
        yield* store_({
          content: JSON.stringify(profile),
          memoryType: "procedural",
          tags: ["self-improve", "param-profile", profile.taskType, profile.modelId],
          importance: 0.7,
          projectId: "default",
          source,
          confidence: Math.min(1, profile.samples / 10),
        })
        log.info("self-improve profile recorded", {
          sessionId,
          success: outcome.success,
          taskType: profile.taskType,
          samples: profile.samples,
        })
      } catch (e) {
        log.warn("self-improve recording skipped", { sessionId, error: String(e) })
      }

      return report
    })

    // ---- detectPatterns ----
    const detectPatterns = Effect.fn("Memory.detectPatterns")(function* (opts?: { sinceDays?: number }) {
      const report = yield* patterns.detect(opts?.sinceDays ?? 30)
      // Store important patterns
      for (const pattern of report.recurringPatterns) {
        yield* store_({
          content: `[Auto-detected pattern] ${pattern.description}`,
          memoryType: "pattern",
          tags: ["auto-detected", "pattern", ...pattern.tags],
          importance: pattern.frequency > 3 ? 0.8 : 0.5,
          projectId: "default",
          source: "pattern-detector",
          confidence: Math.min(1, pattern.frequency / 10),
        })
      }
      log.info("pattern detection complete", {
        patterns: report.recurringPatterns.length,
        suggestions: report.suggestions.length,
      })
      return report
    })

    // ---- feedback ----
    const feedback = Effect.fn("Memory.feedback")(function* (id: string, type: "positive" | "negative") {
      const entry = yield* store.findById(id)
      if (!entry) return

      yield* store.setFeedback(id, type)

      if (type === "positive") {
        const newConfidence = Math.min(1.0, (entry.confidence ?? 1.0) + 0.1)
        yield* store.updateConfidence(id, newConfidence)
      } else {
        const newConfidence = Math.max(0.1, (entry.confidence ?? 1.0) - 0.3)
        const newImportance = Math.max(0.1, entry.importance - 0.1)
        yield* store.updateConfidence(id, newConfidence)
        yield* store.updateImportance(id, newImportance)
      }
    })

    // ---- recordUsage: implicit learning loop ----
    const recordUsage = Effect.fn("Memory.recordUsage")(function* (
      id: string,
      outcome: "useful" | "not-useful" | "neutral",
    ) {
      const entry = yield* store.findById(id)
      if (!entry) return

      const now = Date.now()
      const currentConfidence = entry.confidence ?? 1.0
      const currentImportance = entry.importance ?? 0.5

      if (outcome === "useful") {
        yield* store.updateConfidence(id, Math.min(1.0, currentConfidence + 0.1))
        yield* store.updateImportance(id, Math.min(1.0, currentImportance + 0.05))
      } else if (outcome === "not-useful") {
        yield* store.updateConfidence(id, Math.max(0.1, currentConfidence - 0.2))
        yield* store.updateImportance(id, Math.max(0.1, currentImportance - 0.05))
      }

      yield* store.updateAccessStats(id, now)
      yield* store.incrementSearchCount(id)
    })

    // ---- generateCueVariants ----
    const generateCueVariants = Effect.fn("Memory.generateCueVariants")(function* (id: string) {
      const entry = yield* store.findById(id)
      if (!entry) return []

      const variants = yield* embedding.generateCueVariants(entry.content)

      if (variants.length > 0) {
        yield* store.setCueVariants(id, variants)
      }
      return variants
    })

    // ---- graph ----
    const graph = Effect.fn("Memory.graph")(function* (memoryId: string, depth: number = 1) {
      const center = yield* store.findById(memoryId)
      if (!center) return { center: null, nodes: [], links: [] }

      const linkedRows = yield* store.getLinkedMemories(memoryId, depth)
      const allLinks = yield* store.getAllLinks()

      const nodeIds = new Set(linkedRows.map(m => m.id))
      nodeIds.add(memoryId)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const relevantLinks = allLinks
        .filter(l => nodeIds.has(l.source_memory_id) && nodeIds.has(l.target_memory_id))
        .map(l => ({
          source: l.source_memory_id,
          target: l.target_memory_id,
          type: l.link_type,
          strength: l.strength,
        }))

      return {
        center: rowToEntry(center),
        nodes: linkedRows.map(rowToEntry),
        links: relevantLinks,
      }
    })

    // ---- graphPath ----
    const graphPath = Effect.fn("Memory.graphPath")(function* (fromId: string, toId: string) {
      const pathRows = yield* store.getShortestPath(fromId, toId)
      return pathRows.map(rowToEntry)
    })

    // ---- mirror: self-reflective digest ----
    const mirror = Effect.fn("Memory.mirror")(function* (
      opts?: { sinceMs?: number; topK?: number },
    ) {
      const now = Date.now()
      const windowMs = opts?.sinceMs ?? 1000 * 60 * 60 * 24 // 24h
      const topK = opts?.topK ?? 5
      const cutoff = now - windowMs

      const allRows = yield* store.getAll()
      const entries = allRows.map(rowToEntry)

      const total = entries.length
      const createdInWindow = entries.filter((e) => e.createdAt >= cutoff).length
      const touchedInWindow = entries.filter(
        (e) => e.createdAt >= cutoff || (e.updatedAt ?? 0) >= cutoff || (e.lastAccessAt ?? 0) >= cutoff,
      ).length

      const byType: Record<string, number> = {}
      const projectCounts: Record<string, number> = {}
      const tagCounts: Record<string, number> = {}
      let confidenceSum = 0

      for (const e of entries) {
        byType[e.memoryType] = (byType[e.memoryType] ?? 0) + 1
        projectCounts[e.projectId] = (projectCounts[e.projectId] ?? 0) + 1
        for (const tag of e.tags) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
        }
        confidenceSum += e.confidence ?? 1
      }

      const topProjects = Object.entries(projectCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([projectId, count]) => ({ projectId, count }))

      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([tag, count]) => ({ tag, count }))

      const latestByType = new Map<string, MemoryEntry>()
      for (const e of entries.filter((e) => e.createdAt >= cutoff || e.updatedAt >= cutoff)) {
        const current = latestByType.get(e.memoryType)
        if (!current || e.createdAt > current.createdAt) {
          latestByType.set(e.memoryType, e)
        }
      }

      const highlights = Array.from(latestByType.values())
        .sort((a, b) => b.importance - a.importance)
        .slice(0, topK)
        .map((e) => ({
          type: e.memoryType,
          content: e.content.slice(0, 160) + (e.content.length > 160 ? "…" : ""),
          importance: e.importance,
          projectId: e.projectId,
          ageHours: Math.round((now - e.createdAt) / (1000 * 60 * 60)),
        }))

      const stateOfMind = (() => {
        const ranked = Object.entries(byType).sort((a, b) => b[1] - a[1])
        if (ranked.length === 0) return "tabula rasa — no memory yet"
        const [dominant] = ranked
        switch (dominant[0]) {
          case "procedural":
            return "operational — accumulating know-how"
          case "semantic":
            return "curious — building knowledge graphs"
          case "episodic":
            return "experiential — learning from past runs"
          case "profile":
            return "attentive — tuning to user preferences"
          case "pattern":
            return "analytical — detecting recurring structures"
          case "learning":
            return "adaptive — integrating new lessons"
          default:
            return `focused on ${dominant[0]}`
        }
      })()

      return {
        now,
        windowMs,
        total,
        createdInWindow,
        touchedInWindow,
        byType,
        topProjects,
        topTags,
        highlights,
        stateOfMind,
        averageConfidence: total > 0 ? confidenceSum / total : 0,
      } satisfies MirrorReport
    })

    return Service.of({
      store: store_ as any,
      retrieve: retrieve as any,
      get: get as any,
      delete: delete_ as any,
      list: list as any,
      consolidate: consolidate_ as any,
      stats: stats as any,
      health: health as any,
      feedback: feedback as any,
      recordUsage: recordUsage as any,
      generateCueVariants: generateCueVariants as any,
      graph: graph as any,
      graphPath: graphPath as any,
      mirror: mirror as any,
      analyzeSession: analyzeSession as any,
      detectPatterns: detectPatterns as any,
      embedding: embedding as any,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Patterns.layer.pipe(Layer.provideMerge(MemoryStore.layer))),
    Layer.provide(Embedding.layer),
  ),
)

export const use = serviceUse(Service)

export { reflectUse, reflectAndRecord } from "./reflect-use"

// ---------------------------------------------------------------------------
// Self-reexport
// ---------------------------------------------------------------------------

export * as Memory from "."
