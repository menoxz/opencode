import { Deferred, Duration, Effect, Option } from "effect"

export interface Options {
  readonly sessionID: string
  /** How long the caller may take to reach the provider phase. */
  readonly timeout: Duration.Input
  /** Runs at most once, and only while this arm is still the newest one. */
  readonly onStall: Effect.Effect<void>
}

// A step's pre-provider phase has no progress signal, so one await that never
// resolves there parks the run with the session `busy`, no part written and no
// deadline to release it (observed: 6 minutes of silence and an orphan
// assistant message). Arms record the newest generation per session, so a guard
// whose run died before the provider phase cannot cancel a later run.
const generations = new Map<string, number>()

export const PRE_PROVIDER_TIMEOUT = Duration.minutes(5)

export const arm = Effect.fn("StallWatch.arm")(function* (options: Options) {
  const generation = (generations.get(options.sessionID) ?? 0) + 1
  generations.set(options.sessionID, generation)
  const reached = yield* Deferred.make<void>()
  yield* Effect.forkDetach(
    Effect.gen(function* () {
      const early = yield* Deferred.await(reached).pipe(Effect.timeoutOption(options.timeout))
      if (Option.isSome(early)) return
      if (generations.get(options.sessionID) !== generation) return
      yield* options.onStall
    }),
  )
  return Deferred.succeed(reached, undefined)
})

export * as StallWatch from "./stall-watch"
