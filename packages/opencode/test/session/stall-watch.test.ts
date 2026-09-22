import { expect, test } from "bun:test"
import { Effect, Ref } from "effect"
import { StallWatch } from "../../src/session/stall-watch"

test("releases the session when the provider phase is never reached", async () => {
  const fired = await Effect.runPromise(
    Effect.gen(function* () {
      const stalls = yield* Ref.make(0)
      yield* StallWatch.arm({
        sessionID: "ses_stall_release",
        timeout: "50 millis",
        onStall: Ref.update(stalls, (n) => n + 1).pipe(Effect.asVoid),
      })
      yield* Effect.sleep("300 millis")
      return yield* Ref.get(stalls)
    }),
  )
  expect(fired).toBe(1)
})

test("stays silent once the provider phase starts", async () => {
  const fired = await Effect.runPromise(
    Effect.gen(function* () {
      const stalls = yield* Ref.make(0)
      const reachedProvider = yield* StallWatch.arm({
        sessionID: "ses_stall_disarm",
        timeout: "50 millis",
        onStall: Ref.update(stalls, (n) => n + 1).pipe(Effect.asVoid),
      })
      yield* reachedProvider
      yield* Effect.sleep("300 millis")
      return yield* Ref.get(stalls)
    }),
  )
  expect(fired).toBe(0)
})

test("a guard parked by a dead step cannot release a newer step", async () => {
  const [dead, live] = await Effect.runPromise(
    Effect.gen(function* () {
      const dead = yield* Ref.make(0)
      const live = yield* Ref.make(0)
      yield* StallWatch.arm({
        sessionID: "ses_stall_superseded",
        timeout: "50 millis",
        onStall: Ref.update(dead, (n) => n + 1).pipe(Effect.asVoid),
      })
      yield* StallWatch.arm({
        sessionID: "ses_stall_superseded",
        timeout: "50 millis",
        onStall: Ref.update(live, (n) => n + 1).pipe(Effect.asVoid),
      })
      yield* Effect.sleep("300 millis")
      return [yield* Ref.get(dead), yield* Ref.get(live)]
    }),
  )
  expect(dead).toBe(0)
  expect(live).toBe(1)
})
