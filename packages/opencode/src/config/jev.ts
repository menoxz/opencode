import { Schema } from "effect"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"
import { JevGuard } from "@/jev/guard"
import { JevCompaction } from "@/jev/compaction"
import { JevIntake } from "@/jev/intake"
import { JevRelevance } from "@/jev/relevance"

export const Guard = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the systematic pre-tool guard. Jev answers three typed questions about every tool call — is it destructive, did the user ask for it, does its instruction come from untrusted content — and the verdict is allow, ask or deny. When false (default) the loop runs unchanged. Requires an API key.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: `Probability (0..1) at or above which the guard asks, and below which it allows. Defaults to ${JevGuard.DEFAULT_THRESHOLD}. A routing decision for a harder turn lowers it for that turn.`,
  }),
  permissions: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `Permission names the legacy permission-time guard screens. Defaults to ${JSON.stringify(JevGuard.DEFAULT_PERMISSIONS)}.`,
  }),
}).annotate({ identifier: "JevGuardConfig" })
export type Guard = Schema.Schema.Type<typeof Guard>

export const Route = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable pre-loop routing. Before the first model call, Jev reads the user's request and picks a reasoning tier (lite or build) plus a complexity score, which also sets the guard threshold for the turn. The decision is injected into the system prompt.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: "Base guard threshold the routing complexity score adjusts. Defaults to the guard threshold (0.5).",
  }),
}).annotate({ identifier: "JevRouteConfig" })
export type Route = Schema.Schema.Type<typeof Route>

export const Plan = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the pre-turn plan. Before the first model call, Jev reads the user's request and names the phases the turn needs (read, edit, verify, build, deploy, commit), injected into the system prompt as a checklist so the model batches its calls instead of discovering the work one turn at a time. Costs one Jev round-trip per user turn, kept while the request is unchanged. Fail-open: any error leaves the prompt untouched.",
  }),
}).annotate({ identifier: "JevPlanConfig" })
export type Plan = Schema.Schema.Type<typeof Plan>

export const Review = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the post-execution review. After each tool call, Jev scores the result on correctness, complexity and security; the scores are appended to the tool output as signal and stored for the next turn's context. They never replace the model's own correction.",
  }),
}).annotate({ identifier: "JevReviewConfig" })
export type Review = Schema.Schema.Type<typeof Review>

export const Untrusted = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Ask Jev to confirm prompt-injection markers found in tool results. Deterministic markers are always recorded regardless of this flag; enabling it adds a Jev-confirmed hit when the heuristics fire. Defaults to false so clean results cost no round-trip.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: "Probability (0..1) at or above which Jev's confirmation counts. Defaults to 0.5.",
  }),
}).annotate({ identifier: "JevUntrustedConfig" })
export type Untrusted = Schema.Schema.Type<typeof Untrusted>

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

export const Relevance = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the relevance judge. The deterministic context ledger already answers a call whose target provably did not change; this adds a Jev verdict for the near repeat the ledger cannot decide on bytes alone — the same information reached through different arguments (a shorter form of the same command, the same page through another tool). Jev estimates the probability that the call still adds information. Only read-only calls are ever affected: it never blocks, asks or suppresses a mutating call, and the same call is never judged twice. Fail-open, and default off. Requires an API key.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: `Probability of new information (0..1) at or below which the call is answered from the context ledger instead of being executed. Defaults to ${JevRelevance.DEFAULT_REDUNDANT_AT}.`,
  }),
  ambiguous_threshold: Schema.optional(Schema.Number).annotate({
    description: `Probability of new information (0..1) below which the call still runs but its result is flagged as possibly redundant. Defaults to ${JevRelevance.DEFAULT_AMBIGUOUS_AT}.`,
  }),
}).annotate({ identifier: "JevRelevanceConfig" })
export type Relevance = Schema.Schema.Type<typeof Relevance>

