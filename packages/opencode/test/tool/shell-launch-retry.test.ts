import { describe, expect } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import * as PlatformError from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { Truncate } from "@/tool/truncate"
import { ShellTool } from "../../src/tool/shell"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"
import { provideInstance } from "../fixture/fixture"

const SHELL = /(^|[\\/])(pwsh|powershell|bash|sh|cmd)(\.exe)?$/i
// one start plus the four retries the shared policy allows
const LAUNCH_BUDGET = 5

const commandName = (command: ChildProcess.Command) => (command._tag === "StandardCommand" ? command.command : "")

// Exactly what this host returns at random: the errno survives on the cause.
const refused = (command: ChildProcess.Command) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: commandName(command),
    syscall: "uv_spawn",
    cause: Object.assign(new Error("EPERM: operation not permitted, uv_spawn 'shell'"), {
      code: "EPERM",
      syscall: "uv_spawn",
    }),
  })

// A permanent start failure: it must never be retried, so the tool is only
// allowed to surface this one once the refusal budget is spent.
const permanent = (command: ChildProcess.Command) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: commandName(command),
    syscall: "spawn",
    cause: new Error("failed to start the shell: the interpreter is not usable"),
  })

const starts = { count: 0 }

// The spawner refuses the launch a fixed number of times, then fails for a real
// reason: no host process is started, so the assertion is deterministic.
const refusedLaunches = Layer.effect(
  ChildProcessSpawner,
  Effect.gen(function* () {
    const real = yield* ChildProcessSpawner
    return ChildProcessSpawner.of({
      ...real,
      spawn: (command: ChildProcess.Command) =>
        Effect.suspend(() => {
          if (!SHELL.test(commandName(command))) return real.spawn(command)
          starts.count += 1
          return starts.count < LAUNCH_BUDGET ? Effect.fail(refused(command)) : Effect.fail(permanent(command))
        }),
    })
  }),
).pipe(Layer.provide(CrossSpawnSpawner.defaultLayer))

const layer = Layer.mergeAll(
  refusedLaunches,
  AppFileSystem.defaultLayer,
  Plugin.defaultLayer,
  Truncate.defaultLayer,
  Config.defaultLayer,
  Agent.defaultLayer,
  RuntimeFlags.defaultLayer,
)

const it = testEffect(layer)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("tool.shell transient launch", () => {
  it.live("spends the whole retry budget on a refused start instead of surfacing it", () =>
    Effect.gen(function* () {
      const info = yield* ShellTool
      const tool = yield* info.init()
      const exit = yield* Effect.exit(
        tool.execute({ command: "echo launch-retry-ok", description: "probe the launch retry" }, ctx),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      // without the retry wiring the first refusal fails the tool immediately
      expect(starts.count).toBeGreaterThanOrEqual(LAUNCH_BUDGET)
    }).pipe(provideInstance(process.cwd())),
  )
})
