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

/**
 * The only provider this build talks to.
 *
 * The historical resolution (provider preset, then `TYPESAFE_BASE_URL` /
 * `TYPESAFE_MODEL`, then the `TYPESAFE_*` / `JEV_*` keys, then the presets) left
 * four ways to pick a host and a key independently, and this environment exercises
 * the worst of them: `TYPESAFE_API_KEY` is set and answers HTTP 401 on both
 * `api.typesafe.ai` and the Command Code Provider API, so the cascade picked a dead
 * key on every call and every caller degraded to its fallback without anyone seeing
 * why. Host, model and key are now pinned together, and `typesafe/jev` is served by
 * Command Code only.
 */
export const PROVIDER = "command-code" as const

/**
 * The single environment variable that can authenticate a Jev call.
 *
 * Deliberately a literal rather than a lookup in the old `PROVIDER_ENV_KEYS` table:
 * the lock must not depend on a table that can grow a second host again.
 */
export const PROVIDER_ENV_KEY = "COMMAND_CODE_API_KEY" as const

/**
 * True only for a host the Command Code Provider API serves.
 *
 * The check is on the host, not the string: a path, a trailing slash or another
 * scheme is the same provider, while a different host is not — and pointing a
 * `typesafe/jev` request anywhere else 404s on every call.
 */
export function isProviderHost(value: string | undefined): boolean {
  return value !== undefined && host(value) === host(COMMAND_CODE_BASE_URL)
}

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
 * Command Code GOAT rejects a single System One call carrying more than this
 * many questions ("at most 20 questions per call"). A selector asks one closed
 * question per candidate, and both the skill catalogue (~200) and the tool
 * candidate pool exceed it, so every selection must be split into
 * request-sized batches — otherwise the endpoint answers HTTP 400 and the
 * caller silently falls back to its lexical ranking.
 */
export const MAX_QUESTIONS_PER_CALL = 20

/** Split `items` into batches of at most `size`, so no Jev call exceeds the endpoint's cap. */
export function chunks<T>(items: readonly T[], size: number = MAX_QUESTIONS_PER_CALL): T[][] {
  if (size <= 0) return items.length > 0 ? [[...items]] : []
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size) as T[])
  return out
}

export type Settings = {
  provider?: Provider
  base_url?: string
  endpoint?: string
  api_key?: string
  model?: string
}

/**
 * The Command Code key, and only the Command Code key.
 *
 * `COMMAND_CODE_API_KEY` first, then an explicit `jev.api_key` for a config that
 * carries its own secret. The `TYPESAFE_*` and `JEV_*` variables are no longer
 * consulted: they authenticate hosts this build does not call, and accepting one
 * would trade a loud 401 for a silent fallback.
 */
export function apiKey(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const scoped = env[PROVIDER_ENV_KEY]
  if (scoped) return scoped
  return settings?.api_key
}

function host(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined
  return new URL(value).host
}

/**
 * The Command Code Provider API host.
 *
 * An explicit `base_url` is honoured only when it already points at Command Code;
 * any other host is refused and the preset wins. `TYPESAFE_BASE_URL` is no longer
 * consulted, for the same reason the key is pinned.
 */
export function baseUrl(settings?: Settings, _env: NodeJS.ProcessEnv = process.env): string {
  if (isProviderHost(settings?.base_url)) return settings!.base_url!
  return COMMAND_CODE_BASE_URL
}

/**
 * A base URL and the model that belongs to it are resolved together, so
 * switching host — an explicit `provider` preset, `base_url`, or the
 * environment — never leaves a model id pointed at a host that does not serve it.
 */
export function resolveModel(settings?: Settings, _env: NodeJS.ProcessEnv = process.env): string {
  return settings?.model ?? COMMAND_CODE_MODEL
}

export function resolveEndpoint(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string {
  if (isProviderHost(settings?.endpoint)) return settings!.endpoint!
  return `${baseUrl(settings, env).replace(/\/+$/, "")}/v1/systemone`
}

export class NotConfiguredError extends Schema.TaggedErrorClass<NotConfiguredError>()("JevNotConfiguredError", {}) {
  override get message() {
    return `Jev is not configured. Set ${PROVIDER_ENV_KEY}, or \`jev.api_key\` in opencode.json, to use the Jev decision model.`
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
