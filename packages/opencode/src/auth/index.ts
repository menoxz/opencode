import path from "path"
import { Effect, Layer, Record, Result, Schema, Context } from "effect"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Global } from "@opencode-ai/core/global"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

const file = path.join(Global.Path.data, "auth.json")

const fail = (message: string) => (cause: unknown) => new AuthError({ message, cause })

export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  // Mutable array: the generated SDK types `keys?: Array<string>`, and a
  // `readonly string[]` here would fail to assign to them at the boundary.
  keys: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown]).annotate({ discriminator: "type", identifier: "Auth" })
export type Info = Schema.Schema.Type<typeof Info>

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export interface Interface {
  readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthError>
  readonly all: () => Effect.Effect<Record<string, Info>, AuthError>
  readonly set: (key: string, info: Info) => Effect.Effect<void, AuthError>
  readonly remove: (key: string) => Effect.Effect<void, AuthError>
  // Ordered pool of API keys for a provider. `add` never overwrites an existing
  // key (the whole point: a second key must not clobber the first), `list` returns
  // them in priority order, `removeAt` drops exactly one by its position.
  readonly addApiKey: (
    providerID: string,
    key: string,
    metadata?: Record<string, string>,
  ) => Effect.Effect<void, AuthError>
  readonly listApiKeys: (providerID: string) => Effect.Effect<string[], AuthError>
  readonly removeApiKey: (providerID: string, index: number) => Effect.Effect<void, AuthError>
}

// Canonical key pool of an auth entry: the head `key` then `keys`, deduplicated.
// Reading it this way keeps old single-key entries (`key` only) and new ones
// (`key` + `keys`) on the same code path.
export function apiKeys(info: Info | undefined): string[] {
  if (!info || info.type !== "api") return []
  return Array.from(new Set([info.key, ...(info.keys ?? [])].filter((item) => item.length > 0)))
}

// Never return a key in clear across a boundary: keep enough to tell two keys
// apart, never the secret.
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••"
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Auth") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* AppFileSystem.Service
    const decode = Schema.decodeUnknownOption(Info)

    const all = Effect.fn("Auth.all")(function* () {
      if (process.env.OPENCODE_AUTH_CONTENT) {
        try {
          return JSON.parse(process.env.OPENCODE_AUTH_CONTENT)
        } catch (err) {}
      }

      const data = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
      return Record.filterMap(data, (value) => Result.fromOption(decode(value), () => undefined))
    })

    const get = Effect.fn("Auth.get")(function* (providerID: string) {
      return (yield* all())[providerID]
    })

    const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      if (norm !== key) delete data[key]
      delete data[norm + "/"]
      yield* fsys
        .writeJson(file, { ...data, [norm]: info }, 0o600)
        .pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    const remove = Effect.fn("Auth.remove")(function* (key: string) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      delete data[key]
      delete data[norm]
      yield* fsys.writeJson(file, data, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    const writeKeys = Effect.fn("Auth.writeKeys")(function* (
      providerID: string,
      list: string[],
      metadataOverride?: Record<string, string>,
    ) {
      const existing = (yield* all())[providerID]
      if (list.length === 0) {
        yield* remove(providerID)
        return
      }
      const metadata = metadataOverride ?? (existing?.type === "api" ? existing.metadata : undefined)
      yield* set(providerID, {
        type: "api",
        key: list[0],
        ...(list.length > 1 ? { keys: list } : {}),
        ...(metadata ? { metadata } : {}),
      })
    })

    const addApiKey = Effect.fn("Auth.addApiKey")(function* (
      providerID: string,
      key: string,
      metadata?: Record<string, string>,
    ) {
      const trimmed = key.trim()
      if (trimmed.length === 0) return
      const existing = (yield* all())[providerID]
      const list = Array.from(new Set([...apiKeys(existing), trimmed]))
      yield* writeKeys(providerID, list, metadata)
    })

    const listApiKeys = Effect.fn("Auth.listApiKeys")(function* (providerID: string) {
      return apiKeys((yield* all())[providerID])
    })

    const removeApiKey = Effect.fn("Auth.removeApiKey")(function* (providerID: string, index: number) {
      const list = apiKeys((yield* all())[providerID])
      if (!Number.isInteger(index) || index < 0 || index >= list.length) return
      yield* writeKeys(
        providerID,
        list.filter((_, position) => position !== index),
      )
    })

    return Service.of({ get, all, set, remove, addApiKey, listApiKeys, removeApiKey })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as Auth from "."
