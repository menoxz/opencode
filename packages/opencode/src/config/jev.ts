import { Schema } from "effect"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { JevGuard } from "@/jev/guard"
import { JevCompaction } from "@/jev/compaction"

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

export const Compaction = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run Jev as a compaction advisor. Jev reads the context about to be summarized and answers one small typed batch marking which anchors (paths, commands, identifiers, error strings) are load-bearing; that checklist steers the summarization prompt, then a second batch audits the produced summary and one bounded repair pass restores anything Jev reports missing. Fail-open: any Jev error, timeout or absent answer is ignored and compaction proceeds unchanged.",
  }),
  max_questions: Schema.optional(Schema.Number).annotate({
    description: `Maximum anchors Jev is asked about per pass (both passes share this bound). Defaults to ${JevCompaction.MAX_QUESTIONS}.`,
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: `Probability (0..1) at or above which a \`noul\` answer counts as yes. Defaults to ${JevCompaction.DEFAULT_THRESHOLD}.`,
  }),
  repair: Schema.optional(Schema.Boolean).annotate({
    description:
      "Allow the single post-summary repair pass when Jev reports load-bearing anchors missing from the summary. Set to false to keep the advisory checklist but never re-run summarization. Defaults to true.",
  }),
}).annotate({ identifier: "JevCompactionConfig" })
export type Compaction = Schema.Schema.Type<typeof Compaction>

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
  compaction: Schema.optional(Compaction),
}).annotate({ identifier: "JevConfig" })
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigJev from "./jev"
