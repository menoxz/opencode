import { Effect, Schema } from "effect"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import type { MessageV2 } from "@/session/message-v2"
import * as Tool from "./tool"

const Parameters = Schema.Struct({})

type AssistantInfo = Extract<MessageV2.Info, { role: "assistant" }>

function tokenTotal(tokens: AssistantInfo["tokens"]): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function lastAssistantWithTokens(messages: MessageV2.WithParts[]): AssistantInfo | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i].info
    if (info.role !== "assistant") continue
    if (tokenTotal(info.tokens) <= 0) continue
    return info
  }
}

export function aggregateAgentMetrics(items: Array<Pick<Session.Info, "agent" | "cost" | "tokens">>) {
  const out: Record<string, { sessions: number; cost: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }> = {}
  for (const item of items) {
    const key = item.agent ?? "unknown"
    const row = out[key] ??= { sessions: 0, cost: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
    row.sessions++
    row.cost += item.cost ?? 0
    row.input += item.tokens?.input ?? 0
    row.output += item.tokens?.output ?? 0
    row.reasoning += item.tokens?.reasoning ?? 0
    row.cacheRead += item.tokens?.cache.read ?? 0
    row.cacheWrite += item.tokens?.cache.write ?? 0
  }
  return out
}

function totalCost(messages: MessageV2.WithParts[]): number {
  return messages.reduce((sum, msg) => sum + (msg.info.role === "assistant" ? msg.info.cost : 0), 0)
}

function formatTokens(tokens: AssistantInfo["tokens"]) {
  return {
    total: tokenTotal(tokens),
    providerTotal: tokens.total,
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
  }
}

function formatTokensPerSecond(input: { output: number; created?: number; completed?: number }) {
  if (!input.created || !input.completed || input.completed <= input.created || input.output <= 0) return undefined
  const value = input.output / ((input.completed - input.created) / 1000)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return value >= 10 ? Math.round(value) : Number(value.toFixed(1))
}

function formatRuntime() {
  const memory = process.memoryUsage()
  return {
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
    },
  }
}

const resolveContext = Effect.fn("SessionInfo.resolveContext")(function* (input: {
  sessions: Session.Interface
  providers: Provider.Interface
  sessionID: Tool.Context["sessionID"]
}) {
  const [session, messages] = yield* Effect.all([
    input.sessions.get(input.sessionID).pipe(Effect.orDie),
    input.sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie),
  ])
  const last = lastAssistantWithTokens(messages)
  const providerID = last?.providerID ?? session.model?.providerID
  const modelID = last?.modelID ?? session.model?.id
  const model = providerID && modelID
    ? yield* input.providers.getModel(providerID, modelID).pipe(Effect.option)
    : undefined
  const modelValue = model?._tag === "Some" ? model.value : undefined
  const tokens = last ? formatTokens(last.tokens) : undefined
  const max = modelValue?.limit.context
  const usedPercent = tokens && max ? Math.round((tokens.total / max) * 100) : undefined
  return {
    session,
    messages,
    lastAssistant: last,
    model: modelValue,
    context: tokens
      ? {
          current: tokens.total,
          max,
          usedPercent,
          tokens,
          tokensPerSecond: formatTokensPerSecond({
            output: last!.tokens.output,
            created: last!.time.created,
            completed: last!.time.completed,
          }),
        }
      : undefined,
  }
})

type ContextMetadata = {
  current?: number
  max?: number
  usedPercent?: number
}

export const SessionContextTool = Tool.define<typeof Parameters, ContextMetadata, Session.Service | Provider.Service>(
  "session_context",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const providers = yield* Provider.Service
    return {
      description:
        "Show the current session context metrics in real time, using the same message/provider data as the TUI: current tokens, model context max, percent used, cost, and tok/s.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          const resolved = yield* resolveContext({ sessions, providers, sessionID: ctx.sessionID })
          const output = {
            model: resolved.model
              ? {
                  id: resolved.model.id,
                  name: resolved.model.name,
                  providerID: resolved.model.providerID,
                  contextMax: resolved.model.limit.context,
                }
              : undefined,
            context: resolved.context ?? null,
            cost: {
              sessionTotal: totalCost(resolved.messages),
            },
            source: "last assistant message tokens + provider model.limit.context (same data path as TUI)",
          }
          return {
            title: resolved.context
              ? `${resolved.context.current.toLocaleString()} tokens (${resolved.context.usedPercent ?? "?"}%)`
              : "context metrics unavailable",
            output: JSON.stringify(output, null, 2),
            metadata: {
              current: resolved.context?.current,
              max: resolved.context?.max,
              usedPercent: resolved.context?.usedPercent,
            },
          }
        }),
    }
  }),
)

type InfoMetadata = {
  sessionID: string
  messageCount: number
  subAgentCount: number
}

export const SessionInfoTool = Tool.define<typeof Parameters, InfoMetadata, Session.Service | Provider.Service>(
  "session_info",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const providers = yield* Provider.Service
    return {
      description:
        "Show real-time session information on demand: session id/title/model, context metrics, cumulative session tokens, sub-agents, opencode version, PID, uptime, and memory.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          const resolved = yield* resolveContext({ sessions, providers, sessionID: ctx.sessionID })
          const children = yield* sessions.children(ctx.sessionID)
          const cumulative = resolved.session.tokens
            ? {
                input: resolved.session.tokens.input,
                output: resolved.session.tokens.output,
                reasoning: resolved.session.tokens.reasoning,
                cacheRead: resolved.session.tokens.cache.read,
                cacheWrite: resolved.session.tokens.cache.write,
                total:
                  resolved.session.tokens.input + resolved.session.tokens.output + resolved.session.tokens.reasoning,
              }
            : undefined
          const output = {
            opencode: { version: InstallationVersion },
            runtime: formatRuntime(),
            session: {
              id: resolved.session.id,
              title: resolved.session.title,
              parentID: resolved.session.parentID,
              agent: resolved.session.agent,
              goalState: resolved.session.goalState,
              createdAt: resolved.session.time.created,
              updatedAt: resolved.session.time.updated,
            },
            model: resolved.model
              ? {
                  id: resolved.model.id,
                  name: resolved.model.name,
                  providerID: resolved.model.providerID,
                  contextMax: resolved.model.limit.context,
                  outputMax: resolved.model.limit.output,
                  capabilities: resolved.model.capabilities,
                }
              : undefined,
            context: resolved.context ?? null,
            tokens: {
              latestTurn: resolved.context?.tokens,
              sessionCumulative: cumulative,
            },
            cost: {
              sessionTotal: totalCost(resolved.messages),
              storedSessionCost: resolved.session.cost ?? 0,
            },
            messages: { count: resolved.messages.length },
            subAgentMetrics: aggregateAgentMetrics(children),
            subAgents: children.map((child) => ({
              id: child.id,
              agent: child.agent,
              title: child.title,
              createdAt: child.time.created,
            })),
          }
          return {
            title: `session ${resolved.session.id}`,
            output: JSON.stringify(output, null, 2),
            metadata: {
              sessionID: resolved.session.id,
              messageCount: resolved.messages.length,
              subAgentCount: children.length,
            },
          }
        }),
    }
  }),
)
