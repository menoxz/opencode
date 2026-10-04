import { describe, expect, test } from "bun:test"
import { AppProcess, isTransientLaunchFailure } from "@opencode-ai/core/process"

describe("snapshot git launch retry", () => {
  test("classifies the launch denials measured on this host as retryable", () => {
    expect(isTransientLaunchFailure(new Error("error launching git: Accès refusé."))).toBe(true)
    expect(isTransientLaunchFailure(new Error("EPERM: operation not permitted, uv_spawn 'git'"))).toBe(true)
    expect(isTransientLaunchFailure(new Error("EACCES: permission denied, spawn sh"))).toBe(true)
    expect(isTransientLaunchFailure("EBUSY: resource busy or locked, spawn git")).toBe(true)
  })

  test("sees the denial through AppProcessError, whose own message is empty", () => {
    const wrapped = new AppProcess.AppProcessError({
      command: "git status --porcelain",
      cause: new Error("EPERM: operation not permitted, uv_spawn 'git'"),
    })
    expect(wrapped.message).toBe("")
    expect(isTransientLaunchFailure(wrapped)).toBe(true)
  })

  test("does not retry a real git failure", () => {
    expect(isTransientLaunchFailure(new Error("fatal: not a git repository (or any of the parent directories)"))).toBe(
      false,
    )
    expect(isTransientLaunchFailure("bad revision 'HEAD~99'")).toBe(false)
    expect(
      isTransientLaunchFailure(
        new AppProcess.AppProcessError({ command: "git status", exitCode: 128, stderr: "fatal: not a git repository" }),
      ),
    ).toBe(false)
  })
})
