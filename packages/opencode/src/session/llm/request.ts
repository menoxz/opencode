import type { Auth } from "@/auth"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "../message-v2"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { SystemPrompt } from "../system"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Option, Record } from "effect"
import { jsonSchema, tool as aiTool, type ModelMessage, type Tool } from "ai"
import type { Plugin } from "@/plugin"
import { mergeDeep } from "remeda"
import { SelfImprove } from "@/self-improve"
import { WorkingState } from "../working-state"
import { Config } from "@/config/config"
import { HttpClient } from "effect/unstable/http"
import { JevContext } from "@/jev/context"
import { JevGuard } from "@/jev/guard"
import { JevPlan } from "@/jev/plan"
import { JevRoute } from "@/jev/route"
import * as JevState from "@/jev/state"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session.llm.request" })

const USER_AGENT = `opencode/${InstallationVersion}`

type PrepareInput = {
  readonly user: MessageV2.User
  readonly sessionID: string
  readonly parentSessionID?: string
  readonly model: Provider.Model
  readonly agent: Agent.Info
  readonly permission?: Permission.Ruleset
  readonly system: string[]
  readonly messages: ModelMessage[]
  readonly small?: boolean
  readonly tools: Record<string, Tool>
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly plugin: Plugin.Interface
  readonly flags: RuntimeFlags.Info
  readonly isWorkflow: boolean
  /** First step of a session turn — lifts the output token cap. */
  readonly firstStep?: boolean
  readonly workingState?: string
}

export type Prepared = {
  readonly system: string[]
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly params: {
    readonly temperature?: number
    readonly topP?: number
    readonly topK?: number
    readonly maxOutputTokens?: number
    readonly options: Record<string, any>
  }
  readonly messageTransformOptions: Record<string, any>
  readonly headers: Record<string, string>
}

const mergeOptions = (target: Record<string, any>, source: Record<string, any> | undefined): Record<string, any> =>
  mergeDeep(target, source ?? {}) as Record<string, any>

const approxSize = (value: unknown) => JSON.stringify(value)?.length ?? 0

