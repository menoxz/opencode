import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { deduplicateInspectActions, localizeInspectAction, Parameters, planInspectRounds, validateInspectActions, type InspectAction } from "./inspect-batch"
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
  test("accepts numeric strings from less strict tool callers", () => {
    const value = Schema.decodeUnknownSync(Parameters)({
      actions: [{ id: "file", type: "read", filePath: "/repo/a.ts", offset: "2", limit: "60" }],
      maxConcurrency: "3", maxCharsPerResult: "2000",
    })
    expect(value.actions[0]).toMatchObject({ offset: 2, limit: 60 })
    expect(value.maxConcurrency).toBe(3)
    expect(value.maxCharsPerResult).toBe(2000)
  })

  test("localizes synchronous action errors instead of failing the batch", async () => {
    const failed = await Effect.runPromise(localizeInspectAction(
      { id: "missing", type: "read", filePath: "/missing" },
      () => { throw new Error("File not found") },
    ))
    expect(failed).toMatchObject({ id: "missing", status: "error" })
    expect(failed.error).toContain("File not found")
    const passed = await Effect.runPromise(localizeInspectAction(
      { id: "ok", type: "read", filePath: "/ok" },
      () => Effect.succeed({ title: "ok", output: "content", metadata: {} }),
    ))
    expect(passed).toMatchObject({ id: "ok", status: "success", output: "content" })
  })
})
