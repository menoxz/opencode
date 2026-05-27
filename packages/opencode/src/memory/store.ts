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
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import { type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { eq, and, sql, like, or, desc, asc } from "drizzle-orm"
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
})

export type MemoryRow = typeof memoryTable.$inferSelect
export type MemoryInsert = Omit<MemoryRow, "id" | "created_at" | "updated_at">

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
  const dbDir = path.join(configDir, "opencode")
  fs.mkdirSync(dbDir, { recursive: true })
  return path.join(dbDir, "memory.sqlite")
}

function createTables(sqlite: Database): void {
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
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dbPath = getDbPath()
    log.info("opening memory database", { path: dbPath })

    const sqlite = new Database(dbPath)
    sqlite.exec("PRAGMA journal_mode = WAL")
    sqlite.exec("PRAGMA synchronous = NORMAL")
    sqlite.exec("PRAGMA busy_timeout = 5000")

    const db: SQLiteBunDatabase = drizzle({ client: sqlite })

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
      close,
    })
  }),
)

export const defaultLayer = layer
