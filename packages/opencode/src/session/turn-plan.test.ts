import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  MAX_CAPSULE_CHARS,
  MAX_FIELD_CHARS,
  MAX_SESSIONS,
  TurnPlanSchema,
  clear,
  current,
  declare,
  declaredIntent,
  enabled,
  instruction,
  normalize,
  reminder,
  render,
  renderCommitment,
  settle,
} from "./turn-plan"

describe("turn plan declaration is bounded and transient", () => {
  test("rejects a declaration without an intent or an expectation", () => {
    expect(normalize({ intent: "  ", expect: "a file exists" })).toBeUndefined()
    expect(normalize({ intent: "read the ledger", expect: "" })).toBeUndefined()
  })

  test("clips every field to the budget", () => {
    const plan = normalize({ intent: "a".repeat(500), expect: "b".repeat(500), onFail: "c".repeat(500) })
    expect(plan?.intent.length).toBe(MAX_FIELD_CHARS)
    expect(plan?.expect.length).toBe(MAX_FIELD_CHARS)
    expect(plan?.onFail?.length).toBe(MAX_FIELD_CHARS)
  })

  test("replaces the previous plan instead of accumulating it", () => {
    const session = "ses_turn_plan_replace"
    declare(session, { intent: "first", expect: "one" }, 1)
    declare(session, { intent: "second", expect: "two" }, 2)
    expect(current(session)?.plan.intent).toBe("second")
    clear(session)
  })

  test("evicts the oldest session once the retention bound is reached", () => {
    const first = "ses_turn_plan_evict_0"
    declare(first, { intent: "old", expect: "old" }, 1)
    for (let index = 1; index <= MAX_SESSIONS; index++) {
      declare(`ses_turn_plan_evict_${index}`, { intent: "new", expect: "new" }, index)
    }
    expect(current(first)).toBeUndefined()
    for (let index = 0; index <= MAX_SESSIONS; index++) clear(`ses_turn_plan_evict_${index}`)
  })
})

describe("turn plan lifecycle is two-staged", () => {
  test("restates the commitment exactly once", () => {
    const session = "ses_turn_plan_reminder"
    declare(session, { intent: "read the ledger", expect: "holdings present" }, 1)
    expect(reminder(session)?.intent).toBe("read the ledger")
    expect(reminder(session)).toBeUndefined()
    clear(session)
  })

  test("never settles a plan that has not been reminded yet", () => {
    const session = "ses_turn_plan_unreminded"
    declare(session, { intent: "probe", expect: "holdings present" }, 1)
    expect(settle(session, "holdings present").verdict).toBe("no-plan")
    expect(current(session)).toBeDefined()
    clear(session)
  })

  test("consumes a reminded plan so it answers exactly one turn", () => {
    const session = "ses_turn_plan_consumed"
    declare(session, { intent: "probe", expect: "holdings present" }, 1)
    reminder(session)
    expect(settle(session, "the ledger now shows holdings present").verdict).toBe("confirmed")
    expect(settle(session, "the ledger now shows holdings present").verdict).toBe("no-plan")
    clear(session)
  })
})

describe("turn plan reconciliation shares the single comparator", () => {
  test("confirms when the observation contains the declared expectation", () => {
    const session = "ses_turn_plan_confirmed"
    declare(session, { intent: "read the ledger", expect: "ledger contains holdings" }, 1)
    reminder(session)
    const outcome = settle(session, "the ledger file contains holdings for two sessions")
    expect(outcome.verdict).toBe("confirmed")
    expect(outcome.missed).toEqual([])
  })

  test("misses when nothing of the expectation is observed", () => {
    const session = "ses_turn_plan_missed"
    declare(session, { intent: "run the suite", expect: "suite exits zero passes" }, 1)
    reminder(session)
    const outcome = settle(session, "the command was not found")
    expect(outcome.verdict).toBe("missed")
    expect(outcome.missed).toEqual(["suite", "exits", "zero", "passes"])
  })

  test("applies the repo's majority rule rather than an all-tokens rule", () => {
    const session = "ses_turn_plan_majority"
    declare(session, { intent: "typecheck", expect: "typecheck exits zero warnings" }, 1)
    reminder(session)
    expect(settle(session, "the typecheck finished with zero warnings").verdict).toBe("confirmed")
  })
})

describe("turn plan authority is the lowest of the loop", () => {
  test("marks an unmet engagement as an executable action", () => {
    const plan = normalize({ intent: "retry the read", expect: "the file now exists" })!
    expect(declaredIntent("missed", plan)).toBe("execute")
  })

  test("lets a confirmed engagement stop the turn", () => {
    const plan = normalize({ intent: "write the file", expect: "the file exists" })!
    expect(declaredIntent("confirmed", plan)).toBe("none")
  })

  test("stays silent without a plan so the harness keeps its own inference", () => {
    expect(declaredIntent("no-plan", undefined)).toBeUndefined()
    expect(declaredIntent("missed", undefined)).toBeUndefined()
  })
})

describe("turn plan projection", () => {
  test("carries the low-authority marker and the reconciliation verdict", () => {
    const plan = normalize({ intent: "build", expect: "smoke test passed" })!
    const capsule = render({ plan, verdict: "missed", missed: ["smoke", "test", "passed"] })
    expect(capsule).toContain('authority="inferred"')
    expect(capsule).toContain("was NOT observed")
    expect(capsule).toContain("run the declared fallback")
  })

  test("restates the commitment under its own stage marker", () => {
    const plan = normalize({ intent: "build", expect: "smoke test passed" })!
    expect(renderCommitment(plan)).toContain('stage="commitment"')
  })

  test("stays within the capsule budget", () => {
    const plan = normalize({ intent: "x".repeat(500), expect: "y".repeat(500), onFail: "z".repeat(500) })!
    expect(render({ plan, verdict: "missed", missed: ["a", "b"] }).length).toBeLessThanOrEqual(MAX_CAPSULE_CHARS)
    expect(renderCommitment(plan).length).toBeLessThanOrEqual(MAX_CAPSULE_CHARS)
  })

  test("asks for the four bounded fields in the protocol", () => {
    const protocol = instruction()
    expect(protocol).toContain("`intent`")
    expect(protocol).toContain("`expect`")
    expect(protocol).toContain("`on_fail`")
    expect(protocol).toContain("`stop_if`")
  })
})

describe("turn plan schema", () => {
  test("round-trips a decoded declaration", () => {
    const decoded = Schema.decodeUnknownSync(TurnPlanSchema)({ intent: "a", expect: "b" })
    expect(decoded.onFail).toBeUndefined()
    expect(decoded.stopIf).toBeUndefined()
  })
})

describe("turn plan enablement is one shared predicate", () => {
  test("enables the protocol from the config alone, exactly like the tool registry", () => {
    expect(enabled({ flag: false, config: true })).toBe(true)
  })

  test("enables the protocol from the environment flag alone", () => {
    expect(enabled({ flag: true, config: undefined })).toBe(true)
  })

  test("stays disabled when neither the flag nor the config asks for it", () => {
    expect(enabled({ flag: false, config: undefined })).toBe(false)
    expect(enabled({ flag: false, config: false })).toBe(false)
  })
})

describe("the protocol demands a plan every turn without displaying it", () => {
  test("asks for the plan on every turn, not only when work is left open", () => {
    expect(instruction()).toContain("On every turn")
  })

  test("keeps the plan out of the visible answer", () => {
    expect(instruction()).toContain("Keep the plan out of your visible answer")
  })
})
