import { describe, expect, test } from "bun:test"
import { Database as BunSqlite } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { sql } from "drizzle-orm"
import { Database } from "@/storage/db"

const journal = [
  {
    name: "20260101000000_create_project",
    timestamp: Date.UTC(2026, 0, 1),
    sql: "CREATE TABLE `project` (\n\t`id` text PRIMARY KEY,\n\t`worktree` text NOT NULL\n);\n",
  },
  {
    name: "20260102000000_create_session",
    timestamp: Date.UTC(2026, 0, 2),
    sql: "CREATE TABLE `session` (\n\t`id` text PRIMARY KEY\n);\n--> statement-breakpoint\nCREATE INDEX `session_id_idx` ON `session` (`id`);\n",
  },
]

const open = () => drizzle({ client: new BunSqlite(":memory:", { create: true }) })

const tables = (db: ReturnType<typeof open>) =>
  db
    .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .map((row) => row.name)

const recorded = (db: ReturnType<typeof open>) =>
  db.all<{ name: string }>(sql`SELECT name FROM __drizzle_migrations ORDER BY id`).map((row) => row.name)

describe("Database.applyMigrations", () => {
  test("applies every migration to a new database", () => {
    const db = open()
    Database.applyMigrations(db, journal)
    expect(tables(db)).toContain("project")
    expect(tables(db)).toContain("session")
    expect(recorded(db)).toEqual(journal.map((entry) => entry.name))
  })

  test("is a no-op when run twice", () => {
    const db = open()
    Database.applyMigrations(db, journal)
    Database.applyMigrations(db, journal)
    expect(recorded(db)).toEqual(journal.map((entry) => entry.name))
  })

  // Regression: a database can keep the whole schema while losing its migration
  // bookkeeping — an interrupted first run, a copy taken without its WAL, an
  // import from another install. Drizzle then replayed migration 1, CREATE TABLE
  // failed because the table was already there, and every launch crashed the
  // same way with "Unexpected server error" on all startup requests.
  test("recovers when the schema exists but the bookkeeping is gone", () => {
    const db = open()
    Database.applyMigrations(db, journal)
    db.run(sql`DROP TABLE __drizzle_migrations`)

    expect(() => Database.applyMigrations(db, journal)).not.toThrow()
    expect(recorded(db)).toEqual(journal.map((entry) => entry.name))
    expect(tables(db)).toContain("project")
  })

  test("still applies a migration whose objects are missing", () => {
    const db = open()
    Database.applyMigrations(db, [journal[0]!])
    db.run(sql`DROP TABLE __drizzle_migrations`)

    Database.applyMigrations(db, journal)
    expect(tables(db)).toContain("session")
    expect(recorded(db)).toEqual(journal.map((entry) => entry.name))
  })

  test("leaves a migration that alters the schema to drizzle", () => {
    const db = open()
    Database.applyMigrations(db, journal)
    db.run(sql`DROP TABLE __drizzle_migrations`)

    const withAlter = [
      ...journal,
      {
        name: "20260103000000_add_column",
        timestamp: Date.UTC(2026, 0, 3),
        sql: "ALTER TABLE `project` ADD `vcs` text;\n",
      },
    ]
    Database.applyMigrations(db, withAlter)
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(\`project\`)`).map((row) => row.name)
    expect(columns).toContain("vcs")
  })
})
