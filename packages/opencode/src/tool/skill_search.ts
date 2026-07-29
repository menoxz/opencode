import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { rankDocuments } from "@/memory/search"
import { Skill } from "../skill"
import * as Tool from "./tool"
import DESCRIPTION from "./skill_search.txt"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "What you are trying to do, in natural language. Symptoms, error strings and domain words all work.",
  }),
  limit: Schema.optional(
    Schema.Number.annotate({ description: "Maximum number of skills to return. Defaults to 10, capped at 30." }),
  ),
})

/**
 * The system prompt only lists the skills BM25 judged relevant to the last user
 * message (30 of them here, out of 186 on disk). Everything else is loadable but
 * unnameable: `skill` resolves any installed skill, yet the agent has no way to
 * learn that `airtable` or `ci-cd-setup` exist. This tool closes that gap by
 * searching the full catalogue on demand.
 */
export const SkillSearchTool = Tool.define(
  "skill_search",
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const agents = yield* Agent.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const limit = Math.min(Math.max(params.limit ?? 10, 1), 30)
          const list = yield* skill.available(yield* agents.get(ctx.agent))
          const ranked = rankDocuments(
            params.query,
            list.map((item) => ({
              id: item.name,
              // The description is a one-liner written before anyone knew how the
              // user would phrase the need; the body carries the real vocabulary.
              content: `${item.name} ${item.description ?? ""} ${item.content
                .replace(/```[\s\S]*?```/g, " ")
                .replace(/https?:\/\/\S+/g, " ")
                .replace(/\s+/g, " ")
                .slice(0, 2000)}`,
              importance: 1,
              confidence: 1,
            })),
            limit,
          ).filter((item) => item.score > 0)

          const byName = new Map(list.map((item) => [item.name, item]))
          const lines = ranked.map((item, index) => {
            const info = byName.get(item.id)
            return `${index + 1}. ${item.id}  (score ${item.score.toFixed(3)})\n   ${info?.description ?? "(no description)"}`
          })

          return {
            title: `skill_search: ${ranked.length}/${list.length} matched`,
            output:
              ranked.length === 0
                ? [
                    `No skill matched "${params.query}" among ${list.length} installed skills.`,
                    "Try domain words, the exact error string, or a synonym.",
                  ].join("\n")
                : [
                    `${ranked.length} of ${list.length} installed skills match "${params.query}":`,
                    "",
                    ...lines,
                    "",
                    `Load one with skill({ name: "${ranked[0]!.id}" }).`,
                  ].join("\n"),
            metadata: { total: list.length, matched: ranked.length, names: ranked.map((item) => item.id) },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
