import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigTasks } from "./tasks"

describe("QA workflow task config", () => {
  test("accepts mandatory cleanup command", () => {
    const value = Schema.decodeUnknownSync(ConfigTasks.Info)({ command: "qa-run", cleanupCommand: "qa-reset", dependsOn: ["qa-seed"] })
    expect(value.cleanupCommand).toBe("qa-reset")
    expect(value.dependsOn).toEqual(["qa-seed"])
  })
})
