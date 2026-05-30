import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"

export const EvalRunTable = sqliteTable(
  "eval_run",
  {
    id: text().primaryKey(),
    suite_id: text().notNull(),
    suite_name: text().notNull(),
    pass_rate: real().notNull(),
    total_scenarios: integer().notNull(),
    passed: integer().notNull(),
    failed: integer().notNull(),
    avg_duration_ms: real().notNull(),
    total_duration_ms: real().notNull(),
    total_tokens: integer().default(0).notNull(),
    total_tool_calls: integer().default(0).notNull(),
    agent: text(),
    model: text(),
    created_at: integer().notNull(),
    tags: text(),
    metadata: text(),
  },
  (table) => [
    index("eval_run_suite_idx").on(table.suite_id),
    index("eval_run_created_idx").on(table.created_at),
  ],
)

export const EvalScenarioResultTable = sqliteTable(
  "eval_scenario_result",
  {
    id: text().primaryKey(),
    run_id: text().notNull().references(() => EvalRunTable.id),
    scenario_id: text().notNull(),
    scenario_name: text().notNull(),
    passed: integer({ mode: "boolean" }).notNull(),
    behaviors_matched: integer().notNull(),
    behaviors_total: integer().notNull(),
    duration_ms: integer().notNull(),
    tokens_used: integer().default(0),
    tool_calls: integer().default(0),
    errors: text(),
    output: text(),
    created_at: integer().notNull(),
  },
  (table) => [
    index("eval_scenario_run_idx").on(table.run_id),
    index("eval_scenario_id_idx").on(table.scenario_id),
  ],
)

export type EvalRunRow = typeof EvalRunTable.$inferSelect
export type EvalScenarioResultRow = typeof EvalScenarioResultTable.$inferSelect
