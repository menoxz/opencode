import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { ModelID } from "@/provider/schema"
import { Plugin } from "@/plugin"
import type { TaskPromptOps } from "@/tool/task"
import type { SecurityMode } from "@/tool/security"
import { type Tool as AITool, tool, jsonSchema, type ToolExecutionOptions, asSchema } from "ai"
import { Effect } from "effect"
import { MessageV2 } from "./message-v2"
import * as Session from "./session"
import { SessionProcessor } from "./processor"
import { PartID } from "./schema"
import * as Log from "@opencode-ai/core/util/log"
import { EffectBridge } from "@/effect/bridge"
import { Config } from "@/config/config"
import { ToolCatalog, type PreparedTool } from "./tool-catalog"
import { ToolExecutionMetadata } from "./tool-execution-metadata"
import { derivePhaseCapsule } from "./phase-capsule"

const log = Log.create({ service: "session.tools" })
const TOOL_SEARCH_ID = "tool_search"
const activations = new ToolCatalog.ActivationStore()
const LEAN_PHASE_CORE = {
  discovery: ["invalid", "inspect_batch", "read", "glob", "grep", "apply_patch", "edit", "write", "bash", "skill", "todowrite", "question", "task", "llm-memory-tool_memory_retrieve"],
  implementation: ["invalid", "inspect_batch", "read", "glob", "grep", "apply_patch", "edit", "write", "bash", "skill", "todowrite", "question", "task", "llm-memory-tool_memory_retrieve"],
  unknown: ["invalid", "inspect_batch", "read", "glob", "grep", "apply_patch", "edit", "write", "bash", "skill", "todowrite", "question", "task", "llm-memory-tool_memory_retrieve"],
} as const

export function leanPhaseCoreTools(phase: keyof typeof LEAN_PHASE_CORE) {
  return LEAN_PHASE_CORE[phase]
}

// Historical tool calls can reach the model as elided renderings, and a model that
// reproduces one executes a truncated command, patch or prompt with no visible sign
// of loss. The marker only ever terminates an elided value, so an argument ending in
// one is corruption rather than intent — refuse it and let the model resend.
const ELIDED_ARGUMENT = /(?:… \[\d+ chars\]|\[\+\d+ more items\])"/

function elidedArgument(args: Record<string, unknown>) {
  return ELIDED_ARGUMENT.test(JSON.stringify(args) ?? "")
}

export function deriveStrictToolAllowlist(rules: readonly { permission: string; action: string }[]) {
  if (!rules.some((rule) => rule.permission === "*" && rule.action === "deny")) return undefined
  return new Set(rules.filter((rule) => rule.permission !== "*" && rule.action === "allow").map((rule) => rule.permission))
}

export const SAFE_PARALLEL_LOCAL_TOOL_IDS = [
  "read",
  "glob",
  "grep",
  "inspect_batch",
  "repo_overview",
  "session_context",
  "session_info",
] as const

