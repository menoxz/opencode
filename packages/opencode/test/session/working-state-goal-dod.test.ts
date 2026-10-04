import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { formatGoalContext } from "../../src/session/compaction"
import { isActiveGoal, skippedGoalState } from "../../src/session/goal-state"
import { Session } from "../../src/session/session"
import { Todo } from "../../src/session/todo"
import { WorkingState } from "../../src/session/working-state"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, Todo.defaultLayer))

// `context_rollout.goal_dod = off` must silence the feature end to end: the persisted
// contract is neither injected by ensureGoalState nor surfaced on the working-state card.
// The caller resolves the rollout and passes the flag, so this pins the WorkingState half.
it.instance("hides the persisted contract from the card when goal_dod is off", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create({})
    yield* sessions.setGoalState({
      sessionID: session.id,
      goalState: {
        status: "approved",
        source: "user",
        goal: "live-goal-marker",
        dod: ["ship"],
        outOfScope: [],
        anchorUserID: "user-current",
        version: 1,
        updatedAt: 1,
      },
    })

    const enabled = yield* WorkingState.current(session.id, "user-current", true)
    const disabled = yield* WorkingState.current(session.id, "user-current", false)

    expect(enabled).toContain("live-goal-marker")
    expect(disabled).not.toContain("live-goal-marker")
    expect(disabled).toContain("unavailable or stale")
    expect(disabled).toContain("dod:")
  }),
)

// The inert state produced when the flag is off must never look like an active mission
// to any consumer (tool pinning, injection, compaction), and must not persist over a
// real contract because it carries no objective text.
it.instance("the disabled placeholder is inert everywhere a contract is inspected", () =>
  Effect.gen(function* () {
    const skipped = skippedGoalState()

    expect(skipped.status).toBe("skipped")
    expect(skipped.goal).toBe("")
    expect(isActiveGoal(skipped)).toBe(false)
    expect(isActiveGoal(undefined)).toBe(false)
    expect(formatGoalContext(skipped)).toBe("")
  }),
)
