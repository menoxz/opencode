import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/node-sqlite"

export type RawSqlite = DatabaseSync
export type RawDrizzleDb = ReturnType<typeof drizzle>

export function open(path: string): { sqlite: RawSqlite; db: RawDrizzleDb } {
  const sqlite = new DatabaseSync(path)
  const db = drizzle({ client: sqlite })
  return { sqlite, db }
}
