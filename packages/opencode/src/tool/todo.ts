import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION_WRITE from "./todowrite.txt"
import { Todo } from "../session/todo"
import { Skill } from "@/skill"
import { Agent } from "@/agent/agent"
import { rankDocuments } from "@/memory/search"

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

type Metadata = {
  todos: Todo.Info[]
}

export const TodoWriteTool = Tool.define<typeof Parameters, Metadata, Todo.Service | Skill.Service | Agent.Service>(
  "todowrite",
  Effect.gen(function* () {
    const todo = yield* Todo.Service
    const skill = yield* Skill.Service
    const agents = yield* Agent.Service

    return {
      description: DESCRIPTION_WRITE,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "todowrite",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          // ── Auto-inject prefix/suffix tasks ──
          const hasResearchTask = params.todos.some((t) =>
            t.content.startsWith("[RECHERCHE]"),
          )
          const hasClotureTask = params.todos.some((t) =>
            t.content.startsWith("[CLÔTURE]"),
          )

          const prefixTasks: Array<{ content: string; status: string; priority: string }> = []
          const suffixTasks: Array<{ content: string; status: string; priority: string }> = []

          if (!hasResearchTask) {
            prefixTasks.push({
              content:
                "[RECHERCHE] Rechercher si sujet inconnu ou récent (via websearch / skill research-auto)",
              status: "pending",
              priority: "high",
            })
          }
          if (!hasClotureTask) {
            suffixTasks.push({
              content:
                "[CLÔTURE] git commit si code modifié | memory_store si décision/architecture | évaluer qualité (tests, typecheck) | extraire skill si tâche récurrente",
              status: "pending",
              priority: "medium",
            })
          }

          const allTodos = [...prefixTasks, ...params.todos, ...suffixTasks]

          yield* todo.update({
            sessionID: ctx.sessionID,
            todos: allTodos,
          })

          // Auto-detect matching skills for pending/in-progress tasks
          let skillSuggestion = ""
          const agentInfo = yield* agents.get(ctx.agent)
          const allSkills = yield* skill.available(agentInfo)
          if (allSkills.length > 0) {
            const todoText = params.todos
              .filter((t) => t.status === "pending" || t.status === "in_progress")
              .map((t) => `${t.content} ${t.priority}`)
              .join(" ")
            if (todoText) {
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
              const matched = boosted.filter((r) => r.score > 0).slice(0, 5)
              if (matched.length > 0) {
                const note = "⚠️  Auto-suggestion may miss relevant skills — verify the list and browse skills/ if needed."
                skillSuggestion = [
                  "",
                  "── Skill Suggestions ──",
                  ...matched.map((m) => `  • ${m.id} — load with skill("${m.id}")`),
                  "──────────────────────",
                  note,
                ].join("\n")
              }
            }
          }

          return {
            title: `${allTodos.filter((x) => x.status !== "completed").length} todos`,
            output: JSON.stringify(allTodos, null, 2) + skillSuggestion,
            metadata: {
              todos: allTodos,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
