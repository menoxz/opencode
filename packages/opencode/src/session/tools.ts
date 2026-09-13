import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { isLeanAgent, LEAN_DYNAMIC_SLOT_MARGIN } from "@/tool/lean-output-policy"
import { ModelID } from "@/provider/schema"
import { Plugin } from "@/plugin"
import type { TaskPromptOps } from "@/tool/task"
import type { SecurityMode } from "@/tool/security"
import { type Tool as AITool, tool, jsonSchema, type ToolExecutionOptions, asSchema } from "ai"
import { Cause, Effect, Exit } from "effect"
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
import * as Environment from "./environment"
import { environmentStateEnabled } from "./environment"
import * as Progress from "./progress"
import { isActiveGoal } from "./goal-state"

const log = Log.create({ service: "session.tools" })
const TOOL_SEARCH_ID = "tool_search"
// The tools that move a live objective forward. A model that cannot reach them
// can only assert completion in prose — the exact failure this harness exists to
// prevent — so they are pinned whenever a goal is active (see `core` below).
const GOAL_LIFECYCLE_TOOLS = ["edit_objective", "complete_objective"] as const
const activations = new ToolCatalog.ActivationStore()
// The lean catalog ships these tools plus `tool_search`; tool_search is told
// not to chase core capabilities, so a missing write tool is unreachable. The
// memory policy mandates store/update/delete/consolidate, hence their presence
// here next to the hot-path retrieve.
const LEAN_CORE_TOOLS = [
  "invalid",
  "inspect_batch",
  "read",
  "glob",
  "grep",
  "apply_patch",
  "edit",
  "write",
  "bash",
  "skill",
  "todowrite",
  "question",
  "task",
  "llm-memory-tool_memory_retrieve",
  "llm-memory-tool_memory_store",
  "llm-memory-tool_memory_update",
  "llm-memory-tool_memory_delete",
  "llm-memory-tool_memory_consolidate",
] as const
const LEAN_PHASE_CORE = {
  discovery: LEAN_CORE_TOOLS,
  implementation: LEAN_CORE_TOOLS,
  unknown: LEAN_CORE_TOOLS,
} as const

export function leanPhaseCoreTools(phase: keyof typeof LEAN_PHASE_CORE) {
  return LEAN_PHASE_CORE[phase]
}

// Composition of the always-present core set. Kept pure so the pinning rules —
// notably "a live objective keeps its lifecycle tools" — are testable without
// standing up the whole tool resolver.
export function leanCoreTools(input: {
  phase: keyof typeof LEAN_PHASE_CORE
  environmentState: boolean
  goalActive: boolean
}): string[] {
  return [
    ...LEAN_PHASE_CORE[input.phase],
    ...(input.environmentState ? ["environment"] : []),
    ...(input.goalActive ? GOAL_LIFECYCLE_TOOLS : []),
  ]
}

