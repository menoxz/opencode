/**
 * MemoryStore — SQLite persistence layer for the native vector memory system.
 *
 * Uses `bun:sqlite` + `drizzle-orm/bun-sqlite` to store memories in a dedicated
 * SQLite database at `XDG_CONFIG_HOME/opencode/memory.sqlite`.
 *
 * Supports vector embeddings for semantic search alongside BM25 keyword search.
 * Embeddings are stored as JSON arrays in the `embedding` column.
 *
 * This module is NOT self-reexported — it is a helper consumed by the main
 * Memory service in `index.ts`.
 */

import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core"
import { open as openSqlite, type RawSqlite, type RawDrizzleDb } from "#sqlite-raw"
import { StorageMaintenance } from "@/storage/maintenance"
import { eq, and, sql, like, or, desc, asc, gte, inArray } from "drizzle-orm"
import { Effect, Context, Layer } from "effect"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import * as Log from "@opencode-ai/core/util/log"
import { cosineSimilarity } from "./embedding"

const log = Log.create({ service: "memory-store" })

// ---------------------------------------------------------------------------
// Drizzle table definition
// ---------------------------------------------------------------------------

export const memoryTable = sqliteTable("memory", {
  id: text().primaryKey(),
  content: text().notNull(),
  memory_type: text().notNull().default("semantic"),
  tags: text().notNull().default("[]"),
  importance: real().notNull().default(0.5),
  project_id: text().notNull().default("default"),
  source: text().notNull().default("chat"),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
  confidence: real().notNull().default(1.0),
  /** Vector embedding stored as JSON array of floats, e.g. "[0.1, 0.2, ...]" */
  embedding: text(),
  /** Model identifier used to generate the embedding */
  embedding_model: text(),
  /** How many times this memory has been accessed */
  access_count: integer().notNull().default(0),
  /** Timestamp of the last access */
  last_access_at: integer(),
  /** Forgetting rate for decay-based pruning */
  forgetting_rate: real(),
  /** Contextual information when the memory was encoded */
  encoding_context: text(),
  /** Query context associated with this memory */
  query_context: text(),
  feedback: text(),
  cue_variants: text(),
  search_count: integer().notNull().default(0),
})

export const memoryLinksTable = sqliteTable("memory_links", {
  id: text().primaryKey(),
  source_memory_id: text().notNull().references(() => memoryTable.id, { onDelete: "cascade" }),
  target_memory_id: text().notNull().references(() => memoryTable.id, { onDelete: "cascade" }),
  link_type: text().notNull().default("co-retrieved"),
  strength: real().notNull().default(0.5),
  co_occurrence_count: integer().notNull().default(1),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
})

export type MemoryRow = typeof memoryTable.$inferSelect
export type MemoryInsert = Omit<MemoryRow, "id" | "created_at" | "updated_at" | "access_count" | "last_access_at" | "forgetting_rate" | "encoding_context" | "query_context" | "feedback" | "cue_variants" | "search_count">
export type LinkRow = typeof memoryLinksTable.$inferSelect

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  row: MemoryRow
  score: number
}

