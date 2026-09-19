import { Schema } from "effect"

/**
 * TypeSafe Jev ("System One") speaks a typed request/response dialect: the
 * caller supplies a `state` plus explicitly typed questions, and the model
 * returns one typed answer per question with probabilities and a calibrated
 * confidence. There is no free-text completion and no tool calling, so the
 * schema is the entire contract — see https://docs.typesafe.ai.
 */

// Kept as a free string rather than a closed literal: Jev ships versioned
// model ids (`jev-1.13.0`, …) and opencode hard-fails on invalid config, so a
// closed enum would break every future release.
export const Model = Schema.String.annotate({
  identifier: "JevModel",
  description: "Jev model id, for example jev-latest or jev-1.13.0.",
})
export type Model = Schema.Schema.Type<typeof Model>

export const QuestionKind = Schema.Literals(["choice", "score", "noul"]).annotate({
  identifier: "JevQuestionKind",
})
export type QuestionKind = Schema.Schema.Type<typeof QuestionKind>

const prompt = Schema.String.annotate({
  description: "The question itself. Jev reads it literally, so spell out every condition.",
})

export const ChoiceQuestion = Schema.Struct({
  id: Schema.String.annotate({ description: "Stable answer id, echoed back on the matching answer." }),
  kind: Schema.Literal("choice"),
  prompt,
  options: Schema.Array(Schema.String).annotate({
    description: "Allowed answers. Must contain at least one option.",
  }),
}).annotate({ identifier: "JevChoiceQuestion" })
export type ChoiceQuestion = Schema.Schema.Type<typeof ChoiceQuestion>

export const ScoreQuestion = Schema.Struct({
  id: Schema.String.annotate({ description: "Stable answer id, echoed back on the matching answer." }),
  kind: Schema.Literal("score"),
  prompt,
}).annotate({ identifier: "JevScoreQuestion" })
export type ScoreQuestion = Schema.Schema.Type<typeof ScoreQuestion>

export const NoulQuestion = Schema.Struct({
  id: Schema.String.annotate({ description: "Stable answer id, echoed back on the matching answer." }),
  kind: Schema.Literal("noul"),
  prompt,
}).annotate({ identifier: "JevNoulQuestion" })
export type NoulQuestion = Schema.Schema.Type<typeof NoulQuestion>

export const Question = Schema.Union([ChoiceQuestion, ScoreQuestion, NoulQuestion]).annotate({
  identifier: "JevQuestion",
  discriminator: "kind",
})
export type Question = Schema.Schema.Type<typeof Question>

export const Request = Schema.Struct({
  state: Schema.String.annotate({
    description:
      "All facts the questions depend on. Jev is stateless and text-only, so nothing outside this string is available to it.",
  }),
  questions: Schema.Array(Question).annotate({ description: "One or more typed questions asked against `state`." }),
  model: Schema.optional(Model),
}).annotate({ identifier: "JevRequest" })
export type Request = Schema.Schema.Type<typeof Request>

export const Answer = Schema.Struct({
  id: Schema.String,
  kind: Schema.optional(QuestionKind),
  choice: Schema.optional(Schema.String),
  score: Schema.optional(Schema.Number),
  noul: Schema.optional(Schema.Boolean),
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  confidence: Schema.Number.annotate({
    description: "Calibrated confidence for this answer, between 0 and 1.",
  }),
}).annotate({ identifier: "JevAnswer" })
export type Answer = Schema.Schema.Type<typeof Answer>

export const Response = Schema.Struct({
  model: Schema.String,
  answers: Schema.Array(Answer),
}).annotate({ identifier: "JevResponse" })
export type Response = Schema.Schema.Type<typeof Response>

export * as JevSchema from "./schema"
