import { describe, expect, test } from "bun:test"
import { planInspectRounds, validateInspectActions, type InspectAction } from "./inspect-batch"

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
