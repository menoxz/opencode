/**
 * The decision models a Jev host serves on its System One endpoint.
 *
 * The `/decision-model` picker lists harness chat models, which is exactly `provider.list`: a
 * Jev host is not a chat provider, so nothing from `https://api.codiv.ai` can ever appear there
 * — measured 2026-10-11, `POST /v1/chat/completions` with `openjev-latest` answers HTTP 404
 * ("Model 'openjev-latest' not found. Available: diffusiongemma-26b"), while `POST
 * /v1/systemone` with the same id answers HTTP 200. A user who expects "the OpenJev model" in
 * that list therefore finds nothing, and the model he picks instead silently replaces the Jev
 * transport entirely (`src/jev/harness.ts`).
 *
 * This module gives that second transport its own catalogue, so the models that *are* decision
 * models become selectable:
 *
 *   1. the host itself — `GET <base_url>/v1/models`, which Codiv serves (7 models measured
 *      2026-10-11: `openjev-latest`, `openjev-0.1`, `diffusiongemma-26b`, `laya-1.0`,
 *      `verdict-1.4`, `clm-v0.1`, `jevk5-0.2`);
 *   2. the preset's documented models, used when the host cannot be listed (no key, offline, or
 *      a host that only implements `/v1/systemone`).
 *
 * Both are advisory: the picker only needs names to offer, and the wire call stays the judge.
 */
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { JevClient } from "./client"

export type Model = {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/**
 * A model the host itself describes as served by `/v1/chat/completions`.
 *
 * Codiv lists its generation model next to its decision models, and pointing `jev.model` at it
 * would 404 on every System One call and leave the hook on its silent fallback — the exact
 * failure this catalogue exists to make visible. Dropped by description rather than by id, so a
 * future generation model is filtered the same way.
 */
const CHAT_COMPLETIONS = /chat\/completions/i

/**
 * Bound on the host listing.
 *
 * The picker asks for this list when it opens: a host that accepts the connection and never
 * answers must not leave the section loading forever.
 */
export const HOST_TIMEOUT_MS = 10_000

/** Hosts' documented decision models, used when the host itself cannot be listed. */
export const PRESET_MODELS: Record<JevClient.Provider, readonly Model[]> = {
  openjev: [
    {
      id: JevClient.OPENJEV_MODEL,
      name: "OpenJev (Codiv)",
      description: "Alias for the newest OpenJev release, served by POST /v1/systemone.",
    },
    {
      id: "openjev-0.1",
      name: "OpenJev 0.1",
      description: "DiffusionGemma 26B-A4B (NVFP4) read as typed decisions.",
    },
  ],
  "opencode-zen": [
    { id: JevClient.OPENCODE_ZEN_MODEL, name: "Jev 1.13 (OpenCode Zen, free)" },
    { id: "jev-1.13", name: "Jev 1.13 (OpenCode Zen)" },
  ],
  "command-code": [{ id: JevClient.COMMAND_CODE_MODEL, name: "TypeSafe Jev (Command Code GOAT)" }],
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * The decision models named by a host's `/v1/models` reply, or `undefined` when it names none.
 *
 * Accepts both catalogues a Jev host may serve: Codiv's `{models:[{name,description}]}` (where
 * `name` *is* the model id) and the OpenAI-compatible `{data:[{id,name}]}`. A model whose own
 * description says it is served at `/v1/chat/completions` is dropped — see
 * {@link CHAT_COMPLETIONS}. Pure, so the shapes are testable without a host.
 */
export function parseHostModels(payload: unknown): Model[] | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const record = payload as Record<string, unknown>
  const list = Array.isArray(record.models) ? record.models : Array.isArray(record.data) ? record.data : undefined
  if (!list) return undefined

  const models: Model[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const item = entry as Record<string, unknown>
    // `id` first: an OpenAI-compatible entry may carry a human label in `name`, and the id is
    // what the wire call must send. Codiv ships only `name`, which plays both roles.
    const id = text(item.id) ?? text(item.name)
    if (!id || seen.has(id)) continue
    const description = text(item.description)
    if (description && CHAT_COMPLETIONS.test(description)) continue
    seen.add(id)
    models.push({ id, name: text(item.name) ?? id, ...(description ? { description } : {}) })
  }
  return models.length > 0 ? models : undefined
}

/**
 * The models the host lists, or `undefined` when it does not list them.
 *
 * Never fails, and never hangs: an unreachable host, a rejected key, an HTTP error, a payload
 * without a model, or a host that does not answer within the bound all name none, and the caller
 * keeps the preset's documented models.
 */
export const listHostModels = Effect.fnUntraced(function* (
  http: HttpClient.HttpClient,
  input: { baseUrl: string; apiKey: string },
) {
  const url = `${input.baseUrl.replace(/\/+$/, "")}/v1/models`
  const request = HttpClientRequest.get(url).pipe(
    HttpClientRequest.acceptJson,
    HttpClientRequest.setHeaders({ authorization: `Bearer ${input.apiKey}` }),
  )
  const response = yield* http
    .execute(request)
    .pipe(Effect.timeout(HOST_TIMEOUT_MS), Effect.orElseSucceed(() => undefined))
  if (!response || response.status < 200 || response.status >= 300) return undefined
  const payload = yield* HttpClientResponse.schemaBodyJson(Schema.Unknown)(response).pipe(
    Effect.orElseSucceed(() => undefined),
  )
  return parseHostModels(payload)
})

export * as JevCatalogue from "./catalogue"
