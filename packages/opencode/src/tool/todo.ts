import { Effect, Schema, Semaphore } from "effect"
import * as Tool from "./tool"
import DESCRIPTION_WRITE from "./todowrite.txt"
import { Todo } from "../session/todo"
import { Skill } from "@/skill"
import { Agent } from "@/agent/agent"
import { rankDocuments } from "@/memory/search"
import { mandatoryKind, renderTodoDelta, renderTodoSnapshot, substantiveTodoText, todoDelta, todoRevision, type TodoOutput } from "./todo-output"

// Todo.Info is still a zod schema (session/todo.ts). Inline the field shape
// here rather than referencing its `.shape` — the LLM-visible JSON Schema is
// identical, and it removes the last zod dependency from this tool.
const TodoItem = Schema.Struct({
  content: Schema.String.annotate({ description: "Brief description of the task" }),
  status: Schema.String.annotate({
    description: "Current status of the task: pending, in_progress, completed, cancelled",
  }),
  priority: Schema.String.annotate({ description: "Priority level of the task: high, medium, low" }),
})

// ---------------------------------------------------------------------------
// Name-overlap boost — leverages skill names themselves as keyword sources.
// No hardcoded mapping needed: the skill name IS the keyword map.
// ---------------------------------------------------------------------------

/**
 * Boost skills whose name tokens overlap with the TODO text.
 *
 * Uses EXACT token matching with simple morphological variants (plural -s)
 * to avoid false positives from coincidental substrings ("pr" in "après").
 *
 * How it works:
 *   `secret-vault` → name tokens ["secret", "vault"]
 *   TODO tokens     → ["configurer", "secrets", "production"]
 *   "secret" matches "secrets" via plural-stripping → boost = 1/2 * 3.0 = 1.5
 *
 * This is:
 *  - Scalable: works for ANY skill, present or future — no code changes needed
 *  - Plural-aware: "secret" ↔ "secrets", "test" ↔ "tests"
 *  - Language-agnostic: skill names are kebab-case English, matching both FR and EN
 *  - Data-driven: the skill's own name is the source of truth
 */
function nameOverlapBoost(todoText: string, skillName: string): number {
  const todoTokens = new Set(
    todoText.toLowerCase().split(/[^\p{L}\p{N}_#@$%]+/u).filter(Boolean),
  )
  const nameTokens = skillName.toLowerCase().split("-")
  let matchCount = 0
  for (const nameToken of nameTokens) {
    if (nameToken.length < 2) continue
    // Exact match
    if (todoTokens.has(nameToken)) { matchCount++; continue }
    // Plural → singular: try without trailing "s" ("tests" → "test")
    if (nameToken.endsWith("s") && todoTokens.has(nameToken.slice(0, -1))) { matchCount++; continue }
    // Singular → plural: try with trailing "s" ("test" → "tests")
    if (todoTokens.has(nameToken + "s")) { matchCount++; continue }
  }
  if (matchCount === 0) return 0
  // Strong boost to overcome BM25 bias toward French descriptions.
  // A single name-token match guarantees the skill appears in top suggestions.
  return (matchCount / nameTokens.length) * 20.0
}

export const Parameters = Schema.Struct({
  todos: Schema.mutable(Schema.Array(TodoItem)).annotate({ description: "The updated todo list" }),
})

// Keep the legacy replacement schema export stable for existing consumers.
export const InputParameters = Schema.Struct({
  todos: Schema.optional(Schema.mutable(Schema.Array(TodoItem))).annotate({ description: "Full replacement; omit for updates/read" }),
  updates: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    content: Schema.optional(Schema.String),
    status: Schema.optional(Schema.Literals(["pending", "in_progress", "completed", "cancelled"])),
    priority: Schema.optional(Schema.Literals(["high", "medium", "low"])),
  }))),
  revision: Schema.optional(Schema.String).annotate({ description: "Exact snapshot revision required with updates; IDs valid only for matching revision" }),
  action: Schema.optional(Schema.Literal("read")).annotate({ description: "Recover full list, IDs and revision without writing; no other fields" }),
})

type Metadata = {
  todos: Todo.Info[]
  todoOrder: { scope: string; sequence: number }
  todoOutput: TodoOutput
  truncated: false
}

