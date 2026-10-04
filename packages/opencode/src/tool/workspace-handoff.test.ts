import { describe, expect, test } from "bun:test"
import { buildHandoffCapsule, handoffPermissionPlan, validateWorkspaceTarget } from "./workspace-handoff"
import { SECURITY_GATED_TOOLS } from "./security"

describe("workspace_handoff", () => {
  test("rejects same workspace, filesystem root and internal dependency directories", () => {
    expect(validateWorkspaceTarget("C:\\repo", "C:\\repo")).toContain("already")
    expect(validateWorkspaceTarget("C:\\repo", "C:\\")).toContain("filesystem root")
    expect(validateWorkspaceTarget("C:\\repo", "C:\\repo\\node_modules\\demo")).toContain("node_modules")
    expect(validateWorkspaceTarget("C:\\repo", "C:\\projects\\demo")).toBeUndefined()
  })

  test("builds a bounded redacted continuation capsule", () => {
    const capsule = buildHandoffCapsule({
      sourceSessionID: "ses_source", sourceDirectory: "C:\\repo-a", targetDirectory: "C:\\repo-b",
      reason: "The request belongs to a new medical design project",
      instructions: "Continue with token sk-secret-abcdefghijklmnopqrstuvwxyz and password=supersecret",
      goalState: {
        goal: "Build the target", dod: Array.from({ length: 30 }, (_, i) => `DoD ${i} ${"x".repeat(300)}`),
        findings: [{ id: "SEC-1", severity: "high", status: "open", summary: "Must remain sticky", evidence: ["proof"] }],
      } as any,
    })
    expect(capsule.length).toBeLessThanOrEqual(4_000)
    expect(capsule).toContain("ses_source")
    expect(capsule).toContain("SEC-1")
    expect(capsule).toContain("Must remain sticky")
    expect(capsule).not.toContain("sk-secret")
    expect(capsule).not.toContain("supersecret")
    expect(capsule).toContain("[REDACTED]")
  })
  test("is hidden from non-interactive eval mode", () => {
    expect(SECURITY_GATED_TOOLS).toContain("workspace_handoff")
  })
  test("asks external access before creating an external directory", () => {
    expect(handoffPermissionPlan("C:\\repo", "C:\\projects\\demo", false)).toEqual(["external_directory", "edit"])
    expect(handoffPermissionPlan("C:\\repo", "C:\\repo\\demo", false)).toEqual(["edit"])
  })
})
