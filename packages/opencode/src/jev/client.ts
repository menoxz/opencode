import { Effect, Schema, SchemaIssue } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { JevSchema } from "./schema"

export const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
export const DEFAULT_MODEL = "jev-latest"

/**
 * Environment variables checked before `config.jev.api_key`. Keeping the
 * secret in the environment is the documented default: opencode validates
 * config strictly and config files are routinely committed.
 */
export const ENV_KEYS = ["JEV_API_KEY", "TYPESAFE_API_KEY"] as const

export type Settings = {
  endpoint?: string
  api_key?: string
  model?: string
}

export function apiKey(settings?: Settings, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of ENV_KEYS) {
    const value = env[name]
    if (value) return value
  }
  return settings?.api_key
}

export class NotConfiguredError extends Schema.TaggedErrorClass<NotConfiguredError>()("JevNotConfiguredError", {}) {
  override get message() {
    return `Jev is not configured. Set ${ENV_KEYS.join(" or ")}, or \`jev.api_key\` in opencode.json, to use the Jev decision model.`
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

  const outbound = yield* HttpClientRequest.post(settings?.endpoint ?? DEFAULT_ENDPOINT).pipe(
    HttpClientRequest.accept("application/json"),
    HttpClientRequest.setHeaders({ authorization: `Bearer ${key}` }),
    HttpClientRequest.schemaBodyJson(JevSchema.Request)({
      ...request,
      model: request.model ?? settings?.model ?? DEFAULT_MODEL,
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
