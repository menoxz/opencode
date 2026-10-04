import { describe, expect, test } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Exit, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import * as NodeChildProcess from "node:child_process"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { CrossSpawnSpawner } from "../../src/cross-spawn-spawner"
import { AppProcess } from "../../src/process"

// A child that starts and never finishes on its own models the host that keeps
// the pipe open (an orphaned helper holding stdin/stdout after its parent died).
// Without `timeout` the caller waits forever; with it the call must fail and the
// child must be killed so it cannot accumulate as an orphan.
const hungProc = (state: { killed: boolean }) => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const proc = Object.assign(new EventEmitter(), {
    pid: 4242,
    stdout,
    stderr,
    stdio: [null, stdout, stderr],
    unref: () => {},
    ref: () => {},
    kill: () => {
      state.killed = true
      setTimeout(() => {
        stdout.end()
        stderr.end()
        proc.emit("exit", null, "SIGTERM")
        proc.emit("close", null, "SIGTERM")
      }, 0)
      return true
    },
  }) as unknown as NodeChildProcess.ChildProcess & EventEmitter
  setTimeout(() => proc.emit("spawn"), 0)
  return proc
}

const build = (state: { killed: boolean }) => {
  const spawner = Layer.effect(ChildProcessSpawner, CrossSpawnSpawner.makeWith(() => hungProc(state))).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer),
  )
  const app = AppProcess.layer.pipe(
    Layer.provide(spawner),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer),
  )
  return Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    return yield* proc.run(ChildProcess.make("git", ["check-ignore", "--stdin"]), {
      stdin: "a\0",
      timeout: "250 millis",
    })
  }).pipe(Effect.provide(app))
}

describe("AppProcess.run deadline", () => {
  test("a child that never exits fails the caller instead of parking it, and is killed", async () => {
    const state = { killed: false }
    const started = Date.now()
    const exit = await Effect.runPromise(Effect.exit(build(state)))
    expect(Exit.isFailure(exit)).toBe(true)
    // without the deadline this await never returns and bun fails the test on its own timeout
    expect(Date.now() - started).toBeLessThan(5_000)
    // the interrupted call must also reap the child, else it lingers as an orphan;
    // the kill runs in the interrupted fiber's finalizer, so poll instead of assuming
    for (let i = 0; i < 200 && !state.killed; i += 1) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(state.killed).toBe(true)
  })
})