export interface Interface {
  readonly insert: (entry: MemoryInsert) => Effect.Effect<string>
  readonly findById: (id: string) => Effect.Effect<MemoryRow | null>
  readonly search: (query: string, limit: number) => Effect.Effect<MemoryRow[]>
  /** Vector similarity search using cosine distance on stored embeddings. */
  readonly searchVector: (queryVector: number[], limit: number) => Effect.Effect<VectorSearchResult[]>
  /** Get all rows that have embeddings stored. */
  readonly getAllWithEmbeddings: () => Effect.Effect<MemoryRow[]>
  readonly list: (opts: {
    projectId?: string
    memoryType?: string
    minConfidence?: number
    offset: number
    limit: number
  }) => Effect.Effect<{ rows: MemoryRow[]; total: number }>
  readonly updateConfidence: (id: string, confidence: number) => Effect.Effect<void>
  readonly updateContent: (id: string, content: string) => Effect.Effect<void>
  readonly updateEmbedding: (id: string, embedding: number[], model: string) => Effect.Effect<void>
  readonly deleteById: (id: string) => Effect.Effect<boolean>
  readonly count: () => Effect.Effect<{ total: number; byType: Record<string, number> }>
  readonly getAll: () => Effect.Effect<MemoryRow[]>
  readonly stats: () => Effect.Effect<{
    total: number
    byType: Record<string, number>
    averageConfidence: number
  }>
  readonly updateAccessStats: (id: string, now: number) => Effect.Effect<void>
  readonly createOrUpdateLink: (params: { sourceMemoryId: string; targetMemoryId: string; linkType: string }) => Effect.Effect<void>
  readonly getStrongLinks: (memoryId: string, minStrength: number) => Effect.Effect<Array<{ sourceMemoryId: string; targetMemoryId: string; strength: number; linkType: string }>>
  readonly pruneLinks: (minStrength: number, maxAgeDays: number) => Effect.Effect<number>
  readonly getAllMemories: () => Effect.Effect<MemoryRow[]>
  readonly batchUpdateConfidence: (updates: Array<{ id: string; confidence: number }>) => Effect.Effect<void>
  readonly setEncodingData: (id: string, context: string | null, queryContext: string | null) => Effect.Effect<void>
  readonly setFeedback: (id: string, feedback: "positive" | "negative" | null) => Effect.Effect<void>
  readonly getFeedbackStats: () => Effect.Effect<{ positive: number; negative: number; total: number }>
  readonly setCueVariants: (id: string, variants: string[]) => Effect.Effect<void>
  readonly getLinkedMemories: (memoryId: string, maxDepth: number) => Effect.Effect<MemoryRow[]>
  readonly getShortestPath: (fromId: string, toId: string) => Effect.Effect<MemoryRow[]>
  readonly getGraphStats: () => Effect.Effect<{ nodeCount: number; edgeCount: number; avgDegree: number }>
  readonly getAllLinks: () => Effect.Effect<LinkRow[]>
  readonly incrementSearchCount: (id: string) => Effect.Effect<void>
  readonly updateImportance: (id: string, importance: number) => Effect.Effect<void>
  readonly getFeedbackCounts: () => Effect.Effect<{ positive: number; negative: number; none: number }>
  readonly close: () => Effect.Effect<void>
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/MemoryStore") {}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

function getDbPath(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".config")
  const dbDir = path.join(configDir, "opencodev2")
  fs.mkdirSync(dbDir, { recursive: true })
  return path.join(dbDir, "memory.sqlite")
}