export const resolve = Effect.fn("SessionTools.resolve")(function* (input: {
  agent: Agent.Info
  model: Provider.Model
  session: Session.Info
  processor: Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall">
  bypassAgentCheck: boolean
  messages: MessageV2.WithParts[]
  promptOps: TaskPromptOps
  forceWriteTools?: boolean
  securityMode?: SecurityMode
  query?: string
  userTools?: Record<string, boolean>
}) {
  using _ = log.time("resolveTools")
  const tools: Record<string, AITool> = {}
  const run = yield* EffectBridge.make()
  const plugin = yield* Plugin.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const mcp = yield* MCP.Service
  const truncate = yield* Truncate.Service
  const config = yield* Config.Service
  const safeParallelLocal = new Set<string>(SAFE_PARALLEL_LOCAL_TOOL_IDS)
  const strictAllowlist = deriveStrictToolAllowlist(input.session.permission ?? [])

  type CatalogValue =
    | { source: "local"; item: Tool.Def; schema: ReturnType<typeof ProviderTransform.schema> }
    | { source: "mcp"; key: string; item: AITool; schema: ReturnType<typeof ProviderTransform.schema> }

  const cfg = yield* config.get()
  const hotPath = cfg.experimental?.hot_path
  const hotPathEnabled = hotPath?.enabled !== false
  const mcpVersion = mcp.catalogVersion ? yield* mcp.catalogVersion() : 0
  const registryVersion = yield* registry.catalogVersion()
  const catalogKey = [
    "v1",
    input.model.providerID,
    input.model.api.id,
    input.agent.name,
    JSON.stringify(input.agent.permission),
    input.securityMode ?? "interactive-tui",
    input.forceWriteTools ? "write" : "read",
    registryVersion,
    mcpVersion,
    strictAllowlist ? [...strictAllowlist].sort().join(",") : "all-tools",
  ].join(":")
  const preparedAt = Date.now()
  const prepared = yield* ToolCatalog.getPreparedEffect(
    registry,
    catalogKey,
    Effect.gen(function* () {
      const output: PreparedTool<CatalogValue>[] = []
      for (const item of yield* registry.tools({
        modelID: ModelID.make(input.model.api.id),
        providerID: input.model.providerID,
        agent: input.agent,
        forceWriteTools: input.forceWriteTools,
        securityMode: input.securityMode,
      })) {
        output.push({
          id: item.id,
          description: item.description,
          value: { source: "local", item, schema: ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item)) },
        })
      }
      for (const [key, item] of Object.entries(yield* mcp.tools())) {
        if (!item.execute) continue
        const schema = yield* Effect.promise(() => Promise.resolve(asSchema(item.inputSchema).jsonSchema))
        output.push({
          id: key,
          description: item.description ?? "",
          value: { source: "mcp", key, item, schema: ProviderTransform.schema(input.model, schema) },
        })
      }
      return output
    }),
  )
  const baseline = ToolCatalog.selectTools(prepared.catalog, input.query ?? "", {
    enabled: hotPathEnabled && hotPath?.jit_tools === true,
    threshold: hotPath?.tool_threshold,
    maxTools: hotPath?.max_tools,
    always: hotPath?.always_tools,
  })
  const dynamicMode = input.agent.name === "lean" ? (hotPath?.lean_dynamic_tools ?? "off") : "off"
  const rules = Permission.merge(input.agent.permission, input.session.permission ?? [])
  const denied = Permission.disabled(prepared.catalog.tools.map((item) => item.id), rules)
  const visibleCatalog = {
    ...prepared.catalog,
    tools: prepared.catalog.tools.filter((item) => !denied.has(item.id) && input.userTools?.[item.id] !== false),
  }
  const searchDenied = Permission.disabled([TOOL_SEARCH_ID], rules).has(TOOL_SEARCH_ID) || input.userTools?.[TOOL_SEARCH_ID] === false
  if (dynamicMode !== "off" && prepared.catalog.tools.some((item) => item.id === TOOL_SEARCH_ID))
    return yield* Effect.fail(new Error(`Reserved tool name collision: ${TOOL_SEARCH_ID}`))
  const phase = derivePhaseCapsule(input.messages).phase
  const core = leanPhaseCoreTools(phase)
  const configuredMax = hotPath?.max_tools ?? 14
  const sticky = activations.get(input.session.id)
  const requiredCount = new Set([...core, ...(hotPath?.always_tools ?? [])].filter((id) => visibleCatalog.tools.some((item) => item.id === id))).size + 1
  if (dynamicMode === "enforce" && !searchDenied && requiredCount > configuredMax)
    return yield* Effect.fail(new Error(`Lean dynamic tool cap ${configuredMax} is smaller than ${requiredCount} mandatory tools`))
  const proposed = ToolCatalog.selectTools(visibleCatalog, input.query ?? "", {
    enabled: dynamicMode !== "off",
    threshold: 0,
    maxTools: Math.max(1, configuredMax - 1),
    always: [...(hotPath?.always_tools ?? []), ...sticky],
    core,
    fallback: "core",
    requireCoverage: false,
  })
  const selection = dynamicMode === "enforce" && !searchDenied ? proposed : baseline
  log.info("hot path catalog", {
    version: prepared.catalog.version,
    cacheHit: prepared.hit,
    catalogTools: prepared.catalog.tools.length,
    selectedTools: selection.tools.length,
    selectionMode: selection.mode,
    selectionReason: selection.reason,
    dynamicMode,
    dynamicPhase: phase,
    proposedTools: proposed.tools.length,
    stickyTools: sticky.size,
    durationMs: Date.now() - preparedAt,
  })

  const context = (args: Record<string, unknown>, options: ToolExecutionOptions): Tool.Context => ({
    sessionID: input.session.id,
    abort: options.abortSignal!,
    messageID: input.processor.message.id,
    callID: options.toolCallId,
    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },
    agent: input.agent.name,
    messages: input.messages,
    metadata: (val) =>
      input.processor.updateToolCall(options.toolCallId, (match) => {
        if (!["running", "pending"].includes(match.state.status)) return match
        return {
          ...match,
          state: {
            title: val.title,
            metadata: val.metadata,
            status: "running",
            input: args,
            time: { start: Date.now() },
          },
        }
      }),
    ask: (req) =>
      permission
        .ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
        })
        .pipe(Effect.orDie),
  })

  for (const preparedTool of selection.tools) {
    if (preparedTool.value.source !== "local") continue
    const { item, schema } = preparedTool.value
    const wrapped = tool({
      description: item.description,
      inputSchema: jsonSchema(schema),
      execute(args, options) {
        const inputArgs = args as Record<string, unknown>
        return run.promise(
          Effect.gen(function* () {
            const ctx = context(inputArgs, options)
            if (elidedArgument(inputArgs))
              return yield* Effect.fail(
                new Error(
                  `Arguments for ${item.id} are truncated: they end with a context-elision marker instead of the real value. Resend the call with the complete arguments.`,
                ),
              )
            yield* plugin.trigger(
              "tool.execute.before",
              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
              { args: inputArgs },
            )
            const result = yield* item.execute(inputArgs, ctx)
            const output = {
              ...result,
              attachments: result.attachments?.map((attachment) => ({
                ...attachment,
                id: PartID.ascending(),
                sessionID: ctx.sessionID,
                messageID: input.processor.message.id,
              })),
            }
            yield* plugin.trigger(
              "tool.execute.after",
              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args: inputArgs },
              output,
            )
            if (options.abortSignal?.aborted) {
              yield* input.processor.completeToolCall(options.toolCallId, output)
            }
            return output
          }),
        )
      },
    })
    if (safeParallelLocal.has(item.id)) ToolExecutionMetadata.set(wrapped, { readOnlyHint: true })
    tools[item.id] = wrapped
  }

  for (const preparedTool of selection.tools) {
    if (preparedTool.value.source !== "mcp") continue
    const { key, item, schema } = preparedTool.value
    const execute = item.execute
    if (!execute) continue

    const wrapped: AITool = {
      ...item,
      inputSchema: jsonSchema(schema),
      execute: (args, opts) =>
      run.promise(
        Effect.gen(function* () {
          const ctx = context(args, opts)
          if (elidedArgument(args))
            return yield* Effect.fail(
              new Error(
                `Arguments for ${key} are truncated: they end with a context-elision marker instead of the real value. Resend the call with the complete arguments.`,
              ),
            )
          yield* plugin.trigger(
            "tool.execute.before",
            { tool: key, sessionID: ctx.sessionID, callID: opts.toolCallId },
            { args },
          )
          const result: Awaited<ReturnType<NonNullable<typeof execute>>> = yield* Effect.gen(function* () {
            yield* ctx.ask({ permission: key, metadata: {}, patterns: ["*"], always: ["*"] })
            return yield* Effect.promise(() => execute(args, opts))
          }).pipe(
            Effect.withSpan("Tool.execute", {
              attributes: {
                "tool.name": key,
                "tool.call_id": opts.toolCallId,
                "session.id": ctx.sessionID,
                "message.id": input.processor.message.id,
              },
            }),
          )
          yield* plugin.trigger(
            "tool.execute.after",
            { tool: key, sessionID: ctx.sessionID, callID: opts.toolCallId, args },
            result,
          )

          const textParts: string[] = []
          const attachments: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[] = []
          for (const contentItem of result.content) {
            if (contentItem.type === "text") textParts.push(contentItem.text)
            else if (contentItem.type === "image") {
              attachments.push({
                type: "file",
                mime: contentItem.mimeType,
                url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
              })
            } else if (contentItem.type === "resource") {
              const { resource } = contentItem
              if (resource.text) textParts.push(resource.text)
              if (resource.blob) {
                attachments.push({
                  type: "file",
                  mime: resource.mimeType ?? "application/octet-stream",
                  url: `data:${resource.mimeType ?? "application/octet-stream"};base64,${resource.blob}`,
                  filename: resource.uri,
                })
              }
            }
          }

          const truncated = yield* truncate.output(textParts.join("\n\n"), {}, input.agent)
          const metadata = {
            ...result.metadata,
            truncated: truncated.truncated,
            ...(truncated.truncated && { outputPath: truncated.outputPath }),
          }

          const output = {
            title: "",
            metadata,
            output: truncated.content,
            attachments: attachments.map((attachment) => ({
              ...attachment,
              id: PartID.ascending(),
              sessionID: ctx.sessionID,
              messageID: input.processor.message.id,
            })),
            content: result.content,
          }
          if (opts.abortSignal?.aborted) {
            yield* input.processor.completeToolCall(opts.toolCallId, output)
          }
          return output
        }),
      ),
    }
    // MCP annotations are protocol hints from an untrusted server. Keep them
    // serialized until a server-level trust policy is explicitly configured.
    ToolExecutionMetadata.set(wrapped, { destructiveHint: true })
    tools[key] = wrapped
  }

  if (dynamicMode === "enforce" && !searchDenied) {
    tools[TOOL_SEARCH_ID] = tool({
      description: "Activate a required missing capability for the next model step. Do not search for optional workflow, memory, todo, or reporting tools.",
      inputSchema: jsonSchema({
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 2, maxLength: 500 },
          limit: { type: "integer", minimum: 1, maximum: 8, default: 5 },
        },
      }),
      execute(args) {
        return run.promise(
          Effect.sync(() => {
            const value = args as { query: string; limit?: number }
            const slots = Math.max(0, configuredMax - requiredCount)
            const limit = Math.min(slots, Math.max(1, Math.min(8, value.limit ?? 5)))
            const matches = ToolCatalog.search(
              visibleCatalog,
              value.query.slice(0, 500),
              Math.min(32, limit + selection.tools.length),
            )
              .map((item) => item.id)
              .filter((id) => id !== TOOL_SEARCH_ID && !selection.tools.some((item) => item.id === id))
              .slice(0, limit)
            activations.activate(
              input.session.id,
              matches,
              Date.now(),
              slots,
              hotPath?.activation_ttl_ms,
            )
            return {
              title: "Tools activated",
              metadata: { activated: matches },
              output: JSON.stringify({ activated: matches, available: "next-model-step" }),
            }
          }),
        )
      },
    })
  }

  return tools
})

export * as SessionTools from "./tools"
