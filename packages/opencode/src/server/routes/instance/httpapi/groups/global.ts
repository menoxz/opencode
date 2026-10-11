import { Config } from "@/config/config"
import { BusEvent } from "@/bus/bus-event"
import { SyncEvent } from "@/sync"
import { JevClient } from "@/jev/client"
import "@/server/event"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"

const GlobalHealth = Schema.Struct({
  healthy: Schema.Literal(true),
  version: Schema.String,
})

const GlobalEventSchema = Schema.Struct({
  directory: Schema.String,
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  payload: Schema.Union([...BusEvent.effectPayloads(), ...SyncEvent.effectPayloads()]),
}).annotate({ identifier: "GlobalEvent" })

export const GlobalUpgradeInput = Schema.Struct({
  target: Schema.optional(Schema.String),
})

const GlobalUpgradeResult = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.String,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    error: Schema.String,
  }),
])

export const GlobalJevModel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
})

/**
 * The System One decision models the configured Jev host serves.
 *
 * The `/decision-model` picker lists harness chat models only (`provider.list`), which is why a
 * Jev host's own models — `openjev-latest` and friends — could never appear there. This is the
 * second catalogue: the host's `/v1/models` listing when it answers, the preset's documented
 * models otherwise. `source` says which, so the picker can be honest about it.
 */
export const GlobalJevModels = Schema.Struct({
  provider: JevClient.Provider,
  base_url: Schema.String,
  endpoint: Schema.String,
  default_model: Schema.String,
  authenticated: Schema.Boolean,
  source: Schema.Literals(["host", "preset"]),
  models: Schema.Array(GlobalJevModel),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "GlobalJevModels" })

export const GlobalPaths = {
  health: "/global/health",
  event: "/global/event",
  config: "/global/config",
  dispose: "/global/dispose",
  upgrade: "/global/upgrade",
  jevModels: "/global/jev/models",
} as const

export const GlobalApi = HttpApi.make("global").add(
  HttpApiGroup.make("global")
    .add(
      HttpApiEndpoint.get("health", GlobalPaths.health, {
        success: described(GlobalHealth, "Health information"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.health",
          summary: "Get health",
          description: "Get health information about the OpenCode server.",
        }),
      ),
      HttpApiEndpoint.get("event", GlobalPaths.event, {
        success: GlobalEventSchema,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.event",
          summary: "Get global events",
          description: "Subscribe to global events from the OpenCode system using server-sent events.",
        }),
      ),
      HttpApiEndpoint.get("configGet", GlobalPaths.config, {
        success: described(Config.Info, "Get global config info"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.get",
          summary: "Get global configuration",
          description: "Retrieve the current global OpenCode configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.patch("configUpdate", GlobalPaths.config, {
        payload: Config.Info,
        success: described(Config.Info, "Successfully updated global config"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.update",
          summary: "Update global configuration",
          description: "Update global OpenCode configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.get("jevModels", GlobalPaths.jevModels, {
        success: described(GlobalJevModels, "Decision models the configured Jev host serves"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.jev.models",
          summary: "List Jev decision models",
          description:
            "The System One decision models the configured Jev host serves: the host's own /v1/models listing when it answers, the preset's documented models otherwise.",
        }),
      ),
      HttpApiEndpoint.post("dispose", GlobalPaths.dispose, {
        success: described(Schema.Boolean, "Global disposed"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.dispose",
          summary: "Dispose instance",
          description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        }),
      ),
      HttpApiEndpoint.post("upgrade", GlobalPaths.upgrade, {
        payload: [HttpApiSchema.NoContent, GlobalUpgradeInput],
        success: described(GlobalUpgradeResult, "Upgrade result"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.upgrade",
          summary: "Upgrade opencode",
          description: "Upgrade opencode to the specified version or latest if not specified.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "global", description: "Global server routes." })),
)
