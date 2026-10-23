import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  MAX_ACTION_CHARS,
  MAX_ACTIONS,
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
  test("still demands the plan on every turn, not only when work is left open", () => {
    expect(instruction()).toContain("On every turn")
  })

  test("frames the turn as a batch instead of a single action", () => {
    const protocol = instruction()
    expect(protocol).toContain("BATCH this turn delivers")
    expect(protocol).toContain("parallel tool calls")
    expect(protocol).not.toContain("the ONE action")
  })

  test("forbids spending a turn on work that was already ready", () => {
    expect(instruction()).toContain("Declare only what genuinely remains")
  })

  test("keeps the plan out of the visible answer", () => {
    expect(instruction()).toContain("Keep the plan out of your visible answer")
  })
})

describe("named actions make the batch concrete", () => {
  // Le champ existe pour produire des NOMS : une phrase d'intention ne donne rien a
  // regrouper, trois cibles nommees si. Mesure de reference : un perimetre enumere dans la
  // demande fait passer t1 de 6,75 a 5,00 boucles (docs/HARNESS.md).
  test("keeps the named targets instead of only the outcome sentence", () => {
    const plan = normalize({
      intent: "inspect the package",
      expect: "package.json read",
      actions: ["read package.json", "read tsconfig.json", "grep SessionPrompt"],
    })
    expect(plan?.actions).toEqual(["read package.json", "read tsconfig.json", "grep SessionPrompt"])
  })

  test("drops an empty or blank list rather than keeping an empty array", () => {
    expect(normalize({ intent: "a", expect: "b", actions: [] })?.actions).toBeUndefined()
    expect(normalize({ intent: "a", expect: "b", actions: ["   ", ""] })?.actions).toBeUndefined()
  })

  test("clips each target and caps the list", () => {
    const plan = normalize({
      intent: "a",
      expect: "b",
      actions: Array.from({ length: MAX_ACTIONS + 3 }, (_, index) => `cible ${index} ${"x".repeat(400)}`),
    })
    expect(plan?.actions?.length).toBe(MAX_ACTIONS)
    expect(plan?.actions?.[0].length).toBe(MAX_ACTION_CHARS)
  })

  test("does not invent an action to reach a count", () => {
    // Une seule cible connue reste une seule cible : le quota est precisement le mode
    // d'echec mesure sur la relance runtime, qui faisait durer les taches legitimes.
    const plan = normalize({ intent: "a", expect: "b", actions: ["read package.json"] })
    expect(plan?.actions).toHaveLength(1)
  })

  test("restates the named targets in the next turn's commitment", () => {
    const text = renderCommitment({
      intent: "inspect the package",
      expect: "package.json read",
      actions: ["read package.json", "read tsconfig.json"],
    })
    expect(text).toContain("read package.json ; read tsconfig.json")
    expect(text).toContain("do them together where independent")
  })

  test("leaves the commitment unchanged when no target was named", () => {
    const text = renderCommitment({ intent: "inspect the package", expect: "package.json read" })
    expect(text).not.toContain("Named actions")
  })

  test("prescribes the field without turning it into a quota", () => {
    const protocol = instruction()
    expect(protocol).toContain("`actions`")
    expect(protocol).toContain("Not a quota")
    expect(protocol).toContain("never invent an action to reach a count")
  })

  test("the activation gate removes the field from the protocol and the commitment", () => {
    // Le bras temoin de l'A/B : sans la puce, le modele ne remplit jamais le champ, donc les
    // deux bras ne different que par cette fonctionnalite.
    const previous = process.env.OPENCODE_TURN_PLAN_ACTIONS
    process.env.OPENCODE_TURN_PLAN_ACTIONS = "0"
    try {
      expect(instruction()).not.toContain("`actions`")
      expect(renderCommitment({ intent: "a", expect: "b", actions: ["read package.json"] })).not.toContain(
        "Named actions",
      )
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_TURN_PLAN_ACTIONS
      else process.env.OPENCODE_TURN_PLAN_ACTIONS = previous
    }
  })

  test("the gate is on unless explicitly switched off", () => {
    const previous = process.env.OPENCODE_TURN_PLAN_ACTIONS
    delete process.env.OPENCODE_TURN_PLAN_ACTIONS
    try {
      expect(instruction()).toContain("`actions`")
    } finally {
      if (previous !== undefined) process.env.OPENCODE_TURN_PLAN_ACTIONS = previous
    }
  })

  test("a disabled arm stores no actions even when the model fills the field", () => {
    // Mesure 2026-10-23 : la porte ne coupant que le protocole, 2 des 4 runs du bras
    // temoin ont rempli le champ et beneficiaient quand meme de la restitution. Un temoin
    // qui utilise la fonctionnalite ne mesure rien.
    const previous = process.env.OPENCODE_TURN_PLAN_ACTIONS
    process.env.OPENCODE_TURN_PLAN_ACTIONS = "0"
    try {
      const plan = normalize({
        intent: "inspect",
        expect: "package.json read",
        actions: ["read package.json", "read tsconfig.json"],
      })
      expect(plan?.actions).toBeUndefined()
      expect(plan?.intent).toBe("inspect")
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_TURN_PLAN_ACTIONS
      else process.env.OPENCODE_TURN_PLAN_ACTIONS = previous
    }
  })
})
