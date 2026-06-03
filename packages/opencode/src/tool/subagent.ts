import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import DESCRIPTION from "./subagent.txt"

export const Parameters = Schema.Struct({})

type Metadata = {
  count: number
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

export const SubagentListTool = Tool.define<typeof Parameters, Metadata, Session.Service>(
  "subagent_list",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const children = yield* sessions.children(ctx.sessionID)
          const now = Date.now()

          if (children.length === 0) {
            return {
              title: "0 sub-agents",
              output: "<subagents count=\"0\">\n  No sub-agents found for this session.\n</subagents>",
              metadata: { count: 0 },
            }
          }

          const formatTime = (ts: number) =>
            new Date(ts).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })

          const items = children
            .map((child) => {
              const runningFor = now - child.time.created
              return {
                id: child.id,
                agent: child.agent ?? "unknown",
                title: child.title,
                created: formatTime(child.time.created),
                running_for: formatDuration(runningFor),
                running_ms: runningFor,
              }
            })
            // Most recent first
            .sort((a, b) => b.running_ms - a.running_ms)

          const lines = items.map(
            (item) =>
              `  <subagent id="${item.id}" agent="${item.agent}" running="${item.running_for}" created="${item.created}">${item.title}</subagent>`,
          )

          return {
            title: `${children.length} sub-agent(s)`,
            output: [`<subagents count="${children.length}">`, ...lines, "</subagents>"].join("\n"),
            metadata: { count: children.length },
          }
        }),
    }
  }),
)
