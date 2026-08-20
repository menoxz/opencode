import { describe, expect, test } from "bun:test"
import { runQaWorkflow, validateQaManifest } from "./qa-proof"

describe("qa proof workflow", () => {
  test("requires ordered proof phases and unconditional reset", () => {
    const valid = validateQaManifest({ phases: {
      seed: "seed", services: "services", ui: "ui", network: "network", database: "db", security: "security", reset: "reset",
    } })
    expect(valid.ok).toBe(true)
    expect(valid.order).toEqual(["seed", "services", "ui", "network", "database", "security"])
    expect(validateQaManifest({ phases: { seed: "x" } }).errors).toContain("Missing required phase: reset")
  })
  test("always resets and stops after the first failed phase", async () => {
    const events: string[] = []
    const report = await runQaWorkflow({ phases: {
      seed: "seed", services: "services", ui: "ui", network: "network", database: "db", security: "security", reset: "reset",
    } }, async (phase) => {
      events.push(phase)
      return phase === "ui" ? 1 : 0
    })
    expect(events).toEqual(["seed", "services", "ui", "reset"])
    expect(report.ok).toBe(false)
    expect(report.failedPhase).toBe("ui")
    expect(report.cleanupCode).toBe(0)
  })
})