export const NextAction = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the next-action selector. After a tool call, Jev picks one closed option — continue, reobserve, switch_strategy, verify, answer, blocked — from the result, the progress status and the planned phases, rendered as one line of guidance next to the tool result. The question is merged into the review request when the review is also enabled, so a step still costs at most one Jev round-trip and never two. Advisory only: the model stays the planner. Fail-open, default off.",
  }),
}).annotate({ identifier: "JevNextActionConfig" })
export type NextAction = Schema.Schema.Type<typeof NextAction>

export const Intake = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the extractive intake filter. Before a tool result enters the model context, Jev reads the result split into blocks and marks which blocks are NOT load-bearing; the harness deletes exactly those blocks and keeps the rest byte-for-byte, never rewriting anything. A block carrying an anchor (path, command, identifier, error string) is never asked about and never dropped, and an unanswered block is kept, so a wrong Jev answer cannot delete load-bearing bytes. The full raw result stays recoverable from the context ledger. The questions merge into the same round-trip as review/next_action, so it costs no extra call unless `model` selects a different one. Fail-open, shadow-aware, default off. Requires an API key.",
  }),
  threshold: Schema.optional(Schema.Number).annotate({
    description: `Probability (0..1) at or above which a block counts as load-bearing and is kept. Below it, a block is pruned. Defaults to ${JevIntake.DEFAULT_THRESHOLD}.`,
  }),
  max_blocks: Schema.optional(Schema.Number).annotate({
    description: `Maximum blocks a result is split into and asked about. Defaults to ${JevIntake.MAX_BLOCKS}.`,
  }),
  min_chars: Schema.optional(Schema.Number).annotate({
    description: `Results shorter than this many characters are never filtered and cost no round-trip. Defaults to ${JevIntake.MIN_CHARS}.`,
  }),
  intent: Schema.optional(Schema.Boolean).annotate({
    description:
      "Scope the intake to the agent's current intent (the active objective). A block is then kept only when reading it advances that intent, so a long file read keeps the few lines the task needs instead of every line. In this mode anchor blocks are asked too and may be dropped when off-task, but only under `anchor_threshold` (stricter), and the raw result stays recoverable from the context ledger. Fail-open, default off.",
  }),
  anchor_threshold: Schema.optional(Schema.Number).annotate({
    description:
      "In intent mode, probability at or above which an anchor block is kept. Lower than `threshold`, so an anchor is dropped only on a confident refutation. Defaults to half of `threshold`.",
  }),
  model: Schema.optional(JevSchema.Model).annotate({
    description:
      "System One model id used for the intake questions only, so the filter can run on a cheaper or faster model than the rest of Jev (for example `openjev-latest`). When set (or when `base_url`/`endpoint` is set) the questions travel in their own request; otherwise they merge into the shared post round-trip. Defaults to `jev.model`.",
  }),
  base_url: Schema.optional(Schema.String).annotate({
    description: "System One host used for the intake questions only. Overrides `jev.base_url` for this hook.",
  }),
  endpoint: Schema.optional(Schema.String).annotate({
    description: "Full System One endpoint used for the intake questions only. Overrides `base_url` for this hook.",
  }),
}).annotate({ identifier: "JevIntakeConfig" })
export type Intake = Schema.Schema.Type<typeof Intake>

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
  shadow: Schema.optional(Schema.Boolean).annotate({
    description:
      "Shadow mode: evaluate every Jev hook, log and inject the decision, but never block, ask or alter a tool result. Use it to measure the guard before letting it act, then set it to false to go active. Defaults to false.",
  }),
  rules: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Non-codifiable rules (house conventions, forbidden actions, tone) Jev cannot infer from code. Injected verbatim into the system prompt context block each turn.",
  }),
  guard: Schema.optional(Guard),
  route: Schema.optional(Route),
  plan: Schema.optional(Plan),
  review: Schema.optional(Review),
  untrusted: Schema.optional(Untrusted),
  compaction: Schema.optional(Compaction),
  relevance: Schema.optional(Relevance),
  next_action: Schema.optional(NextAction),
  intake: Schema.optional(Intake),
}).annotate({ identifier: "JevConfig" })
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigJev from "./jev"
