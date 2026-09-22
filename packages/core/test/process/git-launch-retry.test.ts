import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import * as PlatformError from "effect/PlatformError"
import {
  AppProcess,
  isTransientLaunchFailure,
  retryTransientLaunch,
  retryTransientLaunchSync,
} from "@opencode-ai/core/process"

const denied = () => new Error("EPERM: operation not permitted, uv_spawn 'git'")

describe("transient child-process launch retry", () => {
  test("classifies the launch denials measured on this host as retryable", () => {
    expect(isTransientLaunchFailure(denied())).toBe(true)
    expect(isTransientLaunchFailure(new Error("error launching git: Accès refusé."))).toBe(true)
    expect(isTransientLaunchFailure(new Error("EACCES: permission denied, spawn sh"))).toBe(true)
    expect(isTransientLaunchFailure("EBUSY: resource busy or locked, spawn git")).toBe(true)
  })

  test("sees the denial through AppProcessError, whose own message is empty", () => {
    const wrapped = new AppProcess.AppProcessError({ command: "git status --porcelain", cause: denied() })
    expect(wrapped.message).toBe("")
    expect(isTransientLaunchFailure(wrapped)).toBe(true)
    expect(
      isTransientLaunchFailure(
        new AppProcess.AppProcessError({ command: "git status", exitCode: 1, stderr: "EPERM: launch denied" }),
      ),
    ).toBe(true)
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

  test("re-runs a transiently denied effect and stops on the first real failure", async () => {
    let attempts = 0
    const flaky = Effect.gen(function* () {
      attempts += 1
      if (attempts < 3) return yield* Effect.fail(denied())
      return "started"
    })
    expect(await Effect.runPromise(retryTransientLaunch(flaky))).toBe("started")
    expect(attempts).toBe(3)

    let refusals = 0
    const permanent = Effect.gen(function* () {
      refusals += 1
      return yield* Effect.fail(new Error("fatal: not a git repository (or any of the parent directories)"))
    })
    expect(Exit.isFailure(await Effect.runPromiseExit(retryTransientLaunch(permanent)))).toBe(true)
    expect(refusals).toBe(1)
  })

  test("sees the denial through an Effect PlatformError, even when the reason tag is Unknown", () => {
    const errno = Object.assign(new Error("spawn denied"), { code: "EPERM", syscall: "uv_spawn" })
    expect(
      isTransientLaunchFailure(
        PlatformError.systemError({
          _tag: "Unknown",
          module: "ChildProcess",
          method: "spawn",
          pathOrDescriptor: "git",
          syscall: "uv_spawn",
          cause: errno,
        }),
      ),
    ).toBe(true)
    expect(
      isTransientLaunchFailure(
        PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "ChildProcess",
          method: "spawn",
          pathOrDescriptor: "git",
          syscall: "uv_spawn",
          cause: new Error("spawn EACCES"),
        }),
      ),
    ).toBe(true)
  })

  test("retries a refused synchronous start and rethrows a permanent failure", () => {
    let attempts = 0
    const flaky = () => {
      attempts += 1
      if (attempts < 3) throw denied()
      return "started"
    }
    expect(retryTransientLaunchSync(flaky)).toBe("started")
    expect(attempts).toBe(3)

    let permanent = 0
    expect(() =>
      retryTransientLaunchSync(() => {
        permanent += 1
        throw new Error("fatal: not a git repository (or any of the parent directories)")
      }),
    ).toThrow()
    expect(permanent).toBe(1)
  })
})
