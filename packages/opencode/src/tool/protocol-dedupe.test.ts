import { describe, expect, test } from "bun:test"
import { visibleGoalContractToolIDs } from "./protocol-dedupe"

describe("goal contract catalog dedupe", () => {
  test("keeps legacy aliases visible by default", () => {
    expect(visibleGoalContractToolIDs(false)).toEqual([
      "create_objectif", "create_objective", "edit_objectif", "edit_objective",
      "suggest_objectif", "complete_objectif", "complete_objective", "apply_contract_from_prompt",
    ])
  })
  test("exposes only canonical tools when opt-in is enabled", () => {
    expect(visibleGoalContractToolIDs(true)).toEqual([
      "create_objective", "edit_objective", "suggest_objectif", "complete_objective", "apply_contract_from_prompt",
    ])
  })
})
