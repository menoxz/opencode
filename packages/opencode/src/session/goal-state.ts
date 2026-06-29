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
export type GoalStatus = GoalState["status"]

// Terminal statuses: the objective is finished and must not be revived this turn.
const TERMINAL_STATUSES: readonly GoalStatus[] = ["completed", "skipped"]

/** True once the objective is done/skipped — used to stop injecting it as "to do". */
export const isTerminalStatus = (status: GoalStatus): boolean => TERMINAL_STATUSES.includes(status)

/** Non-empty objective text. Centralizes the repeated `goal?.trim()` guard. */
export const hasObjective = (gs: GoalState | null | undefined): gs is GoalState =>
  !!gs && !!gs.goal?.trim()

/** Eligible for prompt injection: has text and not explicitly skipped. */
export const isInjectableGoal = (gs: GoalState | null | undefined): gs is GoalState =>
  hasObjective(gs) && gs.status !== "skipped"

/** Actively worked on: injectable and not yet completed. Mirrors prompt.ts goalActive. */
export const isActiveGoal = (gs: GoalState | null | undefined): gs is GoalState =>
  isInjectableGoal(gs) && gs.status !== "completed"

/** Bump version + timestamp monotonically; guards against clock-skew regressions. */
export const touchGoalState = (gs: GoalState): GoalState => ({
  ...gs,
  version: gs.version + 1,
  updatedAt: Math.max(Date.now(), gs.updatedAt + 1),
})