// The cap must leave room for dynamic activations, not merely fit the mandatory
// tools: with max_tools=14 and 12 mandatory tools only one MCP slot was left and
// every tool_search evicted the previous activation.
export function leanDynamicCapVerdict(input: { configuredMax: number; requiredCount: number }) {
  const minimum = input.requiredCount + LEAN_DYNAMIC_SLOT_MARGIN
  if (input.configuredMax >= minimum) return { ok: true as const, minimum }
  return {
    ok: false as const,
    minimum,
    reason: `Lean dynamic tool cap ${input.configuredMax} is too small: ${input.requiredCount} mandatory tools + ${LEAN_DYNAMIC_SLOT_MARGIN} dynamic slots require at least ${minimum} (hot_path.max_tools)`,
  }
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
          source: "local",
          value: { source: "local", item, schema: ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item)) },
        })
      }
      // MCP ids are `sanitize(server)_sanitize(tool)`; matching the connected
      // server identities against that prefix is exact, unlike splitting on the
      // first underscore, which a server or tool name containing one breaks.
      const mcpServers = Object.keys(cfg.mcp ?? {})
        .map((name) => MCP.sanitize(name))
        .toSorted((a, b) => b.length - a.length)
      for (const [key, item] of Object.entries(yield* mcp.tools())) {
        if (!item.execute) continue
        const schema = yield* Effect.promise(() => Promise.resolve(asSchema(item.inputSchema).jsonSchema))
        output.push({
          id: key,
          description: item.description ?? "",
          source: "mcp",
          server: mcpServers.find((name) => key.startsWith(`${name}_`)),
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
  const dynamicMode = isLeanAgent(input.agent) ? (hotPath?.lean_dynamic_tools ?? "off") : "off"
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
  const environmentState = environmentStateEnabled({
    agentFlag: input.agent.environment_state,
    configFlag: hotPath?.environment_state,
  })
  // The environment ledger joins the lean core only when the config or agent gate
  // is on; otherwise the shipped max_tools cap and selection stay unchanged.
  // A live objective must stay closable: the model needs edit_objective and
  // complete_objective even when tool_search finds nothing, so they are pinned
  // into the core set (and counted in requiredCount) whenever a goal is active,
  // independent of dynamic selection and eviction.
  const core = leanCoreTools({ phase, environmentState, goalActive: isActiveGoal(input.session.goalState) })
  const configuredMax = hotPath?.max_tools ?? 14
  const sticky = activations.get(input.session.id)
  const requiredCount = new Set([...core, ...(hotPath?.always_tools ?? [])].filter((id) => visibleCatalog.tools.some((item) => item.id === id))).size + 1
  const cap = leanDynamicCapVerdict({ configuredMax, requiredCount })
  if (dynamicMode === "enforce" && !searchDenied && !cap.ok) return yield* Effect.fail(new Error(cap.reason))
  const proposed = ToolCatalog.selectTools(visibleCatalog, input.query ?? "", {
    enabled: dynamicMode !== "off",
    threshold: 0,
    maxTools: Math.max(1, configuredMax - 1),
    // Most recent activation first: when stickies exceed the free slots the
    // ones the model just asked for must win over stale ones.
    always: [...(hotPath?.always_tools ?? []), ...[...sticky].reverse()],
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
            activations.promote(input.session.id, item.id)
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
          const startedAt = Date.now()
          const relevant = Environment.isEnvironmentTool(key, args)
          const scope = Environment.inferScope(args, key)
          const tracked = environmentState && relevant
          const decision = tracked
            ? Progress.progressFor(input.session.id).guard({ name: key, args })
            : ({ kind: "allow", repeats: 0 } as const)
          if (decision.kind === "block") {
            return {
              title: `Blocked repeated action: ${key}`,
              metadata: { environmentState: "blocked" },
              output: decision.message ?? "Repeated action blocked.",
              attachments: [],
              content: [],
            }
          }
          const outcome = yield* Effect.gen(function* () {
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
            Effect.exit,
          )
          if (Exit.isFailure(outcome)) {
            // The action may or may not have reached its target: record an
            // unknown outcome instead of letting the model assume it failed.
            const unknown = Environment.recordUnknownOutcome(Environment.ledgerFor(input.session.id), {
              name: key,
              args,
              at: startedAt,
              relevant,
              cause: Cause.pretty(outcome.cause),
            })
            if (tracked) {
              Progress.progressFor(input.session.id).observe({
                name: key,
                args,
                scope,
                truth: unknown.truth,
                summary: unknown.summary,
                at: unknown.at,
              })
            }
            return yield* Effect.failCause(outcome.cause)
          }
          const result: Awaited<ReturnType<NonNullable<typeof execute>>> = outcome.value
          activations.promote(input.session.id, key)
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
          const observation = Environment.recordToolResult(Environment.ledgerFor(input.session.id), {
            name: key,
            args,
            at: startedAt,
            relevant,
            attachmentCount: attachments.length,
            result,
          })
          if (tracked) {
            Progress.progressFor(input.session.id).observe({
              name: key,
              args,
              scope,
              truth: observation.truth,
              summary: observation.summary,
              at: observation.at,
            })
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
      description:
        "Reach a tool the lean catalog did not expose. mode=search (default) finds one by natural language, mode=browse lists the authorized catalog when search misses, mode=activate loads exact tool ids. Activation applies to the next model step. Do not search for optional workflow, todo, or reporting tools.",
      inputSchema: jsonSchema({
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["search", "browse", "activate"], default: "search" },
          query: { type: "string", minLength: 2, maxLength: 500 },
          ids: { type: "array", items: { type: "string" }, maxItems: 8 },
          source: { type: "string", enum: ["local", "mcp"] },
          server: { type: "string" },
          cursor: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 8, default: 5 },
        },
      }),
      execute(args) {
        return run.promise(
          Effect.sync(() => {
            const value = args as {
              mode?: "search" | "browse" | "activate"
              query?: string
              ids?: string[]
              source?: "local" | "mcp"
              server?: string
              cursor?: string
              limit?: number
            }
            const limit = Math.max(1, Math.min(8, value.limit ?? 5))
            const current = new Set(selection.tools.map((item) => item.id))
            // Dynamic slots the next selection can actually expose: the cap minus
            // the mandatory core and the tool_search slot, minus what sticky
            // activations already occupy. Anything past this budget is reported,
            // never promised, because selectTools slices sticky ids to the same
            // free-slot count.
            const slots = Math.max(0, configuredMax - requiredCount - activations.get(input.session.id).size)
            const reserve = (candidates: { id: string; match?: string }[], prefix: Record<string, unknown>[] = []) => {
              let slotsLeft = slots
              const reserved = candidates.map((entry) => {
                if (slotsLeft <= 0) return { id: entry.id, state: "capacity_exceeded" as const, match: entry.match }
                slotsLeft--
                return { id: entry.id, state: "reserved" as const, match: entry.match }
              })
              const ids = reserved.flatMap((result) => (result.state === "reserved" ? [result.id] : []))
              // Sticky activations are the model's only escape hatch to reach MCP
              // tools when mandatory tools saturate the cap, so grant headroom
              // above the cap instead of silently evicting the activations.
              if (ids.length > 0)
                activations.activate(input.session.id, ids, Date.now(), configuredMax + ids.length, hotPath?.activation_ttl_ms)
              return {
                title: "Tools activated",
                metadata: { mode: value.mode ?? "search", activated: ids },
                output: JSON.stringify({
                  activated: ids,
                  results: [...prefix, ...reserved],
                  available: "next-model-step",
                  capacity: { max: configuredMax, mandatory: requiredCount, dynamic: Math.max(0, configuredMax - requiredCount) },
                }),
              }
            }

            if (value.mode === "browse") {
              const page = ToolCatalog.browse(visibleCatalog, {
                source: value.source,
                server: value.server,
                cursor: value.cursor,
                limit,
              })
              return {
                title: "Tool catalog page",
                metadata: { mode: "browse", total: page.total },
                output: JSON.stringify({
                  mode: "browse",
                  total: page.total,
                  tools: page.tools.map((item) => ({
                    id: item.id,
                    description: item.description,
                    state: current.has(item.id) ? "already_available" : "available",
                  })),
                  next_cursor: page.nextCursor,
                }),
              }
            }

            if (value.mode === "activate") {
              const requested = (value.ids ?? []).map((id) => id.trim()).filter(Boolean).slice(0, limit)
              const pending: { id: string; match?: string }[] = []
              const unresolved = requested.flatMap<Record<string, unknown>>((id) => {
                if (id === TOOL_SEARCH_ID || current.has(id)) return [{ id, state: "already_available" }]
                const resolved = ToolCatalog.resolveExact(visibleCatalog, id)
                if (!resolved) return [{ id, state: "not_available" }]
                if ("ambiguous" in resolved)
                  return [{ id, state: "ambiguous", candidates: resolved.ambiguous.map((item) => item.id) }]
                pending.push({ id: resolved.tool.id, match: resolved.match })
                return []
              })
              return reserve(pending, unresolved)
            }

            const matches = ToolCatalog.rankMatches(
              visibleCatalog,
              (value.query ?? "").slice(0, 500),
              Math.min(32, limit + current.size),
            )
              .filter((match) => match.tool.id !== TOOL_SEARCH_ID)
              .slice(0, limit)
            return reserve(
              matches.flatMap((match) => (current.has(match.tool.id) ? [] : [{ id: match.tool.id, match: match.reason }])),
              matches.flatMap<Record<string, unknown>>((match) =>
                current.has(match.tool.id) ? [{ id: match.tool.id, state: "already_available", match: match.reason }] : [],
              ),
            )
          }),
        )
      },
    })
  }

  return tools
})

export * as SessionTools from "./tools"
