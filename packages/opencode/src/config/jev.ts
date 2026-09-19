import { Schema } from "effect"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { JevGuard } from "@/jev/guard"

export const Guard = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the probability guard. When true, an action the permission ruleset would auto-allow is escalated to a user prompt if Jev puts at least `threshold` probability on the action being destructive, irreversible or security-sensitive. Requires an API key and an interactive client.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description:
      `Probability (0..1) of the risky outcome at or above which an auto-allowed action is escalated. Defaults to ${JevGuard.DEFAULT_THRESHOLD}. Lower values trade false escalations for fewer missed risks.`,
  }),
  permissions: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `Permission names the guard screens. Defaults to ${JSON.stringify(JevGuard.DEFAULT_PERMISSIONS)}.`,
  }),
}).annotate({ identifier: "JevGuardConfig" })
export type Guard = Schema.Schema.Type<typeof Guard>

export const Info = Schema.Struct({
  api_key: Schema.optional(Schema.String).annotate({
    description:
      "System One API key. Prefer the TYPESAFE_API_KEY or JEV_API_KEY environment variable over storing a secret in a config file.",
  }),
  base_url: Schema.optional(Schema.String).annotate({
    description: `API base URL. Defaults to ${JevClient.DEFAULT_BASE_URL} (TypeSafe production). Set ${JevClient.OPENJEV_BASE_URL} — or the ${JevClient.BASE_URL_ENV} environment variable — to run against Codiv OpenJev.`,
  }),
  endpoint: Schema.optional(Schema.String).annotate({
    description: "Full System One endpoint. Overrides `base_url`. Defaults to `<base_url>/v1/systemone`.",
  }),
  model: Schema.optional(JevSchema.Model).annotate({
    description: `Default model id. Defaults to ${JevClient.DEFAULT_MODEL}, or ${JevClient.OPENJEV_MODEL} when \`base_url\` or ${JevClient.BASE_URL_ENV} points at the OpenJev host.`,
  }),
  guard: Schema.optional(Guard),
}).annotate({ identifier: "JevConfig" })
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigJev from "./jev"
