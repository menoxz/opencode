import { Duration, Effect, Schedule } from "effect"
import type { PlatformError } from "effect/PlatformError"

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

export type { PlatformError }
