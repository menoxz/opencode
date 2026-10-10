import { Duration, Effect, Schedule } from "effect"
import * as PlatformError from "effect/PlatformError"

// Windows intermittently refuses to create a child process (`EPERM`/`EACCES`,
// "Accès refusé"). The process never started, so retrying cannot duplicate or
// corrupt repository state. `AppProcessError` carries an empty `message`: the
// denial only survives in `cause`/`stderr`, so those must be inspected too.
const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
const transientTag = /^(PermissionDenied|Busy)$/
const transientCode = /^(EPERM|EACCES|EBUSY)$/

export function isTransientLaunchFailure(error: unknown): boolean {
  const inspect = (value: unknown, seen: Set<unknown>): boolean => {
    if (value === null || value === undefined || seen.has(value)) return false
    if (typeof value === "string") return transientLaunch.test(value)
    if (value instanceof Error && transientLaunch.test(value.message)) return true
    seen.add(value)
    // Effect wraps a refused start in `PlatformError`, whose own message may
    // carry neither the errno text nor the code: the denial then only survives
    // as the inner errno (code/message) or as the reason tag. The spawner's
    // `toTag` maps `EPERM` to `Unknown`, so the errno must be read directly.
    const fields = value as {
      cause?: unknown
      stderr?: unknown
      reason?: unknown
      description?: unknown
      _tag?: unknown
      code?: unknown
    }
    if (typeof fields._tag === "string" && transientTag.test(fields._tag)) return true
    if (typeof fields.code === "string" && transientCode.test(fields.code)) return true
    if (typeof fields.description === "string" && transientLaunch.test(fields.description)) return true
    return inspect(fields.cause, seen) || inspect(fields.stderr, seen) || inspect(fields.reason, seen)
  }
  return inspect(error, new Set())
}

// A refusal arrives in bursts, and a burst can outlast a short budget: 6
// consecutive `git` denials were measured on this host. The budget therefore
// has to cover seconds, not the ~750ms of the first version, or the refusal
// escapes to the caller exactly as before.
export const LAUNCH_RETRY_ATTEMPTS = 8
export const LAUNCH_RETRY_DELAYS_MS = [50, 100, 200, 400, 800, 1600, 3200]

export const launchRetryDelayMs = (attempt: number): number =>
  LAUNCH_RETRY_DELAYS_MS[Math.min(attempt, LAUNCH_RETRY_DELAYS_MS.length - 1)]

export const retryTransientLaunch = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  self.pipe(
    Effect.retry({
      schedule: Schedule.exponential(Duration.millis(50)).pipe(Schedule.jittered),
      times: LAUNCH_RETRY_ATTEMPTS - 1,
      while: isTransientLaunchFailure,
    }),
  )

const sleepSync = (ms: number) => {
  const bun = (globalThis as { Bun?: { sleepSync?: (ms: number) => void } }).Bun
  if (bun?.sleepSync) return bun.sleepSync(ms)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// The blocking `execSync` call sites (daemon git helpers) need the same policy
// as `retryTransientLaunch`: a refused start must not be mistaken for a real
// command failure, because a swallowed denial loses the command's effect.
export function retryTransientLaunchSync<A>(launch: () => A): A {
  for (let attempt = 0; ; attempt++) {
    try {
      return launch()
    } catch (error) {
      if (attempt >= LAUNCH_RETRY_ATTEMPTS || !isTransientLaunchFailure(error)) throw error
      sleepSync(launchRetryDelayMs(attempt))
    }
  }
}

// The errno lives on `cause`, never on the `PlatformError` envelope
// (`cross-spawn-spawner.ts` builds it with `_tag`/`module`/`method`/
// `pathOrDescriptor`/`syscall`/`cause` only), so it has to be walked out the same
// way `isTransientLaunchFailure` walks it.
const errnoOf = (error: unknown, seen = new Set<unknown>()): string | undefined => {
  if (error === null || typeof error !== "object" || seen.has(error)) return undefined
  seen.add(error)
  const fields = error as { code?: unknown; cause?: unknown; reason?: unknown; stderr?: unknown }
  if (typeof fields.code === "string") return fields.code
  return errnoOf(fields.cause, seen) ?? errnoOf(fields.reason, seen) ?? errnoOf(fields.stderr, seen)
}

const tagOf = (error: unknown): string | undefined => {
  const tag = (error as { reason?: { _tag?: unknown } })?.reason?._tag
  return typeof tag === "string" ? tag : undefined
}

// `PlatformError.message` is derived from the envelope's fields, so the useful
// diagnostic is the innermost message: the errno's own text. An empty or
// non-string message contributes nothing, which keeps an empty
// `Underlying error:` suffix off the page.
const detailOf = (error: unknown, seen = new Set<unknown>()): string => {
  if (error === null || typeof error !== "object" || seen.has(error)) return ""
  seen.add(error)
  const fields = error as { message?: unknown; cause?: unknown; reason?: unknown }
  const inner = detailOf(fields.cause, seen) || detailOf(fields.reason, seen)
  if (inner) return inner
  return typeof fields.message === "string" ? fields.message.trim() : ""
}

/**
 * The failure a caller surfaces once the launch budget is spent. A refusal
 * creates no process, so the command never ran and there is nothing to clean up;
 * what the caller needs instead is the executable, the spent budget and the one
 * lever that matches *this* denial.
 */
export function launchRefused(executable: string, attempts: number, error: unknown): PlatformError.PlatformError {
  const errno = errnoOf(error) ?? "unknown"
  const tag = tagOf(error)
  // `Busy` is lock contention: waiting is the only lever. `PermissionDenied` is a
  // permission denial: only execution rights help. Same code path, opposite
  // diagnostics — the fork belongs here, not in the reader's guess.
  const lever =
    tag === "Busy"
      ? `the host was busy (${errno}); wait for the lock to clear, then retry`
      : tag === "PermissionDenied"
        ? `the host refused to create "${executable}" (${errno}); grant the executing identity rights on that path`
        : `the host refused to create "${executable}" (${errno})`
  const detail = detailOf(error)
  const suffix = detail ? ` Underlying error: ${detail}` : ""
  const text =
    `opencode could not start a process after ${attempts} attempts: ${lever}. No process was ` +
    `created, so the command never ran and nothing needs cleanup.${suffix}`
  // `description` is the one field `SystemError.message` renders, so the lever
  // reaches every message reader; the full sentence rides on `cause`, which
  // `Cause.pretty` prints and the errno readers already walk.
  return PlatformError.systemError({
    _tag: tag === "Busy" ? "Busy" : "PermissionDenied",
    module: "ChildProcess",
    method: "spawn",
    description: lever,
    pathOrDescriptor: executable,
    syscall: "uv_spawn",
    cause: new Error(text),
  })
}
