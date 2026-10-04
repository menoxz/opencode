import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import {
  deduplicateInspectActions,
  inspectDependencySatisfied,
  localizeInspectAction,
  orderedInspectResults,
  Parameters,
  planInspectRounds,
  validateInspectActions,
  type InspectAction,
  type ActionResult,
} from "./inspect-batch"
import { SAFE_PARALLEL_LOCAL_TOOL_IDS } from "../session/tools"

const actions = (...items: InspectAction[]) => items

describe("inspect batch planning", () => {
  test("bounded excerpts include the marker without splitting Unicode", async () => {
    const result = await Effect.runPromise(
      localizeInspectAction(
        { id: "unicode", type: "read", filePath: "/repo/a.ts" },
        () => Effect.succeed({ title: "a.ts", output: "😀".repeat(4000) }),
        1000,
      ),
    )
    expect(result.truncated).toBe(true)
    expect(result.output!.length).toBeLessThanOrEqual(1000)
    expect(result.output).toContain("[inspect_batch result truncated]")
    expect(new TextDecoder().decode(new TextEncoder().encode(result.output))).toBe(result.output!)
  })
  test("duplicate inspections execute once and emit content once without losing status", async () => {
    const input = actions(
      { id: "first", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
      { id: "second", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
    )
    const deduped = deduplicateInspectActions(input)
    const executions: string[] = []
    const results = new Map<string, ActionResult>()
    for (const action of deduped.actions) {
      results.set(
        action.id,
        await Effect.runPromise(
          localizeInspectAction(
            action,
            () => {
              executions.push(action.id)
              return Effect.succeed({ title: "a.ts", output: "evidence".repeat(1000) })
            },
            1000,
          ),
        ),
      )
    }
    const ordered = orderedInspectResults(input, deduped.aliases, results)
    expect(executions).toEqual(["first"])
    expect(ordered[1]).toMatchObject({ id: "second", aliasOf: "first", status: "success", truncated: true })
    expect(ordered[1].output).toBe("Same inspection as first; use that result.")
    expect(JSON.stringify(ordered).length).toBeLessThan(
      JSON.stringify([ordered[0], { ...ordered[0], id: "second" }]).length,
    )
    const failed = orderedInspectResults(
      input,
      deduped.aliases,
      new Map([["first", { id: "first", type: "read", status: "error", error: "Permission denied" }]]),
    )
    expect(failed[1]).toMatchObject({ status: "error", error: "Permission denied", aliasOf: "first" })
    expect(inspectDependencySatisfied(failed[1])).toBe(false)
  })
  test("groups independent read-only actions in one round", () => {
    const input = actions(
      { id: "files", type: "glob", pattern: "**/*.ts" },
      { id: "handlers", type: "grep", pattern: "handle", include: "*.ts" },
      { id: "config", type: "read", filePath: "/repo/config.ts" },
    )
    expect(validateInspectActions(input)).toEqual([])
    expect(planInspectRounds(input).map((round) => round.map((item) => item.id))).toEqual([
      ["files", "handlers", "config"],
    ])
  })

  test("deduplicates identical operations even when ids differ", () => {
    const deduped = deduplicateInspectActions(
      actions(
        { id: "first", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
        { id: "second", type: "read", filePath: "/repo/a.ts", offset: 1, limit: 20 },
        { id: "after", type: "grep", pattern: "x", dependsOn: ["second"] },
      ),
    )
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
    expect(
      validateInspectActions(
        actions(
          { id: "a", type: "glob", pattern: "*", dependsOn: ["b"] },
          { id: "b", type: "grep", pattern: "x", dependsOn: ["a"] },
          { id: "a", type: "read", filePath: "/repo/a.ts", dependsOn: ["missing"] },
        ),
      ),
    ).toEqual([
      "Duplicate action id: a",
      "Action a depends on unknown action: missing",
      "Dependency cycle detected: a -> b -> a",
    ])
  })
  test("accepts numeric strings from less strict tool callers", () => {
    const value = Schema.decodeUnknownSync(Parameters)({
      actions: [{ id: "file", type: "read", filePath: "/repo/a.ts", offset: "2", limit: "60" }],
      maxConcurrency: "3",
      maxCharsPerResult: "2000",
    })
    expect(value.actions[0]).toMatchObject({ offset: 2, limit: 60 })
    expect(value.maxConcurrency).toBe(3)
    expect(value.maxCharsPerResult).toBe(2000)
  })

  test("localizes synchronous action errors instead of failing the batch", async () => {
    const failed = await Effect.runPromise(
      localizeInspectAction({ id: "missing", type: "read", filePath: "/missing" }, () => {
        throw new Error("File not found")
      }),
    )
    expect(failed).toMatchObject({ id: "missing", status: "error" })
    expect(failed.error).toContain("File not found")
    const passed = await Effect.runPromise(
      localizeInspectAction({ id: "ok", type: "read", filePath: "/ok" }, () =>
        Effect.succeed({ title: "ok", output: "content", metadata: {} }),
      ),
    )
    expect(passed).toMatchObject({ id: "ok", status: "success", output: "content" })
  })
  test("classifies a read offset beyond EOF as empty discovery", async () => {
    const empty = await Effect.runPromise(
      localizeInspectAction({ id: "tail", type: "read", filePath: "/repo/a.ts", offset: 500 }, () =>
        Effect.fail(new Error("Offset 500 is out of range for this file (473 lines)")),
      ),
    )
    expect(empty).toEqual({
      id: "tail",
      type: "read",
      status: "empty",
      title: "No content at requested offset",
      output: "Offset 500 is beyond the end of the file (473 lines).",
    })
    expect(inspectDependencySatisfied(empty)).toBe(true)
    const defect = await Effect.runPromise(
      localizeInspectAction({ id: "tail-defect", type: "read", filePath: "/repo/a.ts", offset: 80 }, () =>
        Effect.die(new Error("Offset 80 is out of range for this file (19 lines)")),
      ),
    )
    expect(defect).toMatchObject({ id: "tail-defect", status: "empty" })
    const realFailure = await Effect.runPromise(
      localizeInspectAction({ id: "glob", type: "glob", pattern: "*" }, () =>
        Effect.fail(new Error("Offset 500 is out of range for this file (473 lines)")),
      ),
    )
    expect(realFailure.status).toBe("error")
    expect(inspectDependencySatisfied(realFailure)).toBe(false)
  })
})
