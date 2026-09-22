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

// The host refuses a start with this errno and no process is ever created, so
// repeating the launch is safe. Modelling it here keeps the test deterministic:
// no real process is launched, which matters on a host that denies spawns.
const refused = () =>
  Object.assign(new Error("EPERM: operation not permitted, uv_spawn 'git'"), { code: "EPERM", syscall: "uv_spawn" })

type Fake = NodeChildProcess.ChildProcess & EventEmitter

const asProc = (fields: Record<string, unknown>) => Object.assign(new EventEmitter(), fields) as unknown as Fake

const startedProc = () => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const proc = asProc({
    pid: 4242,
    stdout,
    stderr,
    stdio: [null, stdout, stderr],
    kill: () => true,
    unref: () => {},
    ref: () => {},
  })
  setTimeout(() => proc.emit("spawn"), 0)
  setTimeout(() => {
    stdout.end()
    stderr.end()
    proc.emit("exit", 0, null)
    proc.emit("close", 0, null)
  }, 10)
  return proc
}

const refusingProc = (error: unknown) => {
  const proc = asProc({ pid: undefined, stdout: null, stderr: null, kill: () => true, unref: () => {}, ref: () => {} })
  setTimeout(() => proc.emit("error", error), 0)
  return proc
}

const build = (refusals: number, error: unknown = refused()) => {
  const calls = { count: 0 }
  const launch = (_command: string, _args: readonly string[], _options: NodeChildProcess.SpawnOptions) => {
    calls.count += 1
    return calls.count <= refusals ? refusingProc(error) : startedProc()
  }
  const spawner = Layer.effect(ChildProcessSpawner, CrossSpawnSpawner.makeWith(launch)).pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer),
  )
  const app = AppProcess.layer.pipe(
    Layer.provide(spawner),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer),
  )
  const run = Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    return yield* proc.run(ChildProcess.make("git", ["--version"]))
  }).pipe(Effect.provide(app))
  return { calls, run }
}

describe("spawner chokepoint launch retry", () => {
  test("a caller with no local retry survives refused starts", async () => {
    const probe = build(2)
    const result = await Effect.runPromise(probe.run)
    expect(result.exitCode).toBe(0)
    // without the chokepoint retry the first refusal fails the caller at once
    expect(probe.calls.count).toBe(3)
  })

  test("a real start failure is not retried", async () => {
    const permanent = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" })
    const probe = build(1, permanent)
    const exit = await Effect.runPromise(Effect.exit(probe.run))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(probe.calls.count).toBe(1)
  })
})
