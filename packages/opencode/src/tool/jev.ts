import { Effect, Option, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import { Config } from "@/config/config"
import { JevClient } from "@/jev/client"
import { JevSchema } from "@/jev/schema"

const DESCRIPTION = `Ask the TypeSafe Jev (System One) decision model typed questions and get calibrated typed answers back.

Use it for short, bounded decisions over facts you supply: routing, risk flags, multiple-choice selection, scoring, yes/no checks. Jev evaluates typed questions instead of generating text, so it never parses your prompt and returns a calibrated confidence with every answer. Do not use it for open-ended writing, arithmetic or date reasoning — it is known to be brittle there.

Jev is stateless and text-only: put every fact a question depends on in \`state\`. Questions are typed — \`choice\` (supply \`options\`), \`score\` (0..1) or \`noul\` (yes/no). Requires a TypeSafe API key via JEV_API_KEY/TYPESAFE_API_KEY or \`jev.api_key\`.` 

export const Parameters = Schema.Struct({
  state: Schema.String.annotate({
    description: "All facts the questions depend on, as plain text. Nothing outside this string is visible to Jev.",
  }),
  questions: Schema.Array(JevSchema.Question).annotate({
    description: "Typed questions asked against `state`, each with a stable `id` echoed back on its answer.",
  }),
  model: Schema.optional(JevSchema.Model).annotate({
    description: "Override the configured model, for example jev-latest or jev-1.13.0.",
  }),
})

function renderAnswer(answer: JevSchema.Answer): string {
  const value =
    answer.noul !== undefined
      ? String(answer.noul)
      : answer.choice !== undefined
        ? answer.choice
        : answer.score !== undefined
          ? answer.score.toFixed(3)
          : "unspecified"
  const probabilities =
    answer.probabilities && Object.keys(answer.probabilities).length > 0
      ? ` probabilities={${Object.entries(answer.probabilities)
          .map(([option, probability]) => `${option}: ${probability.toFixed(3)}`)
          .join(", ")}}`
      : ""
  return `[${answer.id}] ${answer.kind ?? "answer"}=${value} confidence=${answer.confidence.toFixed(3)}${probabilities}`
}

function render(response: JevSchema.Response): string {
  return [`model: ${response.model}`, ...response.answers.map(renderAnswer)].join("\n")
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
