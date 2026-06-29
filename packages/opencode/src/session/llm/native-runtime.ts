import type { Auth } from "@/auth"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import * as Log from "@opencode-ai/core/util/log"
import { asSchema, type ModelMessage, type Tool } from "ai"
import { Effect } from "effect"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import { tool as nativeTool, ToolFailure, type JsonSchema, type LLMEvent } from "@opencode-ai/llm"
import type { LLMClientShape } from "@opencode-ai/llm/route"
import { LLMNative } from "./native-request"

const log = Log.create({ service: "session.llm.native-runtime" })

export type RuntimeStatus =
  | { readonly type: "supported"; readonly apiKey: string; readonly baseURL?: string }
  | { readonly type: "unsupported"; readonly reason: string }
export type StreamResult =
  | { readonly type: "supported"; readonly stream: Stream.Stream<LLMEvent, unknown> }
  | { readonly type: "unsupported"; readonly reason: string }

type Diagnostics = {
  readonly providerID: string
  readonly modelID: string
  readonly messageCount: number
  readonly toolCount: number
  readonly hasBaseURL: boolean
  readonly hasProviderOptions: boolean
  readonly headerNames: string[]
}

type StreamInput = {
  readonly model: Provider.Model
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly llmClient: LLMClientShape
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens?: number
  readonly providerOptions?: Record<string, any>
  readonly headers: Record<string, string>
  readonly abort: AbortSignal
}

export function status(input: Pick<StreamInput, "model" | "provider" | "auth">): RuntimeStatus {
  return statusWithFetch(input, providerFetch(input))
}

function statusWithFetch(
  input: Pick<StreamInput, "model" | "provider" | "auth">,
  fetch: typeof globalThis.fetch | undefined,
): RuntimeStatus {
  const providerID = input.model.providerID
  if (providerID !== "openai" && providerID !== "anthropic" && !providerID.startsWith("opencode"))
    return { type: "unsupported", reason: "provider is not openai, opencode, or anthropic" }
  const npm = input.model.api.npm
  if (npm !== "@ai-sdk/openai" && npm !== "@ai-sdk/openai-compatible" && npm !== "@ai-sdk/anthropic")
    return { type: "unsupported", reason: "provider package is not OpenAI, OpenAI-compatible, or Anthropic" }
  if (input.auth?.type === "oauth" && !(input.provider.id === "openai" && fetch)) {
    return { type: "unsupported", reason: "OAuth auth requires a provider fetch override" }
  }

  const apiKey = typeof input.provider.options.apiKey === "string" ? input.provider.options.apiKey : input.provider.key
  if (!apiKey) return { type: "unsupported", reason: "API key is not configured" }

  return {
    type: "supported",
    apiKey,
    baseURL: typeof input.provider.options.baseURL === "string" ? input.provider.options.baseURL : undefined,
  }
}

export function stream(input: StreamInput): StreamResult {
  const fetch = providerFetch(input)
  const current = statusWithFetch(input, fetch)
  if (current.type === "unsupported") return current

  // Integration point with @opencode-ai/llm: native-request lowers session data
  // into an LLMRequest, then LLMClient handles route selection and transport.
  //
  // ProviderTransform.providerOptions builds AI-SDK-shaped options for the
  // selected SDK key (e.g. "openai") and the native LLM SDK reads the same
  // keys via OpenAIOptions.* (store, reasoningEffort, reasoningSummary,
  // include, textVerbosity, promptCacheKey). Both sides intentionally use
  // OpenAI's official wire field names, so this is identity, not translation
  // — if a field ever needs to differ between the two surfaces, the
  // translation belongs here, not split across both packages.
  const diagnostics = streamDiagnostics(input, current)
  const started = Date.now()
  log.debug("native stream request", diagnostics)
  let stream: Stream.Stream<LLMEvent, unknown>
  try {
    stream = input.llmClient
      .stream({
        request: LLMNative.request({
          model: input.model,
          apiKey: current.apiKey,
          baseURL: current.baseURL,
          messages: ProviderTransform.message(input.messages, input.model, input.providerOptions ?? {}),
          toolChoice: input.toolChoice,
          temperature: input.temperature,
          topP: input.topP,
          topK: input.topK,
          maxOutputTokens: input.maxOutputTokens,
          providerOptions: ProviderTransform.providerOptions(input.model, input.providerOptions ?? {}),
          headers: { ...providerHeaders(input.provider.options.headers), ...input.headers },
        }),
        tools: nativeTools(input.tools, input),
      })
      .pipe(
        Stream.tapError((error) =>
          Effect.sync(() => {
            log.error("native stream failed", {
              ...diagnostics,
              duration: Date.now() - started,
              error: sanitizeError(error),
            })
          }),
        ),
        Stream.ensuring(
          Effect.sync(() => {
            log.debug("native stream closed", { ...diagnostics, duration: Date.now() - started })
          }),
        ),
      )
  } catch (error) {
    log.error("native stream setup failed", {
      ...diagnostics,
      duration: Date.now() - started,
      error: sanitizeError(error),
    })
    throw error
  }
  log.debug("native stream prepared", { ...diagnostics, duration: Date.now() - started })

  return {
    ...current,
    stream: fetch ? stream.pipe(Stream.provideService(FetchHttpClient.Fetch, fetch)) : stream,
  }
}

