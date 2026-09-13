import { Schema, Types } from "effect"

export const GoalFinding = Schema.Struct({
  id: Schema.String,
  severity: Schema.Literals(["info", "low", "medium", "high", "critical"]),
  status: Schema.Literals(["open", "closed", "residual", "out_of_scope"]),
  summary: Schema.String,
  scope: Schema.optional(Schema.String),
  evidence: Schema.Array(Schema.String),
  firstSeenAt: Schema.Finite,
  updatedAt: Schema.Finite,
})

export const GoalCompletion = Schema.Struct({
  summary: Schema.optional(Schema.String),
  evidence: Schema.Array(Schema.Struct({ dod: Schema.String, proof: Schema.String })),
  unverified: Schema.Array(Schema.Struct({ dod: Schema.String, reason: Schema.String })),
  completedAt: Schema.Finite,
})

export const GoalState = Schema.Struct({
  status: Schema.Literals(["draft", "pending_user", "approved", "edited", "completed", "skipped", "blocked"]),
  source: Schema.Literals(["auto", "user"]),
  goal: Schema.String,
  dod: Schema.Array(Schema.String),
  // What kind of result the mission owes. The closure rules differ: an audit
  // documents defects, an implementation must fix them. Optional for backward
  // compatibility with contracts written before this field existed.
  deliverable: Schema.optional(Schema.Literals(["answer", "audit", "plan", "implementation"])),
  outOfScope: Schema.Array(Schema.String),
  compressed: Schema.optional(Schema.String),
  // ID of the user message this objective was derived from. Used to distinguish
  // "same turn, just completed" from "a new prompt after completion" so a finished
  // objective is not resurrected within the same turn (see ensureGoalState).
  anchorUserID: Schema.optional(Schema.String),
  findings: Schema.optional(Schema.Array(GoalFinding)),
  completion: Schema.optional(GoalCompletion),
  version: Schema.Finite,
  updatedAt: Schema.Finite,
}).annotate({ identifier: "GoalState" })
export type GoalState = Types.DeepMutable<Schema.Schema.Type<typeof GoalState>>
export type GoalStatus = GoalState["status"]

// Terminal statuses: the objective reached an end state and must not be revived
// this turn. `blocked` joins them: an external obstacle stops autonomous work
// just like completion does, and the mission stays recorded for the user.
const TERMINAL_STATUSES: readonly GoalStatus[] = ["completed", "skipped", "blocked"]

/** True once the objective is done/skipped/blocked — used to stop injecting it as "to do". */
export const isTerminalStatus = (status: GoalStatus): boolean => TERMINAL_STATUSES.includes(status)

/** Non-empty objective text. Centralizes the repeated `goal?.trim()` guard. */
export const hasObjective = (gs: GoalState | null | undefined): gs is GoalState =>
  !!gs && !!gs.goal?.trim()

/** Eligible for prompt injection: has text and not explicitly skipped. */
export const isInjectableGoal = (gs: GoalState | null | undefined): gs is GoalState =>
  hasObjective(gs) && gs.status !== "skipped"

/** Actively worked on: injectable and not in a terminal end state. Mirrors prompt.ts goalActive. */
export const isActiveGoal = (gs: GoalState | null | undefined): gs is GoalState =>
  isInjectableGoal(gs) && !isTerminalStatus(gs.status)

/** Bump version + timestamp monotonically; guards against clock-skew regressions. */
export const touchGoalState = (gs: GoalState): GoalState => ({
  ...gs,
  version: gs.version + 1,
  updatedAt: Math.max(Date.now(), gs.updatedAt + 1),
})

export type GoalDeliverable = "answer" | "audit" | "plan" | "implementation"

// Action verbs that imply changing the system, not merely reporting on it.
// Lookarounds instead of \b: JS word boundaries are ASCII, so an accented verb
// such as "évalue" has no leading boundary and would never match.
const IMPLEMENTATION_HINTS =
  /(?<![a-z0-9])(implement|impl[ée]mente|impl[ée]menter|corrige|corriger|fix|r[ée]pare|r[ée]parer|ajoute|ajouter|add|supprime|supprimer|remove|modifie|modifier|change|refactorise|refactor|renomme|rename|migre|migrer|cr[ée]e|cr[ée]er|create|construis|construire|d[ée]veloppe|d[ée]velopper|develop|build|am[ée]liore|am[ée]liorer|improve|rendre plus fiable|rends plus fiable)(?![a-z0-9])/i
const PLAN_HINTS = /(?<![a-z0-9])(plan|plans|planifie|planifier|planning|roadmap|feuille de route)(?![a-z0-9])/i
const AUDIT_HINTS =
  /(?<![a-z0-9])(audit|audite|auditer|[ée]value|[ée]valuer|[ée]valuation|evaluate|assess|assessment|analyse|analyser|analyze|diagnostic|diagnostique|review|revois|inspecte|[ée]tat de l'?art|state of the art)(?![a-z0-9])/i

/** Classify the deliverable kind from the mission text. Conservative: only clear
 *  mutation verbs make it an implementation, so closure is not over-blocked. */
export function inferDeliverable(text: string): GoalDeliverable {
  if (IMPLEMENTATION_HINTS.test(text)) return "implementation"
  if (PLAN_HINTS.test(text)) return "plan"
  if (AUDIT_HINTS.test(text)) return "audit"
  return "answer"
}
