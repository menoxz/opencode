import { describe, expect, test } from "bun:test"
import { deduplicateInspectActions, planInspectRounds, validateInspectActions, type InspectAction } from "./inspect-batch"
import { SAFE_PARALLEL_LOCAL_TOOL_IDS } from "../session/tools"

const actions = (...items: InspectAction[]) => items

describe("inspect batch planning", () => {
  test("groups independent read-only actions in one round", () => {
    const input = actions(
      { id: "files", type: "glob", pattern: "**/*.ts" },
      { id: "handlers", type: "grep", pattern: "handle", include: "*.ts" },
      { id: "config", type: "read", filePath: "/repo/config.ts" },
    )
    expect(validateInspectActions(input)).toEqual([])
    expect(planInspectRounds(input).map((round) => round.map((item) => item.id))).toEqual([["files", "handlers", "config"]])
  })

  test("deduplicates identical operations even when ids differ", () => {
    const deduped = deduplicateInspectActions(actions(
      { id: "first", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
      { id: "second", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
      { id: "after", type: "grep", pattern: "x", dependsOn: ["second"] },
    ))
    expect(deduped.actions.map((item) => item.id)).toEqual(["first", "after"])
    expect(deduped.aliases).toEqual(new Map([["second", "first"]]))
    expect(deduped.actions.find((item) => item.id === "after")?.dependsOn).toEqual(["first"])
    expect(SAFE_PARALLEL_LOCAL_TOOL_IDS).toContain("inspect_batch")
  })

  test("respects explicit dependencies", () => {
    const input = actions(
      { id: "files", type: "glob", pattern: "**/*.ts" },
      { id: "config", type: "read", filePath: "/repo/config.ts", dependsOn: ["files"] },
    )
    expect(planInspectRounds(input).map((round) => round.map((item) => item.id))).toEqual([["files"], ["config"]])
  })

  test("rejects duplicate ids, missing dependencies and cycles", () => {
    expect(validateInspectActions(actions(
      { id: "a", type: "glob", pattern: "*", dependsOn: ["b"] },
      { id: "b", type: "grep", pattern: "x", dependsOn: ["a"] },
      { id: "a", type: "read", filePath: "/repo/a.ts", dependsOn: ["missing"] },
    ))).toEqual([
      "Duplicate action id: a",
      "Action a depends on unknown action: missing",
      "Dependency cycle detected: a -> b -> a",
    ])
  })
})
