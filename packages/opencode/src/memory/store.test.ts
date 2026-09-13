import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { like, or } from "drizzle-orm"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { balancedOr } from "./store"

const t = sqliteTable("t", { content: text() })

function memoryDb() {
  const sqlite = new Database(":memory:")
  sqlite.run("create table t (content text)")
  return drizzle({ client: sqlite })
}

// Regression: a prompt with ~1000+ words used to make MemoryStore.search build a
// flat `or(...)` chain that SQLite rejected with
// "Expression tree is too large (maximum depth 1000)", aborting the session
// before the model call.
describe("balancedOr", () => {
  test("keeps the SQLite expression depth under the 1000 limit for 1500 conditions", () => {
    const conditions = Array.from({ length: 1500 }, (_, i) => like(t.content, `%w${i}%`))
    const where = balancedOr(conditions)
    expect(() => memoryDb().select().from(t).where(where).all()).not.toThrow()
  })

  test("a flat or(...) with 1500 conditions still reproduces the depth error", () => {
    const conditions = Array.from({ length: 1500 }, (_, i) => like(t.content, `%w${i}%`))
    expect(() => memoryDb().select().from(t).where(or(...conditions)).all()).toThrow()
  })

  test("returns undefined for an empty condition list", () => {
    expect(balancedOr([])).toBeUndefined()
  })
})
