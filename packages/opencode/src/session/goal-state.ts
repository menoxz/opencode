import { Schema, Types } from "effect"

export const GoalState = Schema.Struct({
  status: Schema.Literals(["draft", "pending_user", "approved", "edited", "completed", "skipped"]),
  source: Schema.Literals(["auto", "user"]),
  goal: Schema.String,
  dod: Schema.Array(Schema.String),
  outOfScope: Schema.Array(Schema.String),
  compressed: Schema.optional(Schema.String),
  // ID of the user message this objective was derived from. Used to distinguish
  // "same turn, just completed" from "a new prompt after completion" so a finished
  // objective is not resurrected within the same turn (see ensureGoalState).
  anchorUserID: Schema.optional(Schema.String),
  version: Schema.Finite,
  updatedAt: Schema.Finite,
}).annotate({ identifier: "GoalState" })
export type GoalState = Types.DeepMutable<Schema.Schema.Type<typeof GoalState>>
