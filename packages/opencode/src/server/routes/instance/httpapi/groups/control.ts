import { Auth } from "@/auth"
import { ProviderID } from "@/provider/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"

const AuthParams = Schema.Struct({
  providerID: ProviderID,
})

const AuthKeyIndexParams = Schema.Struct({
  providerID: ProviderID,
  index: Schema.String,
})

const AddKeyInput = Schema.Struct({
  key: Schema.String.annotate({ description: "API key to append to the provider's ordered pool" }),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Provider metadata to persist alongside the key (only when none is already stored)",
  }),
})

const MaskedKey = Schema.Struct({
  index: Schema.Finite,
  masked: Schema.String,
})

const KeyList = Schema.Struct({
  keys: Schema.Array(MaskedKey),
})

const LogQuery = Schema.Struct({
  directory: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
})

export const LogInput = Schema.Struct({
  service: Schema.String.annotate({ description: "Service name for the log entry" }),
  level: Schema.Union([
    Schema.Literal("debug"),
    Schema.Literal("info"),
    Schema.Literal("error"),
    Schema.Literal("warn"),
  ]).annotate({ description: "Log level" }),
  message: Schema.String.annotate({ description: "Log message" }),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)).annotate({
    description: "Additional metadata for the log entry",
  }),
})

export const ControlPaths = {
  auth: "/auth/:providerID",
  authKeys: "/auth/:providerID/keys",
  authKeysRemove: "/auth/:providerID/keys/:index",
  log: "/log",
} as const

export const ControlApi = HttpApi.make("control").add(
  HttpApiGroup.make("control")
    .add(
      HttpApiEndpoint.put("authSet", ControlPaths.auth, {
        params: AuthParams,
        payload: Auth.Info,
        success: described(Schema.Boolean, "Successfully set authentication credentials"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.set",
          summary: "Set auth credentials",
          description: "Set authentication credentials",
        }),
      ),
      HttpApiEndpoint.delete("authRemove", ControlPaths.auth, {
        params: AuthParams,
        success: described(Schema.Boolean, "Successfully removed authentication credentials"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.remove",
          summary: "Remove auth credentials",
          description: "Remove authentication credentials",
        }),
      ),
      HttpApiEndpoint.get("authKeysList", ControlPaths.authKeys, {
        params: AuthParams,
        success: described(KeyList, "Masked list of the provider's stored API keys"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.keys.list",
          summary: "List stored API keys",
          description: "List the provider's stored API keys, masked (never in clear) and in priority order.",
        }),
      ),
      HttpApiEndpoint.post("authKeysAdd", ControlPaths.authKeys, {
        params: AuthParams,
        payload: AddKeyInput,
        success: described(Schema.Boolean, "Successfully appended the API key"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.keys.add",
          summary: "Append an API key",
          description: "Append an API key to the provider's pool without touching the keys already stored.",
        }),
      ),
      HttpApiEndpoint.delete("authKeysRemove", ControlPaths.authKeysRemove, {
        params: AuthKeyIndexParams,
        success: described(Schema.Boolean, "Successfully removed the API key"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "auth.keys.remove",
          summary: "Remove one API key",
          description: "Remove a single API key from the provider's pool by its position.",
        }),
      ),
      HttpApiEndpoint.post("log", ControlPaths.log, {
        query: LogQuery,
        payload: LogInput,
        success: described(Schema.Boolean, "Log entry written successfully"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "app.log",
          summary: "Write log",
          description: "Write a log entry to the server logs with specified level and metadata.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "control", description: "Control plane routes." })),
)