function createTables(sqlite: RawSqlite): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL DEFAULT 'semantic',
      tags TEXT NOT NULL DEFAULT '[]',
      importance REAL NOT NULL DEFAULT 0.5,
      project_id TEXT NOT NULL DEFAULT 'default',
      source TEXT NOT NULL DEFAULT 'chat',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      embedding TEXT,
      embedding_model TEXT
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS memory_project_idx ON memory(project_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS memory_type_idx ON memory(memory_type)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS memory_confidence_idx ON memory(confidence)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS memory_importance_idx ON memory(importance)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS memory_created_at_idx ON memory(created_at)`)

  // Add columns if they don't exist (for DBs created before this migration)
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN embedding TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN embedding_model TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN last_access_at INTEGER;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN forgetting_rate REAL;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN encoding_context TEXT;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN query_context TEXT;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN feedback TEXT;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN cue_variants TEXT;`); } catch {}
  try { sqlite.exec(`ALTER TABLE memory ADD COLUMN search_count INTEGER NOT NULL DEFAULT 0;`); } catch {}

  // New tables (IF NOT EXISTS handles re-creation safely)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS memory_links (
    id TEXT PRIMARY KEY,
    source_memory_id TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
    target_memory_id TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL DEFAULT 'co-retrieved',
    strength REAL NOT NULL DEFAULT 0.5,
    co_occurrence_count INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`)

  // Indexes for memory_links
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_links_source ON memory_links(source_memory_id);`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_memory_id);`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_links_strength ON memory_links(strength);`)
  // Additional indexes for new columns
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_mem_access_count ON memory(access_count);`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_mem_forgetting_rate ON memory(forgetting_rate);`)
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dbPath = getDbPath()
    log.info("opening memory database", { path: dbPath })

    const { sqlite, db } = openSqlite(dbPath) as { sqlite: RawSqlite; db: RawDrizzleDb }
    sqlite.exec("PRAGMA journal_mode = WAL")
    sqlite.exec("PRAGMA synchronous = NORMAL")
    sqlite.exec("PRAGMA busy_timeout = 5000")
    // WAL with no checkpoint grows without bound; the main database reached
    // 4.85 GB that way. No `part` table here, so checkpoint only.
    StorageMaintenance.schedule(sqlite, { purge: false })

    createTables(sqlite)

    // ---- Helper: run a synchronous DB callback inside Effect ----
    const sync = <T>(fn: () => T): Effect.Effect<T> =>
      Effect.sync(() => fn())

    // ---- insert ----
    const insert = Effect.fn("MemoryStore.insert")(function* (entry: MemoryInsert) {
      const id = randomUUID()
      const now = Date.now()
      yield* sync(() =>
        db
          .insert(memoryTable)
          .values({
            id,
            content: entry.content,
            memory_type: entry.memory_type,
            tags: entry.tags,
            importance: entry.importance,
            project_id: entry.project_id,
            source: entry.source,
            created_at: now,
            updated_at: now,
            confidence: entry.confidence,
          })
          .run(),
      )
      log.info("memory stored", { id, memoryType: entry.memory_type, projectId: entry.project_id })
      return id
    })

    // ---- findById ----
    const findById = Effect.fn("MemoryStore.findById")(function* (id: string) {
      const row = yield* sync(() =>
        db.select().from(memoryTable).where(eq(memoryTable.id, id)).get(),
      )
      return row ?? null
    })

    // ---- search (LIKE-based keyword matching) ----
    const search = Effect.fn("MemoryStore.search")(function* (query: string, limit: number) {
      const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)

      if (tokens.length === 0) {
        return yield* sync(() =>
          db
            .select()
            .from(memoryTable)
            .orderBy(desc(memoryTable.importance))
            .limit(limit)
            .all(),
        )
      }

      // Build a WHERE clause matching any token in content
      const conditions = tokens.map((token) => like(memoryTable.content, `%${token}%`))
      const whereClause = or(...conditions)

      const rows = yield* sync(() =>
        db
          .select()
          .from(memoryTable)
          .where(whereClause)
          .orderBy(desc(memoryTable.importance))
          .limit(limit * 3) // fetch extra for scoring
          .all(),
      )

      // Score each row: (matched_tokens / total_tokens) * importance * confidence
      const scored = rows.map((row) => {
        const contentLower = row.content.toLowerCase()
        let matchCount = 0
        for (const token of tokens) {
          if (contentLower.includes(token)) matchCount++
        }
        const score = (matchCount / tokens.length) * row.importance * row.confidence
        return { row, score }
      })

      // Sort by score descending, take top limit
      scored.sort((a, b) => b.score - a.score)
      return scored.slice(0, limit).map((s) => s.row)
    })

    // ---- searchVector (cosine similarity on stored embeddings) ----
    const searchVector = Effect.fn("MemoryStore.searchVector")(function* (
      queryVector: number[],
      limit: number,
    ) {
      const rows = yield* sync(() =>
        db
          .select()
          .from(memoryTable)
          .where(sql`${memoryTable.embedding} IS NOT NULL`)
          .all(),
      )

      const scored: VectorSearchResult[] = rows
        .map((row) => {
          if (!row.embedding) return null
          try {
            const stored = JSON.parse(row.embedding) as number[]
            const sim = cosineSimilarity(queryVector, stored)
            return { row, score: sim * row.importance * row.confidence }
          } catch {
            return null
          }
        })
        .filter((r): r is VectorSearchResult => r !== null && r.score > 0)

      scored.sort((a, b) => b.score - a.score)
      return scored.slice(0, limit)
    })

    // ---- getAllWithEmbeddings ----
    const getAllWithEmbeddings = Effect.fn("MemoryStore.getAllWithEmbeddings")(function* () {
      return yield* sync(() =>
        db
          .select()
          .from(memoryTable)
          .where(sql`${memoryTable.embedding} IS NOT NULL`)
          .all(),
      )
    })

    // ---- updateEmbedding ----
    const updateEmbedding = Effect.fn("MemoryStore.updateEmbedding")(function* (
      id: string,
      embedding: number[],
      model: string,
    ) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({
            embedding: JSON.stringify(embedding),
            embedding_model: model,
            updated_at: Date.now(),
          })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- list ----
    const list = Effect.fn("MemoryStore.list")(function* (opts: {
      projectId?: string
      memoryType?: string
      minConfidence?: number
      offset: number
      limit: number
    }) {
      const conditions: ReturnType<typeof eq>[] = []

      if (opts.projectId) {
        conditions.push(eq(memoryTable.project_id, opts.projectId))
      }
      if (opts.memoryType) {
        conditions.push(eq(memoryTable.memory_type, opts.memoryType))
      }
      if (opts.minConfidence !== undefined) {
        conditions.push(sql`${memoryTable.confidence} >= ${opts.minConfidence}`)
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = yield* sync(() =>
        db
          .select()
          .from(memoryTable)
          .where(where)
          .orderBy(desc(memoryTable.created_at))
          .limit(opts.limit)
          .offset(opts.offset)
          .all(),
      )

      const total = yield* sync(() => {
        const result = db
          .select({ count: sql<number>`count(*)` })
          .from(memoryTable)
          .where(where)
          .get()
        return result?.count ?? 0
      })

      return { rows, total }
    })

    // ---- updateConfidence ----
    const updateConfidence = Effect.fn("MemoryStore.updateConfidence")(function* (
      id: string,
      confidence: number,
    ) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ confidence, updated_at: Date.now() })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- updateContent ----
    const updateContent = Effect.fn("MemoryStore.updateContent")(function* (id: string, content: string) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ content, updated_at: Date.now() })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- deleteById ----
    const deleteById = Effect.fn("MemoryStore.deleteById")(function* (id: string) {
      const existing = yield* findById(id)
      if (!existing) return false
      yield* sync(() => db.delete(memoryTable).where(eq(memoryTable.id, id)).run())
      return true
    })

    // ---- count ----
    const count = Effect.fn("MemoryStore.count")(function* () {
      const rows = yield* sync(() =>
        db
          .select({
            memory_type: memoryTable.memory_type,
            count: sql<number>`count(*)`,
          })
          .from(memoryTable)
          .groupBy(memoryTable.memory_type)
          .all(),
      )

      let total = 0
      const byType: Record<string, number> = {}
      for (const row of rows) {
        byType[row.memory_type] = row.count
        total += row.count
      }

      return { total, byType }
    })

    // ---- getAll ----
    const getAll = Effect.fn("MemoryStore.getAll")(function* () {
      return yield* sync(() => db.select().from(memoryTable).all())
    })

    // ---- stats ----
    const stats = Effect.fn("MemoryStore.stats")(function* () {
      const { total, byType } = yield* count()
      const avgRow = yield* sync(() =>
        db
          .select({ avg: sql<number>`avg(confidence)` })
          .from(memoryTable)
          .get(),
      )
      return {
        total,
        byType,
        averageConfidence: avgRow?.avg ?? 0,
      }
    })

    // ---- updateAccessStats ----
    const updateAccessStats = Effect.fn("MemoryStore.updateAccessStats")(function* (id: string, now: number) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ access_count: sql`access_count + 1`, last_access_at: now, updated_at: now })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- createOrUpdateLink ----
    const createOrUpdateLink = Effect.fn("MemoryStore.createOrUpdateLink")(function* (params: {
      sourceMemoryId: string
      targetMemoryId: string
      linkType: string
    }) {
      const existing = yield* sync(() =>
        db
          .select()
          .from(memoryLinksTable)
          .where(
            and(
              eq(memoryLinksTable.source_memory_id, params.sourceMemoryId),
              eq(memoryLinksTable.target_memory_id, params.targetMemoryId),
              eq(memoryLinksTable.link_type, params.linkType),
            ),
          )
          .get(),
      )

      if (existing) {
        const newCount = existing.co_occurrence_count + 1
        const newStrength = Math.min(1.0, newCount / (newCount + 10))
        yield* sync(() =>
          db
            .update(memoryLinksTable)
            .set({ co_occurrence_count: newCount, strength: newStrength, updated_at: Date.now() })
            .where(eq(memoryLinksTable.id, existing.id))
            .run(),
        )
      } else {
        yield* sync(() =>
          db
            .insert(memoryLinksTable)
            .values({
              id: randomUUID(),
              source_memory_id: params.sourceMemoryId,
              target_memory_id: params.targetMemoryId,
              link_type: params.linkType,
              strength: 0.09,
              co_occurrence_count: 1,
              created_at: Date.now(),
              updated_at: Date.now(),
            })
            .run(),
        )
      }
    })

    // ---- getStrongLinks ----
    const getStrongLinks = Effect.fn("MemoryStore.getStrongLinks")(function* (memoryId: string, minStrength: number) {
      const links = yield* sync(() =>
        db
          .select()
          .from(memoryLinksTable)
          .where(
            and(
              or(
                eq(memoryLinksTable.source_memory_id, memoryId),
                eq(memoryLinksTable.target_memory_id, memoryId),
              ),
              gte(memoryLinksTable.strength, minStrength),
            ),
          )
          .all(),
      )

      return links.map((l) => ({
        sourceMemoryId: l.source_memory_id,
        targetMemoryId: l.target_memory_id,
        strength: l.strength,
        linkType: l.link_type,
      }))
    })

    // ---- pruneLinks ----
    const pruneLinks = Effect.fn("MemoryStore.pruneLinks")(function* (
      minStrength: number,
      maxAgeDays: number,
    ) {
      const cutoff = Date.now() - maxAgeDays * 86400000
      yield* sync(() =>
        db
          .delete(memoryLinksTable)
          .where(
            or(
              sql`${memoryLinksTable.strength} < ${minStrength}`,
              sql`${memoryLinksTable.created_at} < ${cutoff}`,
            ),
          )
          .run(),
      )
      // Return count of remaining links is not available from bun:sqlite driver
      return 0
    })

    // ---- getAllMemories ----
    const getAllMemories = Effect.fn("MemoryStore.getAllMemories")(function* () {
      const rows = yield* sync(() => db.select().from(memoryTable).all())
      return rows
    })

    // ---- batchUpdateConfidence ----
    const batchUpdateConfidence = Effect.fn("MemoryStore.batchUpdateConfidence")(function* (
      updates: Array<{ id: string; confidence: number }>,
    ) {
      const now = Date.now()
      for (const { id, confidence } of updates) {
        yield* sync(() =>
          db
            .update(memoryTable)
            .set({ confidence, updated_at: now })
            .where(eq(memoryTable.id, id))
            .run(),
        )
      }
    })

    // ---- setEncodingData ----
    const setEncodingData = Effect.fn("MemoryStore.setEncodingData")(function* (
      id: string,
      context: string | null,
      queryContext: string | null,
    ) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ encoding_context: context, query_context: queryContext, updated_at: Date.now() })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- setFeedback ----
    const setFeedback = Effect.fn("MemoryStore.setFeedback")(function* (id: string, feedback: "positive" | "negative" | null) {
      yield* sync(() =>
        db.update(memoryTable).set({ feedback, updated_at: Date.now() }).where(eq(memoryTable.id, id)).run(),
      )
    })

    // ---- getFeedbackStats ----
    const getFeedbackStats = Effect.fn("MemoryStore.getFeedbackStats")(function* () {
      const counts = yield* sync(() => {
        const pos = db.select({ count: sql<number>`count(*)` }).from(memoryTable).where(eq(memoryTable.feedback, "positive")).get()
        const neg = db.select({ count: sql<number>`count(*)` }).from(memoryTable).where(eq(memoryTable.feedback, "negative")).get()
        const tot = db.select({ count: sql<number>`count(*)` }).from(memoryTable).get()
        return { positive: pos?.count ?? 0, negative: neg?.count ?? 0, total: tot?.count ?? 0 }
      })
      return counts
    })

    // ---- setCueVariants ----
    const setCueVariants = Effect.fn("MemoryStore.setCueVariants")(function* (id: string, variants: string[]) {
      yield* sync(() =>
        db.update(memoryTable).set({ cue_variants: JSON.stringify(variants), updated_at: Date.now() }).where(eq(memoryTable.id, id)).run(),
      )
    })

    // ---- getLinkedMemories ----
    const getLinkedMemories = Effect.fn("MemoryStore.getLinkedMemories")(function* (memoryId: string, maxDepth: number) {
      if (maxDepth <= 0) return []
      const visited = new Set<string>()
      const queue: Array<{ id: string; depth: number }> = [{ id: memoryId, depth: 0 }]
      visited.add(memoryId)
      const neighborIds = new Set<string>()
      while (queue.length > 0) {
        const current = queue.shift()!
        if (current.depth >= maxDepth) continue
        const links = yield* sync(() =>
          db.select().from(memoryLinksTable).where(
            or(eq(memoryLinksTable.source_memory_id, current.id), eq(memoryLinksTable.target_memory_id, current.id)),
          ).all(),
        )
        for (const link of links) {
          const neighbor = link.source_memory_id === current.id ? link.target_memory_id : link.source_memory_id
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            neighborIds.add(neighbor)
            queue.push({ id: neighbor, depth: current.depth + 1 })
          }
        }
      }
      if (neighborIds.size === 0) return []
      const ids = [...neighborIds]
      const rows = yield* sync(() =>
        db.select().from(memoryTable).where(inArray(memoryTable.id, ids)).all(),
      )
      return rows
    })

    // ---- getShortestPath ----
    const getShortestPath = Effect.fn("MemoryStore.getShortestPath")(function* (fromId: string, toId: string) {
      if (fromId === toId) {
        const row = yield* findById(fromId)
        return row ? [row] : []
      }
      const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: fromId, path: [fromId] }]
      const visited = new Set<string>()
      visited.add(fromId)
      while (queue.length > 0) {
        const { nodeId, path } = queue.shift()!
        const links = yield* sync(() =>
          db.select().from(memoryLinksTable).where(
            or(eq(memoryLinksTable.source_memory_id, nodeId), eq(memoryLinksTable.target_memory_id, nodeId)),
          ).all(),
        )
        for (const link of links) {
          const neighbor = link.source_memory_id === nodeId ? link.target_memory_id : link.source_memory_id
          if (neighbor === toId) {
            const fullPath = [...path, toId]
            const rows = yield* sync(() =>
              db.select().from(memoryTable).where(inArray(memoryTable.id, fullPath)).all(),
            )
            const rowMap = new Map(rows.map(r => [r.id, r]))
            return fullPath.map(id => rowMap.get(id)).filter((r): r is MemoryRow => r !== undefined)
          }
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push({ nodeId: neighbor, path: [...path, neighbor] })
          }
        }
      }
      return []
    })

    // ---- getGraphStats ----
    const getGraphStats = Effect.fn("MemoryStore.getGraphStats")(function* () {
      const stats = yield* sync(() => {
        const n = db.select({ count: sql<number>`count(*)` }).from(memoryTable).get()
        const e = db.select({ count: sql<number>`count(*)` }).from(memoryLinksTable).get()
        const s = db.select({ count: sql<number>`COUNT(DISTINCT source_memory_id)` }).from(memoryLinksTable).get()
        return { nodeCount: n?.count ?? 0, edgeCount: e?.count ?? 0, uniqueSourceNodes: s?.count ?? 0 }
      })
      return {
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        avgDegree: stats.edgeCount / Math.max(stats.uniqueSourceNodes, 1),
      }
    })

    // ---- getAllLinks ----
    const getAllLinks = Effect.fn("MemoryStore.getAllLinks")(function* () {
      return yield* sync(() => db.select().from(memoryLinksTable).all())
    })

    // ---- incrementSearchCount ----
    const incrementSearchCount = Effect.fn("MemoryStore.incrementSearchCount")(function* (id: string) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ search_count: sql`search_count + 1`, updated_at: Date.now() })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- updateImportance ----
    const updateImportance = Effect.fn("MemoryStore.updateImportance")(function* (id: string, importance: number) {
      yield* sync(() =>
        db
          .update(memoryTable)
          .set({ importance, updated_at: Date.now() })
          .where(eq(memoryTable.id, id))
          .run(),
      )
    })

    // ---- getFeedbackCounts ----
    const getFeedbackCounts = Effect.fn("MemoryStore.getFeedbackCounts")(function* () {
      const counts = yield* sync(() => {
        const pos = db.select({ count: sql<number>`count(*)` }).from(memoryTable).where(eq(memoryTable.feedback, "positive")).get()
        const neg = db.select({ count: sql<number>`count(*)` }).from(memoryTable).where(eq(memoryTable.feedback, "negative")).get()
        const none = db.select({ count: sql<number>`count(*)` }).from(memoryTable).where(sql`${memoryTable.feedback} IS NULL`).get()
        return { positive: pos?.count ?? 0, negative: neg?.count ?? 0, none: none?.count ?? 0 }
      })
      return counts
    })

    // ---- close ----
    const close = Effect.fn("MemoryStore.close")(function* () {
      yield* sync(() => {
        sqlite.close()
      })
    })

    return Service.of({
      insert,
      findById,
      search,
      searchVector,
      getAllWithEmbeddings,
      list,
      updateConfidence,
      updateContent,
      updateEmbedding,
      deleteById,
      count,
      getAll,
      stats,
      updateAccessStats,
      createOrUpdateLink,
      getStrongLinks,
      pruneLinks,
      getAllMemories,
      batchUpdateConfidence,
      setEncodingData,
      setFeedback,
      getFeedbackStats,
      setCueVariants,
      getLinkedMemories,
      getShortestPath,
      getGraphStats,
      getAllLinks,
      incrementSearchCount,
      updateImportance,
      getFeedbackCounts,
      close,
    })
  }),
)

export const defaultLayer = layer
