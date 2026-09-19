import { Effect, Option, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import { Config } from "@/config/config"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"

const DESCRIPTION = `Ask the Jev (System One) decision model typed questions and get calibrated typed answers back.

Use it for short, bounded decisions over facts you supply: routing, risk flags, multiple-choice selection, scoring, yes/no checks. Jev evaluates typed questions instead of generating text, so it never parses your prompt and returns the answers with probabilities and a calibrated confidence. Do not use it for open-ended writing, arithmetic or date reasoning — it is known to be brittle there.

Jev is stateless and text-only: put every fact a question depends on in \`state\`. Questions are a map keyed by a stable id, each typed \`noul\` (yes/no), \`choice\` (map of option name to description) or \`score\` (ordered list of level descriptions, lowest first). Requires an API key via TYPESAFE_API_KEY/JEV_API_KEY or \`jev.api_key\`.`

export const Parameters = Schema.Struct({
  state: JevSchema.Payload.annotate({
    description: "All facts the questions depend on. Nothing outside `state` is visible to Jev.",
  }),
  questions: Schema.Record(Schema.String, JevSchema.Question).annotate({
    description: "Typed questions keyed by a stable id. The matching answer comes back under the same id.",
  }),
  model: Schema.optional(JevSchema.Model).annotate({
    description: "Override the configured model, for example jev-latest or openjev-latest.",
  }),
})

function renderProbabilities(probabilities: { readonly [option: string]: number } | undefined): string {
  if (!probabilities || Object.keys(probabilities).length === 0) return ""
  return ` probabilities={${Object.entries(probabilities)
    .map(([option, probability]) => `${option}: ${probability.toFixed(3)}`)
    .join(", ")}}`
}

function renderAnswer(id: string, answer: JevSchema.Answer): string {
  const value =
    answer.type === "noul"
      ? `noul=${answer.noul.toFixed(3)} (probability yes)`
      : answer.type === "choice"
        ? `choice=${answer.choice} confidence=${answer.confidence.toFixed(3)}`
        : `score=${answer.score.toFixed(3)} confidence=${answer.confidence.toFixed(3)}`
  const probabilities = answer.type === "noul" ? "" : renderProbabilities(answer.probabilities)
  return `[${id}] ${value}${probabilities}`
}

function render(response: JevSchema.Response): string {
  return [
    `model: ${response.model}`,
    ...Object.entries(response.answers).map(([id, answer]) => renderAnswer(id, answer)),
  ].join("\n")
}

export const JevTool = Tool.define(
  "jev",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const config = yield* Effect.serviceOption(Config.Service).pipe(Effect.map(Option.getOrUndefined))

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>): Effect.Effect<Tool.ExecuteResult> =>
        Effect.gen(function* () {
          const settings = config ? yield* config.get().pipe(Effect.catch(() => Effect.succeed(undefined))) : undefined
          const outcome = yield* JevClient.decide(http, params, settings?.jev).pipe(
            Effect.map((response) => ({ ok: true as const, response })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
          )

          if (!outcome.ok)
            return {
              title: "Jev decision unavailable",
              metadata: { error: outcome.error._tag },
              output: outcome.error.message,
            }

          return {
            title: `Jev decision (${outcome.response.model})`,
            metadata: { model: outcome.response.model, answers: outcome.response.answers },
            output: render(outcome.response),
          }
        }),
    }
  }),
)