function providerFetch(input: Pick<StreamInput, "provider" | "auth">): typeof globalThis.fetch | undefined {
  if (input.provider.id !== "openai" || input.auth?.type !== "oauth") return undefined
  const value: unknown = input.provider.options.fetch
  if (typeof value !== "function") return undefined
  return value as typeof globalThis.fetch
}

function providerHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

function streamDiagnostics(input: StreamInput, runtime: Extract<RuntimeStatus, { type: "supported" }>): Diagnostics {
  return {
    providerID: input.provider.id,
    modelID: input.model.id,
    messageCount: input.messages.length,
    toolCount: Object.keys(input.tools).length,
    hasBaseURL: runtime.baseURL !== undefined,
    hasProviderOptions: Object.keys(input.providerOptions ?? {}).length > 0,
    headerNames: [...new Set([...Object.keys(providerHeaders(input.provider.options.headers) ?? {}), ...Object.keys(input.headers)])],
  }
}

function sanitizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redact(error.message),
      stack: error.stack ? redact(error.stack) : undefined,
      cause: error.cause === undefined ? undefined : sanitizeCause(error.cause),
    }
  }
  return { message: redact(errorMessage(error)) }
}

function sanitizeCause(cause: unknown): unknown {
  if (cause instanceof Error) return { name: cause.name, message: redact(cause.message) }
  if (isRecord(cause)) {
    return Object.fromEntries(
      Object.entries(cause).map(([key, value]) => [key, isSecretKey(key) ? "[redacted]" : sanitizeCauseValue(value)]),
    )
  }
  return sanitizeCauseValue(cause)
}

function sanitizeCauseValue(value: unknown): unknown {
  if (typeof value === "string") return redact(value)
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(sanitizeCauseValue)
  if (isRecord(value)) return sanitizeCause(value)
  return String(value)
}

function isSecretKey(key: string): boolean {
  return /authorization|api[-_]?key|token|secret|password/i.test(key)
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(api[-_]?key|token|secret|password)(["'\s:=]+)([^"'\s,;}]+)/gi, "$1$2[redacted]")
}

function nativeSchema(value: unknown): JsonSchema {
  if (!value || typeof value !== "object") return { type: "object", properties: {} }
  if ("jsonSchema" in value && value.jsonSchema && typeof value.jsonSchema === "object")
    return value.jsonSchema as JsonSchema
  return asSchema(value as Parameters<typeof asSchema>[0]).jsonSchema as JsonSchema
}

export function nativeTools(tools: Record<string, Tool>, input: Pick<StreamInput, "messages" | "abort">) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, item]) => [
      name,
      // Tool execution remains opencode-owned. The native runtime only adapts
      // the @opencode-ai/llm tool call back into the AI SDK Tool.execute shape.
      nativeTool({
        description: item.description ?? "",
        jsonSchema: nativeSchema(item.inputSchema),
        execute: (args: unknown, ctx) =>
          Effect.tryPromise({
            try: () => {
              if (!item.execute) throw new Error(`Tool has no execute handler: ${name}`)
              return item.execute(args, {
                toolCallId: ctx?.id ?? name,
                messages: input.messages,
                abortSignal: input.abort,
              })
            },
            catch: (error) => new ToolFailure({ message: errorMessage(error), error }),
          }),
      }),
    ]),
  )
}

export * as LLMNativeRuntime from "./native-runtime"
