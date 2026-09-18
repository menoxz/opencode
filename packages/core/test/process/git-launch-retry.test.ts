import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess, isTransientLaunchFailure, retryTransientLaunch } from "@opencode-ai/core/process"
import { testEffect } from "../lib/effect"

const it = testEffect(AppProcess.defaultLayer)

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

  it.live("runs a real git command through the retrying path", () =>
    Effect.gen(function* () {
      const proc = yield* AppProcess.Service
      const result = yield* retryTransientLaunch(
        proc.run(ChildProcess.make("git", ["--version"], { extendEnv: true, stdin: "ignore" })),
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString("utf8")).toContain("git version")
    }),
  )
})
