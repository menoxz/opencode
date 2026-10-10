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

const starts = { count: 0, last: undefined as ChildProcess.Command | undefined }

// Every spawn that reaches this layer is counted, unconditionally. The count is
// the proof that no retry policy is stacked on the chokepoint any more, so it
// must not be conditional on the command: a guarded counter lets a real spawn
// slip underneath it and the proof stops proving anything.
const refusedLaunches = Layer.effect(
  ChildProcessSpawner,
  Effect.gen(function* () {
    const real = yield* ChildProcessSpawner
    return ChildProcessSpawner.of({
      ...real,
      spawn: (command: ChildProcess.Command) =>
        Effect.suspend(() => {
          starts.count += 1
          starts.last = command
          // Only the shell is refused; anything else is forwarded untouched — but
          // it is still counted, so `toBe(1)` cannot be satisfied by a call the
          // counter never saw.
          return SHELL.test(commandName(command)) ? Effect.fail(refused(command)) : real.spawn(command)
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
  it.live("surfaces the refusal on the first start without stacking a second retry policy", () =>
    Effect.gen(function* () {
      const info = yield* ShellTool
      const tool = yield* info.init()
      const exit = yield* Effect.exit(
        tool.execute({ command: "echo launch-retry-ok", description: "probe the launch retry" }, ctx),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      // the spawner already owns the budget: one start, one refusal, one message
      expect(starts.count).toBe(1)
      // …and that one counted start was the shell, not something the counter skipped
      expect(SHELL.test(commandName(starts.last!))).toBe(true)
      // the refusal is named, not surfaced as a bare errno
      expect(String(exit)).toContain("No process was created")
    }).pipe(provideInstance(process.cwd())),
  )
})
