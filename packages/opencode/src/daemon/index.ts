import { Effect, Exit, Scope } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import type { Schedule } from "effect"

const log = Log.create({ service: "daemon" })

export interface DaemonInstance {
  readonly register: (name: string, task: () => Effect.Effect<void>, schedule: Schedule.Schedule<unknown>) => Effect.Effect<void>
  readonly forkForever: (name: string, task: () => Effect.Effect<void>) => Effect.Effect<void>
  readonly stop: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<{ running: boolean; tasks: string[] }>
}

export const create = Effect.gen(function* () {
  const scope = yield* Scope.make()
  const taskNames = new Array<{ name: string }>()

  const register = Effect.fn("Daemon.register")(function* (
    name: string,
    task: () => Effect.Effect<void>,
    schedule: Schedule.Schedule<unknown>,
  ) {
    yield* task().pipe(
      Effect.repeat(schedule),
      Effect.forkIn(scope),
    )
    taskNames.push({ name })
    log.info("registered daemon task", { name })
  })

  const forkForever = Effect.fn("Daemon.forkForever")(function* (
    name: string,
    task: () => Effect.Effect<void>,
  ) {
    yield* task().pipe(Effect.forkIn(scope))
    taskNames.push({ name })
    log.info("forked daemon task", { name })
  })

  const stop = Effect.fn("Daemon.stop")(function* () {
    log.info("daemon stopping...")
    yield* Scope.close(scope, Exit.void).pipe(Effect.ignore)
    taskNames.length = 0
    log.info("daemon stopped")
  })

  const status = Effect.fn("Daemon.status")(function* () {
    return { running: taskNames.length > 0, tasks: taskNames.map((t) => t.name) }
  })

  return { register, forkForever, stop, status } satisfies DaemonInstance
})
