import { describe, expect, test } from "bun:test"
import * as PlatformError from "effect/PlatformError"
import { launchRefused } from "../../src/process"

// Mirrors the real refusal exactly: `toPlatformError` puts `code` on the cause
// and never on the envelope (`cross-spawn-spawner.ts`).
const refused = (tag: PlatformError.SystemErrorTag, code: string) =>
  PlatformError.systemError({
    _tag: tag,
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: "pwsh",
    syscall: "uv_spawn",
    cause: Object.assign(new Error(`${code}: uv_spawn 'pwsh'`), { code, syscall: "uv_spawn" }),
  })

const reason = (e: unknown) => (e as { reason: { _tag: string; cause: Error } }).reason
const text = (e: unknown) => reason(e).cause.message

describe("launchRefused", () => {
  test("tells lock contention and a permission denial apart", () => {
    const busy = launchRefused("pwsh", 8, refused("Busy", "EBUSY"))
    const denied = launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM"))

    // the fork: same code path, opposite levers
    expect(text(busy)).toContain("EBUSY")
    expect(text(busy)).toContain("wait for the lock")
    expect(text(busy)).not.toContain("grant the executing identity rights")

    expect(text(denied)).toContain("EPERM")
    expect(text(denied)).toContain("grant the executing identity rights")
    expect(text(denied)).not.toContain("wait for the lock")

    // a refactor that collapses `tagOf` cannot satisfy both halves
    expect(text(busy)).not.toBe(text(denied))
  })

  test("keeps the tag on the failure channel and the diagnostic on the cause", () => {
    expect(reason(launchRefused("pwsh", 8, refused("Busy", "EBUSY")))._tag).toBe("Busy")
    expect(reason(launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM")))._tag).toBe("PermissionDenied")
    expect(text(launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM")))).toContain("No process was created")
  })

  test("names the executable and the spent budget", () => {
    const denied = launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM"))
    expect(text(denied)).toContain("after 8 attempts")
    expect(text(denied)).toContain("pwsh")
  })

  test("drops the Underlying error suffix when the message is empty", () => {
    // A literal, not a systemError: the empty `message` is pinned by construction
    // instead of relying on PlatformError's message derivation.
    const empty = {
      reason: { _tag: "PermissionDenied" },
      message: "",
      cause: Object.assign(new Error(""), { code: "EPERM" }),
    }
    const m = launchRefused("pwsh", 8, empty)
    expect(text(m)).toContain("EPERM")
    expect(text(m)).not.toContain("Underlying error:")
  })

  // `SystemError.message` renders `description` and never `cause`, so the lever
  // has to be on `description` for a plain message reader to see it.
  test("puts the lever on the field Effect renders as the message", () => {
    const denied = launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM"))
    expect((denied.reason as { description?: string }).description).toContain("grant the executing identity rights")
    expect(denied.message).toContain("grant the executing identity rights")
  })
})
