import { Effect, Schema, SchemaIssue } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { JevSchema } from "./schema"

/** TypeSafe production host. */
export const DEFAULT_BASE_URL = "https://api.typesafe.ai"
export const DEFAULT_MODEL = "jev-latest"

/** Codiv serves an open System One model (OpenJev) behind the same wire API. */
export const OPENJEV_BASE_URL = "https://api.codiv.ai"
export const OPENJEV_MODEL = "openjev-latest"

/** Command Code GOAT re-exports TypeSafe Jev on its Provider API. */
export const COMMAND_CODE_BASE_URL = "https://api.commandcode.ai/provider"
export const COMMAND_CODE_MODEL = "typesafe/jev"

export const BASE_URL_ENV = "TYPESAFE_BASE_URL"
export const MODEL_ENV = "TYPESAFE_MODEL"

export const Provider = Schema.Literals(["typesafe", "openjev", "command-code"]).annotate({
  identifier: "JevProvider",
})
export type Provider = Schema.Schema.Type<typeof Provider>

/**
 * A provider pins the base URL and the model id together: `typesafe/jev` only
 * exists on the Command Code Provider API and `openjev-latest` only on Codiv,
 * so switching host without switching model would 404 on every call.
 */
export const PROVIDERS: Record<Provider, { base_url: string; model: string }> = {
  typesafe: { base_url: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
  openjev: { base_url: OPENJEV_BASE_URL, model: OPENJEV_MODEL },
  "command-code": { base_url: COMMAND_CODE_BASE_URL, model: COMMAND_CODE_MODEL },
}

/**
 * Environment variables checked before `config.jev.api_key`. Keeping the
 * secret in the environment is the documented default: opencode validates
 * config strictly and config files are routinely committed.
 */
export const ENV_KEYS = ["TYPESAFE_API_KEY", "JEV_API_KEY"] as const

/**
 * Each provider has its own secret: a `typesafe` key is rejected by the
 * Command Code API and vice-versa. A `provider` preset therefore reads its own
 * variable first — otherwise a stale `TYPESAFE_API_KEY` in the environment
 * would be sent to the wrong host and fail with HTTP 401 — and only then falls
 * back to the generic keys.
 */
export const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  typesafe: ENV_KEYS[0],
  openjev: ENV_KEYS[1],
  "command-code": "COMMAND_CODE_API_KEY",
}

export type Settings = {
  provider?: Provider
  base_url?: string
  endpoint?: string
  api_key?: string
  model?: string
}

export function apiKey(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (settings?.provider) {
    const scoped = env[PROVIDER_ENV_KEYS[settings.provider]]
    if (scoped) return scoped
  }
  for (const name of ENV_KEYS) {
    const value = env[name]
    if (value) return value
  }
  return settings?.api_key
}

function host(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined
  return new URL(value).host
}

function preset(settings?: Settings) {
  return settings?.provider ? PROVIDERS[settings.provider] : undefined
}

export function baseUrl(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string {
  return settings?.base_url ?? env[BASE_URL_ENV] ?? preset(settings)?.base_url ?? DEFAULT_BASE_URL
}

/**
 * A base URL and the model that belongs to it are resolved together, so
 * switching host — an explicit `provider` preset, `base_url`, or the
 * environment — never leaves a model id pointed at a host that does not serve it.
 */
export function resolveModel(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string {
  const resolved = host(baseUrl(settings, env))
  const byHost =
    resolved === host(COMMAND_CODE_BASE_URL)
      ? COMMAND_CODE_MODEL
      : resolved === host(OPENJEV_BASE_URL)
        ? OPENJEV_MODEL
        : DEFAULT_MODEL
  return settings?.model ?? env[MODEL_ENV] ?? preset(settings)?.model ?? byHost
}

export function resolveEndpoint(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string {
  return settings?.endpoint ?? `${baseUrl(settings, env).replace(/\/+$/, "")}/v1/systemone`
}

export class NotConfiguredError extends Schema.TaggedErrorClass<NotConfiguredError>()("JevNotConfiguredError", {}) {
  override get message() {
    const keys = [...new Set([...ENV_KEYS, ...Object.values(PROVIDER_ENV_KEYS)])]
    return `Jev is not configured. Set ${keys.join(" or ")}, or \`jev.api_key\` in opencode.json, to use the Jev decision model.`
  }
}

export class ApiError extends Schema.TaggedErrorClass<ApiError>()("JevApiError", {
  status: Schema.Number,
  detail: Schema.String,
}) {
  override get message() {
    return this.status === 0
      ? `Jev request failed: ${this.detail}`
      : `Jev request failed with HTTP ${this.status}: ${this.detail}`
  }
}

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()("JevDecodeError", {
  detail: Schema.String,
}) {
  override get message() {
    return `Jev returned a payload that does not match the System One schema: ${this.detail}`
  }
}

export type Error = NotConfiguredError | ApiError | DecodeError

function describeIssue(error: unknown): string {
  if (!Schema.isSchemaError(error)) return String(error)
  return SchemaIssue.makeFormatterStandardSchemaV1()(error.issue)
    .issues.map((issue) => `${(issue.path ?? []).map(String).join(".")}: ${issue.message}`)
    .join("; ")
}

/**
 * Single System One call. `http` is passed in rather than yielded so callers
 * that already hold an HttpClient (tools) or must stay requirement-free
 * (permission policy) can both reuse it without changing their layer graph.
 */
export const decide = Effect.fn("Jev.decide")(function* (
  http: HttpClient.HttpClient,
  request: JevSchema.Request,
  settings?: Settings,
) {
  const key = apiKey(settings)
  if (!key) return yield* new NotConfiguredError()

  const outbound = yield* HttpClientRequest.post(resolveEndpoint(settings)).pipe(
    HttpClientRequest.accept("application/json"),
    HttpClientRequest.setHeaders({ authorization: `Bearer ${key}` }),
    HttpClientRequest.schemaBodyJson(JevSchema.Request)({
      ...request,
      model: request.model ?? resolveModel(settings),
    }),
    Effect.mapError((error) => new DecodeError({ detail: describeIssue(error) })),
  )

  const response = yield* http
    .execute(outbound)
    .pipe(Effect.mapError((error) => new ApiError({ status: 0, detail: describeIssue(error) })))

  if (response.status < 200 || response.status >= 300) {
    const detail = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
    return yield* new ApiError({ status: response.status, detail: detail.slice(0, 500) })
  }

  return yield* HttpClientResponse.schemaBodyJson(JevSchema.Response)(response).pipe(
    Effect.mapError((error) => new DecodeError({ detail: describeIssue(error) })),
  )
})

export * as JevClient from "./client"
