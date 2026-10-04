import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

export type RawSqlite = Database
export type RawDrizzleDb = ReturnType<typeof drizzle>

export function open(path: string): { sqlite: RawSqlite; db: RawDrizzleDb } {
  const sqlite = new Database(path)
  const db = drizzle({ client: sqlite })
  return { sqlite, db }
}
