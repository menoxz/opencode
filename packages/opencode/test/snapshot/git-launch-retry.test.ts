import { describe, expect, test } from "bun:test"
import { isTransientLaunchFailure } from "../../src/snapshot"

describe("snapshot git launch retry", () => {
  test("classifies the launch denials measured on this host as retryable", () => {
    expect(isTransientLaunchFailure(new Error("error launching git: Accès refusé."))).toBe(true)
    expect(isTransientLaunchFailure(new Error("EPERM: operation not permitted, uv_spawn 'git'"))).toBe(true)
    expect(isTransientLaunchFailure(new Error("EACCES: permission denied, spawn sh"))).toBe(true)
  })

  test("does not retry a real git failure", () => {
    expect(isTransientLaunchFailure(new Error("fatal: not a git repository (or any of the parent directories)"))).toBe(
      false,
    )
    expect(isTransientLaunchFailure("bad revision 'HEAD~99'")).toBe(false)
  })
})
