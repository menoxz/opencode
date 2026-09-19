import { Schema } from "effect"

/**
 * Wire contract for the System One endpoint, shared by TypeSafe Jev
 * (production, https://api.typesafe.ai) and Jev-compatible servers such as
 * Codiv's OpenJev (https://api.codiv.ai), which serve an open model under the
 * same request/response shape.
 *
 *   POST {base}/v1/systemone
 *   { state, model, questions: { <id>: { type, instructions, criteria? } } }
 *   -> { model, answers: { <id>: { type, ... } }, usage }
 *
 * `questions` and `answers` are maps keyed by a caller-chosen id, not arrays:
 * the id never reaches the model, it only matches an answer to its question.
 * Reference: https://docs.typesafe.ai/api
 */

// Kept as a free string rather than a closed literal: Jev ships versioned
// model ids (`jev-1.13.0`, …) and opencode hard-fails on invalid config, so a
// closed enum would break every future release.
export const Model = Schema.String.annotate({
  identifier: "JevModel",
  description: "Jev model id, for example jev-latest (TypeSafe) or openjev-latest (OpenJev).",
})
export type Model = Schema.Schema.Type<typeof Model>

/**
 * A description may be a plain string, or JSON structure when the guidance
 * needs to be organised. Both `state` and every `instructions`/`criteria`
 * entry accept the same three shapes the service documents.
 */
export const Payload = Schema.Union([
  Schema.String,
  Schema.Array(Schema.Unknown),
  Schema.Record(Schema.String, Schema.Unknown),
]).annotate({ identifier: "JevPayload" })
export type Payload = Schema.Schema.Type<typeof Payload>

export const QuestionType = Schema.Literals(["noul", "choice", "score"]).annotate({
  identifier: "JevQuestionType",
})
export type QuestionType = Schema.Schema.Type<typeof QuestionType>

export const NoulQuestion = Schema.Struct({
  type: Schema.Literal("noul"),
  instructions: Payload.annotate({
    description: "The yes/no question to evaluate. Phrase it so a high probability means yes.",
  }),
  criteria: Schema.optional(
    Schema.Struct({
      true: Payload.annotate({ description: "What the model must treat as yes." }),
      false: Payload.annotate({ description: "What the model must treat as no." }),
    }),
  ).annotate({ description: "Optional sharpening of the two outcomes. Strongly recommended." }),
}).annotate({ identifier: "JevNoulQuestion" })
export type NoulQuestion = Schema.Schema.Type<typeof NoulQuestion>

export const ChoiceQuestion = Schema.Struct({
  type: Schema.Literal("choice"),
  instructions: Payload.annotate({ description: "The question whose answer is exactly one of `criteria`." }),
  criteria: Schema.Record(Schema.String, Payload).annotate({
    description:
      "The allowed answers as a map of option name to the description of that option. Must hold at least one entry.",
  }),
}).annotate({ identifier: "JevChoiceQuestion" })
export type ChoiceQuestion = Schema.Schema.Type<typeof ChoiceQuestion>

export const ScoreQuestion = Schema.Struct({
  type: Schema.Literal("score"),
  instructions: Payload.annotate({ description: "What the model should rate against `criteria`." }),
  criteria: Schema.Array(Payload).annotate({
    description: "The ordered level descriptions, lowest first. Must hold at least two levels.",
  }),
}).annotate({ identifier: "JevScoreQuestion" })
export type ScoreQuestion = Schema.Schema.Type<typeof ScoreQuestion>

export const Question = Schema.Union([NoulQuestion, ChoiceQuestion, ScoreQuestion]).annotate({
  identifier: "JevQuestion",
  discriminator: "type",
})
export type Question = Schema.Schema.Type<typeof Question>

export const Request = Schema.Struct({
  state: Payload.annotate({
    description:
      "All facts the questions depend on. Jev is stateless and text-only, so nothing outside `state` is visible to it.",
  }),
  questions: Schema.Record(Schema.String, Question).annotate({
    description: "Typed questions keyed by a stable id. The matching answer comes back under the same id.",
  }),
  model: Schema.optional(Model),
}).annotate({ identifier: "JevRequest" })
export type Request = Schema.Schema.Type<typeof Request>

export const NoulAnswer = Schema.Struct({
  type: Schema.Literal("noul"),
  noul: Schema.Number.annotate({
    description: "Probability that the answer is yes, 0..1. Noul carries no separate confidence.",
  }),
}).annotate({ identifier: "JevNoulAnswer" })
export type NoulAnswer = Schema.Schema.Type<typeof NoulAnswer>

export const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String.annotate({ description: "The chosen option name, one of the question's `criteria` keys." }),
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)).annotate({
    description: "Probability assigned to each option.",
  }),
  confidence: Schema.Number.annotate({
    description: "Calibrated confidence for this answer, 0..1. Derived from the probabilities.",
  }),
}).annotate({ identifier: "JevChoiceAnswer" })
export type ChoiceAnswer = Schema.Schema.Type<typeof ChoiceAnswer>

export const ScoreAnswer = Schema.Struct({
  type: Schema.Literal("score"),
  score: Schema.Number.annotate({ description: "Probability-weighted position across the ordered levels." }),
  legend: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Maps each level index to its description.",
  }),
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)).annotate({
    description: "Probability assigned to each level.",
  }),
  confidence: Schema.Number.annotate({
    description: "Calibrated confidence for this answer, 0..1. Derived from the probabilities.",
  }),
}).annotate({ identifier: "JevScoreAnswer" })
export type ScoreAnswer = Schema.Schema.Type<typeof ScoreAnswer>

export const Answer = Schema.Union([NoulAnswer, ChoiceAnswer, ScoreAnswer]).annotate({
  identifier: "JevAnswer",
  discriminator: "type",
})
export type Answer = Schema.Schema.Type<typeof Answer>

export const Usage = Schema.Struct({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
}).annotate({ identifier: "JevUsage" })
export type Usage = Schema.Schema.Type<typeof Usage>

export const Response = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(Schema.String, Answer).annotate({
    description: "One answer per requested question id.",
  }),
  usage: Schema.optional(Usage),
}).annotate({ identifier: "JevResponse" })
export type Response = Schema.Schema.Type<typeof Response>

export * as JevSchema from "./schema"
