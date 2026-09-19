import { Schema } from "effect"
import { JevSchema } from "@/jev/schema"
import { JevGuard } from "@/jev/guard"

export const Guard = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the calibrated-confidence guard. When true, an action the permission ruleset would auto-allow is escalated to a user prompt if Jev flags it as destructive or answers below `threshold`. Requires an API key and an interactive client.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description:
      "Minimum calibrated confidence (0..1) required to leave an auto-allowed action alone. Defaults to 0.8. Lower values trade false escalations for missed risk.",
  }),
  permissions: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `Permission names the guard screens. Defaults to ${JSON.stringify(JevGuard.DEFAULT_PERMISSIONS)}.`,
  }),
}).annotate({ identifier: "JevGuardConfig" })
export type Guard = Schema.Schema.Type<typeof Guard>

export const Info = Schema.Struct({
  api_key: Schema.optional(Schema.String).annotate({
    description:
      "TypeSafe Jev API key. Prefer the JEV_API_KEY or TYPESAFE_API_KEY environment variable over storing a secret in a config file.",
  }),
  endpoint: Schema.optional(Schema.String).annotate({
    description: "System One endpoint. Defaults to https://api.typesafe.ai/v1/systemone.",
  }),
  model: Schema.optional(JevSchema.Model).annotate({
    description: "Default Jev model id, for example jev-latest.",
  }),
  guard: Schema.optional(Guard),
}).annotate({ identifier: "JevConfig" })
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigJev from "./jev"
