import { type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
export * from "drizzle-orm"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LocalContext } from "@/util/local-context"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"
import { NamedError } from "@opencode-ai/core/util/error"
import path from "path"
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { createHash } from "node:crypto"
import { Flag } from "@opencode-ai/core/flag/flag"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { EffectBridge } from "@/effect/bridge"
import { init, migrate } from "#db"
import { Effect, Schema } from "effect"

declare const OPENCODE_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined

export const NotFoundError = NamedError.create("NotFoundError", {
  message: Schema.String,
})

const log = Log.create({ service: "db" })

type DatabaseFlags = Pick<RuntimeFlags.Info, "disableChannelDb" | "skipMigrations">

const readRuntimeFlags = () =>
  Effect.runSync(RuntimeFlags.Service.useSync((flags) => flags).pipe(Effect.provide(RuntimeFlags.defaultLayer)))

export function getChannelPath(flags: Pick<DatabaseFlags, "disableChannelDb"> = readRuntimeFlags()) {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || flags.disableChannelDb)
    return path.join(Global.Path.data, "opencode.db")
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")
  return path.join(Global.Path.data, `opencode-${safe}.db`)
}

export const getPath = (flags?: Pick<DatabaseFlags, "disableChannelDb">) => {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || path.isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return path.join(Global.Path.data, Flag.OPENCODE_DB)
  }
  return getChannelPath(flags)
}

export type Transaction = SQLiteTransaction<"sync", void>

type Client = ReturnType<typeof init>

type Journal = { sql: string; timestamp: number; name: string }[]

// Drizzle's `migrate(db, config)` only supports folder-based config across
// dialects (bun-sqlite's array/journal shortcut turned out to be an artifact
// of a stale duplicate package version, not a stable API — it silently threw
// `readdirSync(undefined)` under drizzle-orm/node-sqlite). To stay dialect
// and version agnostic, materialize the bundled/dev journal entries as real
// migration files and always call the documented `migrationsFolder` API.
function migrationsFingerprint(entries: Journal): string {
  const hash = createHash("sha256")
  for (const entry of entries) {
    hash.update(entry.name)
    hash.update("\0")
    hash.update(entry.sql)
    hash.update("\0")
  }
  return hash.digest("hex").slice(0, 16)
}

// The runtime folder used to be a single fixed path that accumulated every
// migration folder ever written across restarts/builds. `readMigrationFiles`
// reads *all* subdirectories present, so a stale folder left behind by a
// previous version/build (renamed, squashed, or edited migration with the
// same name) got re-read alongside the current entries and could silently
// conflict with migrations already recorded as applied (skipped if the name
// matched, or applied with unexpected SQL if it didn't) — with no marker of
// which build produced which files. Namespacing by a content hash of the
// current entries guarantees this build only ever sees its own files.
function materializeMigrationsFolder(entries: Journal): string {
  const root = path.join(Global.Path.data, "migrations-runtime")
  const dir = path.join(root, migrationsFingerprint(entries))
  for (const entry of entries) {
    const entryDir = path.join(dir, entry.name)
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(path.join(entryDir, "migration.sql"), entry.sql)
  }
  // Best-effort cleanup of folders from older builds so the cache doesn't
  // grow unbounded. Failures here must never block migrations from applying.
  try {
    for (const sibling of readdirSync(root, { withFileTypes: true })) {
      if (sibling.isDirectory() && sibling.name !== path.basename(dir)) {
        rmSync(path.join(root, sibling.name), { recursive: true, force: true })
      }
    }
  } catch (err) {
    log.warn("failed to prune stale migrations-runtime folders", { err })
  }
  return dir
}

export function applyMigrations(db: SQLiteBunDatabase, entries: Journal) {
  const dir = materializeMigrationsFolder(entries)
  baselineExistingSchema(db, entries)
  migrate(db, { migrationsFolder: dir } as unknown as Parameters<typeof migrate>[1])
}

const MIGRATIONS_TABLE = "__drizzle_migrations"