export const TodoWriteTool = Tool.define<typeof InputParameters, Metadata, Todo.Service | Skill.Service | Agent.Service>(
  "todowrite",
  Effect.gen(function* () {
    const todo = yield* Todo.Service
    const skill = yield* Skill.Service
    const agents = yield* Agent.Service
    // Registry resolves this outer effect once; per-turn init() copies retain this lock.
    // One bounded lock also serializes full replacements against targeted updates.
    const lock = yield* Semaphore.make(1)
    const scope = crypto.randomUUID()
    let sequence = 0

    return {
      description: DESCRIPTION_WRITE,
      parameters: InputParameters,
      execute: (params: Schema.Schema.Type<typeof InputParameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          if (params.action === "read"
            ? params.todos !== undefined || params.updates !== undefined || params.revision !== undefined
            : (params.todos === undefined) === (params.updates === undefined)) {
            return yield* Effect.fail(new Error("Supply exactly one of todos or updates, or action='read' alone."))
          }
          if (params.todos !== undefined && params.revision !== undefined) {
            return yield* Effect.fail(new Error("revision is only accepted with updates."))
          }
          yield* ctx.ask({
            permission: "todowrite",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const snapshot = yield* lock.withPermits(1)(Effect.gen(function* () {
            const before = yield* todo.get(ctx.sessionID)
            if (params.action === "read") return { before, todos: before, delta: todoDelta(before, before), order: { scope, sequence: ++sequence } }
            const updates = params.updates
            if (updates !== undefined) {
              if (params.revision !== todoRevision(before)) {
                return yield* Effect.fail(new Error("Stale or missing todo revision. Use action='read'; update IDs valid only for matching revision."))
              }
              const ids = new Set(before.map((_, i) => `t${i}`))
              const seen = new Set<string>()
              for (const update of updates) {
                if (!ids.has(update.id) || seen.has(update.id)) {
                  return yield* Effect.fail(new Error(`Unknown or duplicate todo ID: ${update.id}. Use action='read'.`))
                }
                if (update.content === undefined && update.status === undefined && update.priority === undefined) {
                  return yield* Effect.fail(new Error(`Empty update: ${update.id}; supply content, status or priority.`))
                }
                seen.add(update.id)
              }
            }
            const proposed = params.todos ?? before.map((t, i) => {
              const update = updates?.find((u) => u.id === `t${i}`)
              return {
                content: update?.content ?? t.content,
                status: update?.status ?? t.status,
                priority: update?.priority ?? t.priority,
              }
            })
            if (updates && before.some((t, i) => mandatoryKind(t.content) && mandatoryKind(proposed[i].content) !== mandatoryKind(t.content))) {
              return yield* Effect.fail(new Error("Mandatory research/closure tasks cannot be removed or relabelled."))
            }
            const mandatory = (kind: "research" | "close", content: string, priority: string) => {
              if (proposed.some((t) => mandatoryKind(t.content) === kind)) return []
              const saved = before.filter((t) => mandatoryKind(t.content) === kind)
              return saved.length ? saved : [{ content, status: "pending", priority }]
            }
            const allTodos = updates ? proposed : [
              ...mandatory("research", "[RESEARCH] Research uncertainties; load applicable skills before acting.", "high"),
              ...proposed,
              ...mandatory("close", "[CLOSE] Verify quality; retain useful learning; extract reusable skills; commit only if requested.", "medium"),
            ]
            if (allTodos.some((t) => mandatoryKind(t.content) && t.status === "cancelled")) {
              return yield* Effect.fail(new Error("Mandatory research/closure tasks cannot be cancelled."))
            }
            const delta = todoDelta(before, allTodos)
            if (!delta.noOp) yield* todo.update({ sessionID: ctx.sessionID, todos: allTodos })
            return { before, todos: allTodos, delta, order: { scope, sequence: ++sequence } }
          }))

          let skillSuggestion = ""
          const todoText = substantiveTodoText(snapshot.before, snapshot.todos)
          if (todoText) {
            const agentInfo = yield* agents.get(ctx.agent)
            const allSkills = yield* skill.available(agentInfo)
            if (allSkills.length > 0) {
              const docs = allSkills.map((s) => ({
                id: s.name,
                content: `${s.name} ${s.description ?? ""}`,
                importance: 1.0 as const,
                confidence: 1.0 as const,
              }))
              // Phase 1: BM25 pure relevance scoring (generous top-K)
              const ranked = rankDocuments(todoText, docs, 50)
              // Phase 2: Name-overlap boost — matches any skill name token against TODO text
              const boosted = ranked.map((r) => ({
                ...r,
                score: r.score + nameOverlapBoost(todoText, r.id),
              }))
              boosted.sort((a, b) => b.score - a.score)
              const matched = boosted.filter((r) => r.score > 0).slice(0, 3)
              if (matched.length > 0) {
                skillSuggestion = `\nSkills: ${matched.map((m) => `skill(${m.id})`).join(", ")}`
              }
            }
          }

          return {
            title: `${snapshot.delta.summary.pending + snapshot.delta.summary.in_progress + snapshot.delta.summary.other} active todos`,
            output: (params.action === "read" ? renderTodoSnapshot({ todos: snapshot.todos }) ?? "" : renderTodoDelta(snapshot.delta)) + skillSuggestion,
            metadata: {
              todos: snapshot.todos,
              todoOrder: snapshot.order,
              todoOutput: snapshot.delta,
              truncated: false as const,
            },
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof InputParameters, Metadata>
  }),
)
