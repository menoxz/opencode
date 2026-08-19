export const LEGACY_GOAL_CONTRACT_TOOL_IDS = [
  "create_objectif",
  "create_objective",
  "edit_objectif",
  "edit_objective",
  "suggest_objectif",
  "complete_objectif",
  "complete_objective",
  "apply_contract_from_prompt",
] as const

export const CANONICAL_GOAL_CONTRACT_TOOL_IDS = [
  "create_objective",
  "edit_objective",
  "suggest_objectif",
  "complete_objective",
  "apply_contract_from_prompt",
] as const

export type GoalContractToolID = (typeof LEGACY_GOAL_CONTRACT_TOOL_IDS)[number]

export function visibleGoalContractToolIDs(dedupe: boolean): GoalContractToolID[] {
  return [...(dedupe ? CANONICAL_GOAL_CONTRACT_TOOL_IDS : LEGACY_GOAL_CONTRACT_TOOL_IDS)]
}

export function selectVisibleGoalContractTools(
  dedupe: boolean,
  tools: Record<GoalContractToolID, unknown>,
): unknown[] {
  return visibleGoalContractToolIDs(dedupe).map((id) => tools[id])
}