const summarizeMessages = (messages: ModelMessage[]) => ({
  count: messages.length,
  approxChars: approxSize(messages),
  roles: messages.reduce(
    (acc, message) => {
      acc[message.role] = (acc[message.role] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  ),
})

export const prepare = Effect.fn("LLMRequestPrep.prepare")(function* (input: PrepareInput) {
  const isOpenaiOauth = input.provider.id === "openai" && input.auth?.type === "oauth"
  const system = [
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    ...input.system,
    ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x)

  yield* input.plugin.trigger(
    "experimental.chat.system.transform",
    { sessionID: input.sessionID, model: input.model },
    { system },
  )
  // Jev context injection happens after the plugin transform so a plugin always
  // sees the base prompt, and the block the model reads is the final word. It is
  // absent unless Jev produced state this turn, so a disabled run is unchanged.
  const jevService = Option.getOrUndefined(yield* Effect.serviceOption(Config.Service))
  const jevHttp = Option.getOrUndefined(yield* Effect.serviceOption(HttpClient.HttpClient))
  const jev = jevService ? (yield* jevService.get()).jev : undefined
  const lastUser = input.messages
    .toReversed()
    .flatMap((message) => (message.role === "user" && typeof message.content === "string" ? [message.content] : []))
    .find((text) => text.trim().length > 0)
  if (jevHttp && jev?.route?.enabled === true && lastUser) {
    const decision = yield* JevRoute.route(jevHttp, jev, {
      prompt: lastUser,
      baseThreshold: jev.guard?.threshold ?? JevGuard.DEFAULT_THRESHOLD,
    }).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (decision) {
      JevState.setRoute(input.sessionID, decision)
      log.info("jev route decision", { sessionID: input.sessionID, ...decision })
    }
  }
  // The plan is drawn once per user turn, not once per step, and never for a
  // utility call: the title agent goes through this same preparation with
  // `small: true`, and drawing a plan there would both spend a round-trip on a
  // prompt the model never sees as a task and leave the session holding a plan
  // drawn for the wrong request.
  if (jevHttp && jev?.plan?.enabled === true && lastUser && input.small !== true) {
    const fingerprint = JevState.fingerprint(lastUser)
    if (JevState.currentPlan(input.sessionID)?.fingerprint !== fingerprint) {
      const decision = yield* JevPlan.plan(jevHttp, jev, { prompt: lastUser, fingerprint }).pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (decision) {
        JevState.setPlan(input.sessionID, decision)
        log.info("jev plan decision", {
          sessionID: input.sessionID,
          shape: decision.shape,
          steps: decision.steps.join(","),
        })
      }
    }
  }
  // Rebuilt from this turn's state, so it travels with the injected tail instead
  // of the cached system segment (see provider/transform.ts for the cache anchor).
  const jevBlock = jev
    ? JevContext.block({ sessionID: input.sessionID, rules: jev.rules, threshold: jev.guard?.threshold })
    : undefined
  const variant =
    !input.small && input.model.variants && input.user.model.variant
      ? input.model.variants[input.user.model.variant]
      : {}
  const base = input.small
    ? ProviderTransform.smallOptions(input.model)
    : ProviderTransform.options({
        model: input.model,
        sessionID: input.sessionID,
        providerOptions: input.provider.options,
      })
  const options = mergeOptions(mergeOptions(mergeOptions(base, input.model.options), input.agent.options), variant)
  if (isOpenaiOauth) options.instructions = system.join("\n")

  const messages =
    isOpenaiOauth || input.isWorkflow
      ? input.messages
      : [
          ...system.map(
            (x): ModelMessage => ({
              role: "system",
              content: x,
            }),
          ),
          ...input.messages,
        ]

  let params = yield* input.plugin.trigger(
    "chat.params",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      temperature: input.model.capabilities.temperature
        ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
        : undefined,
      topP: input.agent.topP ?? ProviderTransform.topP(input.model),
      topK: ProviderTransform.topK(input.model),
      maxOutputTokens: input.firstStep
        ? input.model.limit.output
        : ProviderTransform.maxOutputTokens(input.model, input.flags.outputTokenMax),
      options,
    },
  )

  const selfImprove = yield* Effect.serviceOption(SelfImprove.Service).pipe(Effect.map(Option.getOrUndefined))
  if (selfImprove && !input.small && input.agent.name !== "general") {
    const learned = yield* selfImprove
      .getOptimalParams(input.agent.name, `${input.model.providerID}/${input.model.id}`, params)
      .pipe(Effect.catch(() => Effect.succeed({ ...params, confidence: 0 })))
    params = SelfImprove.applyLearnedParams(params, learned)
  }

  const { headers } = yield* input.plugin.trigger(
    "chat.headers",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      headers: {},
    },
  )

  const tools = resolveTools(input)
  if (
    input.model.providerID.includes("github-copilot") &&
    Object.keys(tools).length === 0 &&
    hasToolCalls(input.messages)
  ) {
    // Copilot needs a tools field when replaying prior tool calls, even if no tools are currently enabled.
    tools["_noop"] = aiTool({
      description: "Do not call this tool. It exists only for API compatibility and must never be invoked.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          reason: { type: "string", description: "Unused" },
        },
      }),
      execute: async () => ({ output: "", title: "", metadata: {} }),
    })
  }

  const sortedTools = Object.fromEntries(Object.entries(tools).toSorted(([a], [b]) => a.localeCompare(b)))
  const isOpencodeProvider = input.model.providerID.startsWith("opencode")
  const opencodeProjectID = isOpencodeProvider ? (yield* InstanceState.context).project.id : undefined
  const resolvedHeaders = {
    ...(isOpencodeProvider
      ? {
          ...(opencodeProjectID ? { "x-opencode-project": opencodeProjectID } : {}),
          "x-opencode-session": input.sessionID,
          "x-opencode-request": input.user.id,
          "x-opencode-client": input.flags.client,
          "User-Agent": USER_AGENT,
        }
      : {
          "x-session-affinity": input.sessionID,
          ...(input.parentSessionID ? { "x-parent-session-id": input.parentSessionID } : {}),
          "User-Agent": USER_AGENT,
        }),
    ...input.model.headers,
    ...headers,
  }

  const toolNames = Object.keys(sortedTools)
  const toolPrefixKey = toolNames.join("\u001f")
  const headerNames = Object.keys(resolvedHeaders)
  const diagnostics = {
    provider: input.provider.id,
    model: input.model.id,
    sessionID: input.sessionID,
    small: input.small === true,
    isWorkflow: input.isWorkflow === true,
    openaiOauth: isOpenaiOauth,
    system: {
      count: system.length,
      approxChars: approxSize(system),
      headerApproxChars: approxSize(system[0]),
    },
    messages: summarizeMessages(messages),
    tools: {
      count: toolNames.length,
      approxChars: approxSize(sortedTools),
      names: toolNames,
      prefixKey: toolPrefixKey,
    },
    params: {
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      maxOutputTokens: params.maxOutputTokens,
      optionsApproxChars: approxSize(params.options),
    },
    headers: {
      count: headerNames.length,
      customCount: Object.keys(headers).length,
      names: headerNames,
    },
    messageTransformOptions: {
      keys: Object.keys(options),
    },
  }
  yield* Effect.logDebug("prepared LLM request payload").pipe(Effect.annotateLogs({ "llm.request": diagnostics }))

  const injectedTail = [input.workingState, jevBlock]
    .filter((entry): entry is string => entry !== undefined)
    .join("\n\n")
  return {
    system,
    messages: input.isWorkflow ? messages : WorkingState.attach(messages, injectedTail),
    tools: sortedTools,
    params,
    messageTransformOptions: options,
    headers: resolvedHeaders,
  }
})

function resolveTools(input: Pick<PrepareInput, "tools" | "agent" | "permission" | "user">) {
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}

export function hasToolCalls(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue
    for (const part of msg.content) {
      if (part.type === "tool-call" || part.type === "tool-result") return true
    }
  }
  return false
}

export * as LLMRequestPrep from "./request"