// Tables, indexes and views a migration creates. Drizzle decides what to run
// from the recorded migration *names*, so this is only used to tell whether a
// migration would be a no-op against the schema already in the database.
function createdObjects(statements: string): string[] {
  const pattern = /CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([A-Za-z0-9_]+)[`"']?/gi
  return [...statements.matchAll(pattern)].map((match) => match[1])
}

// A database can hold the whole schema while its migration bookkeeping is gone:
// a first run interrupted mid-migration, a copy taken without its WAL, or a
// database imported from another install. Drizzle then replays migration 1,
// `CREATE TABLE project` fails because the table is already there, the failure
// surfaces as "Unexpected server error" on every startup request — and it never
// heals, because each launch replays the same migration.
//
// Record the migrations that only create objects which all already exist: they
// are provable no-ops against this database. Anything that also alters or drops
// is left alone, so a genuinely pending change still runs.
function baselineExistingSchema(db: SQLiteBunDatabase, entries: Journal) {
  const existing = new Set(
    db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type IN ('table', 'index', 'view')`)
      .map((row) => row.name),
  )
  if (existing.size === 0) return

  const table = sql.identifier(MIGRATIONS_TABLE)
  db.run(
    sql`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT)`,
  )
  const recorded = new Set(
    db
      .all<{ name: string | null }>(sql`SELECT name FROM ${table}`)
      .map((row) => row.name)
      .filter((name): name is string => Boolean(name)),
  )

  for (const entry of entries) {
    if (recorded.has(entry.name)) continue
    if (/\b(?:ALTER|DROP)\s+(?:TABLE|INDEX|VIEW)\b/i.test(entry.sql)) continue
    const created = createdObjects(entry.sql)
    if (created.length === 0) continue
    if (!created.every((name) => existing.has(name))) continue

    const hash = createHash("sha256").update(entry.sql).digest("hex")
    db.run(
      sql`INSERT INTO ${table} ("hash", "created_at", "name", "applied_at") VALUES (${hash}, ${entry.timestamp}, ${entry.name}, ${new Date().toISOString()})`,
    )
    log.warn("schema already present, recording migration as applied", { name: entry.name })
  }
}

function time(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function migrations(dir: string): Journal {
  const dirs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const sql = dirs
    .map((name) => {
      const file = path.join(dir, name, "migration.sql")
      if (!existsSync(file)) return
      return {
        sql: readFileSync(file, "utf-8"),
        timestamp: time(name),
        name,
      }
    })
    .filter(Boolean) as Journal

  return sql.sort((a, b) => a.timestamp - b.timestamp)
}

let client: Client | undefined
let loaded = false

export const Client = Object.assign(
  (flags: DatabaseFlags = readRuntimeFlags()): Client => {
    if (loaded) return client as Client

    const dbPath = getPath(flags)
    log.info("opening database", { path: dbPath })

    const db = init(dbPath)

    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA busy_timeout = 5000")
    db.run("PRAGMA cache_size = -64000")
    db.run("PRAGMA foreign_keys = ON")
    db.run("PRAGMA wal_checkpoint(PASSIVE)")

    // Apply schema migrations
    const entries =
      typeof OPENCODE_MIGRATIONS !== "undefined"
        ? OPENCODE_MIGRATIONS
        : migrations(path.join(import.meta.dirname, "../../migration"))
    if (entries.length > 0) {
      log.info("applying migrations", {
        count: entries.length,
        mode: typeof OPENCODE_MIGRATIONS !== "undefined" ? "bundled" : "dev",
      })
      if (flags.skipMigrations) {
        for (const item of entries) {
          item.sql = "select 1;"
        }
      }
      applyMigrations(db, entries)
    }

    client = db
    loaded = true
    return db
  },
  {
    reset: () => {
      loaded = false
      client = undefined
    },
    loaded: () => loaded,
  },
)

export function close() {
  if (!Client.loaded()) return
  Client().$client.close()
  Client.reset()
}

export type TxOrDb = Transaction | Client

const ctx = LocalContext.create<{
  tx: TxOrDb
  effects: (() => void | Promise<void>)[]
}>("database")

export function use<T>(callback: (trx: TxOrDb) => T): T {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
      for (const effect of effects) effect()
      return result
    }
    throw err
  }
}

export function effect(fn: () => any | Promise<any>) {
  const bound = EffectBridge.bind(fn)
  try {
    ctx.use().effects.push(bound)
  } catch {
    bound()
  }
}

type NotPromise<T> = T extends Promise<any> ? never : T

export function transaction<T>(
  callback: (tx: TxOrDb) => NotPromise<T>,
  options?: {
    behavior?: "deferred" | "immediate" | "exclusive"
  },
): NotPromise<T> {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const txCallback = EffectBridge.bind((tx: TxOrDb) => ctx.provide({ tx, effects }, () => callback(tx)))
      const result = Client().transaction(txCallback, { behavior: options?.behavior })
      for (const effect of effects) effect()
      return result as NotPromise<T>
    }
    throw err
  }
}

export * as Database from "./db"
