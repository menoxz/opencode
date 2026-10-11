/**
 * H7 — one canonical contract surface per turn (deduplication without loss).
 *
 * The reference turn is assembled from the REAL producers of each surface:
 *   - `<task-contract>`       produced by `formatGoalContext` (compaction.ts:217) and pushed
 *                             to the volatile tail by `prompt.ts:2411`
 *   - `<working-state>` card  produced by `WorkingState.current` (llm.ts:169) and attached as
 *                             the request tail by `WorkingState.attach` (request.ts:298)
 *   - `<context_slots>`       produced by `ContextLedger.contextCapsule` — the single reuse
 *                             capsule; `holdings-capsule.ts` was deleted and its role absorbed
 *
 * It pins both halves of the DoD at once: the objective and the DoD list each appear EXACTLY
 * once in prefix+tail (non-loss), and the deduplicated turn is strictly smaller than the
 * legacy duplicated turn, compared as ABSOLUTE byte values.
 *
 * §8 case 5 (an instruction file injected in `system` is not re-attached by the upward walk,
 * instruction.ts:310+) is covered by the guard `sys.has(found)` at instruction.ts:329 and
 * pinned by `test/session/instruction.test.ts`, which the H7 regression re-runs.
 */
import { describe, expect, test } from "bun:test"
import { formatGoalContext } from "../../src/session/compaction"
import * as ContextLedger from "../../src/session/context-ledger"
import type { GoalState } from "../../src/session/goal-state"
import { WorkingState } from "../../src/session/working-state"

const USER = "user-h7"
// Distinctive single tokens that survive `compressGoalState` verbatim (no sentence split,
// no truncation), so their occurrence count is a faithful proxy for "the contract was copied".
const GOAL = "MISSION_GOAL_MARKER ship the dedup"
const DOD_A = "DOD_MARKER_ALPHA"
const DOD_B = "DOD_MARKER_BETA"
const OOS = "OUT_OF_SCOPE_MARKER"

const goalState = (): GoalState =>
  ({
    status: "approved",
    source: "user",
    goal: GOAL,
    dod: [DOD_A, DOD_B],
    outOfScope: [OOS],
    version: 1,
    updatedAt: 1,
    anchorUserID: USER,
  }) as unknown as GoalState

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1
const bytes = (value: string) => Buffer.byteLength(value)

// prompt.ts:2411 — the contract rides the volatile tail, never the cached system segment.
const contract = formatGoalContext(goalState())!
const hasContract = (entries: readonly string[]) =>
  entries.some((entry) => entry.includes("<task-contract"))

const SYSTEM_PREFIX = ["<system>harness prefix</system>"]

const card = (includeContract: boolean) =>
  WorkingState.render({ userID: USER, goal: goalState(), todos: [], includeContract })

/** Assemble prefix + volatile tail + request tail exactly as prompt.ts / request.ts do. */
const assembleTurn = (options: { withContract: boolean; includeContract: boolean }): string => {
  const volatile = options.withContract ? [contract] : []
  const tail = WorkingState.attach([], card(options.includeContract)).map((message) =>
    String(message.content),
  )
  return [...SYSTEM_PREFIX, ...volatile, ...tail].join("\n")
}

// The production decision (prompt.ts): the card drops its contract copy when the turn
// already carries `<task-contract>`.
const referenceTurn = assembleTurn({ withContract: true, includeContract: !hasContract([contract]) })
// The pre-H7 behaviour, kept as the byte baseline.
const legacyTurn = assembleTurn({ withContract: true, includeContract: true })

describe("H7 — the objective is injected exactly once", () => {
  test("the reference turn carries the goal string once (task-contract, not re-rendered)", () => {
    expect(countOccurrences(referenceTurn, GOAL)).toBe(1)
  })

  test("the reference turn carries each DoD item once", () => {
    expect(countOccurrences(referenceTurn, DOD_A)).toBe(1)
    expect(countOccurrences(referenceTurn, DOD_B)).toBe(1)
  })

  test("the card drops goal/dod/out_of_scope but keeps ephemeral state", () => {
    const deduped = card(false)!
    const legacy = card(true)!
    expect(legacy).toContain(GOAL)
    expect(legacy).toContain(DOD_A)
    expect(deduped).not.toContain(GOAL)
    expect(deduped).not.toContain(DOD_A)
    expect(deduped).not.toContain(OOS)
    // The card is still present and still useful.
    expect(deduped).toContain(WorkingState.MARKER)
    expect(deduped).toContain("contract_status")
    expect(deduped).toContain("active_todo")
  })
})

describe("H7 — the dedup guard holds in both directions (mutation)", () => {
  test("includeContract=false WITH a contract present adds no second copy", () => {
    const turn = assembleTurn({ withContract: true, includeContract: false })
    expect(countOccurrences(turn, GOAL)).toBe(1)
    expect(countOccurrences(turn, DOD_A)).toBe(1)
  })

  test("includeContract=true WITHOUT a contract still produces exactly one copy", () => {
    const turn = assembleTurn({ withContract: false, includeContract: true })
    expect(countOccurrences(turn, GOAL)).toBe(1)
    expect(countOccurrences(turn, DOD_A)).toBe(1)
  })
})

describe("H7 — a single reuse capsule", () => {
  test("the turn carries <context_slots> and never the deleted <context-holdings>", () => {
    const session = "h7-capsule"
    ContextLedger.reset()
    ContextLedger.observe(session, {
      tool: "read",
      args: { filePath: "src/a.ts", offset: 1, limit: 120 },
      step: 3,
      at: 1_000,
      truth: "observed",
      output: "export const a = 1",
    })
    const slots = ContextLedger.contextCapsule(session)
    const turn = [...SYSTEM_PREFIX, slots].join("\n")
    const holdings = countOccurrences(turn, "<context-holdings>")
    const slotHeaders = countOccurrences(turn, "<context_slots>")
    expect(slotHeaders).toBe(1)
    expect(holdings).toBe(0)
    expect(holdings + slotHeaders).toBe(1)
  })
})

// Measured before the patch on the reference turn (fixture GOAL/DOD_A/DOD_B/OOS above) and
// frozen in the same changeset, per H7 §7/§8.6. Re-measure here if the fixture changes.
const BYTES_BASELINE_LEGACY = 940

describe("H7 — byte saving on the reference turn (absolute values)", () => {
  test("the deduplicated turn is strictly smaller than the legacy duplicated turn", () => {
    const after = bytes(referenceTurn)
    const baseline = bytes(legacyTurn)
    // Absolute values, never a ratio whose denominator this patch lowers.
    expect(baseline).toBe(BYTES_BASELINE_LEGACY)
    expect(after).toBeLessThan(baseline)
    console.log(`H7 bytes after=${after} baseline=${baseline} saved=${baseline - after}`)
  })
})
