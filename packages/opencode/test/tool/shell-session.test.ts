import { beforeEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import type * as Scope from "effect/Scope"
import path from "path"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Config } from "@/config/config"
import { Shell } from "../../src/shell/shell"
import { ShellTool } from "../../src/tool/shell"
import { ShellSessions } from "../../src/tool/shell/session"
import { ShellPrompt } from "../../src/tool/shell/prompt"
import { provideInstance } from "../fixture/fixture"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Plugin } from "../../src/plugin"
import { testEffect } from "../lib/effect"
import { Tool } from "@/tool/tool"
import { RuntimeFlags } from "@/effect/runtime-flags"

// H6 acceptance tests.
//
// The metric that matters (fiche §8): five trivial commands served by one
// resident interpreter must stay under 800 ms, where the pre-H6 cost was one
// interpreter start per command (~273 ms × 5 ≈ 1 363 ms). The burst is measured
// at the layer H6 actually changes — the shell session — because the shell
// *tool* wraps every call in unrelated per-call work (config read, prompt
// render, repetition ledger) that H6 does not touch and that would drown the
// signal. The tool-level number is logged too, for transparency, but not gated.
//
// The "before" number is reproduced honestly by giving each command its own
// sessionID: the registry then cannot reuse a process and pays the exact
// per-command spawn the old code paid.
//
// Every test disposes the sessions it created (finalizer + the module's process
// exit hook), so a resident `pwsh` can never outlive the run.

const shellLayer = Layer.mergeAll(
  CrossSpawnSpawner.defaultLayer,
  AppFileSystem.defaultLayer,
  Plugin.defaultLayer,
  Truncate.defaultLayer,
  Config.defaultLayer,
  Agent.defaultLayer,
  RuntimeFlags.defaultLayer,
)
const it = testEffect(shellLayer)

const projectRoot = path.join(__dirname, "../..")

const initShell = Effect.fn("H6.init")(function* () {
  const info = yield* ShellTool
  return yield* info.init()
})

const makeCtx = (session: string): Tool.Context => ({
  sessionID: SessionID.make(session),
  messageID: MessageID.make("msg_h6"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

const runIn = <A, E, R>(directory: string, self: Effect.Effect<A, E, R>) => self.pipe(provideInstance(directory))

const run = Effect.fn("H6.tool.run")(function* (
  args: Tool.InferParameters<typeof ShellTool>,
  next: Tool.Context,
) {
  const shell = yield* initShell()
  return yield* shell.execute(args, next)
})

let counter = 0
beforeEach(() => {
  counter += 1
})
const sid = (tag = "") => `ses_h6_${counter}_${tag}`

// Times `n` sequential commands; returns the total wall time in ms.
const timed = (n: number, fn: (i: number) => Effect.Effect<unknown, unknown>) =>
  Effect.gen(function* () {
    const start = performance.now()
    for (let i = 0; i < n; i++) yield* fn(i)
    return performance.now() - start
  })

describe("tool.shell.session", () => {
  it.live(
    "H6: burst of 5 commands reuses one process and stays under 800 ms",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => ShellSessions.disposeAll)
          if (!ShellSessions.supports(Shell.acceptable())) {
            // cmd.exe / fish have no stdin host loop: the metric is not defined.
            console.log("H6: persistent shell unavailable on this platform, burst metric skipped")
            return
          }
          const spawner = yield* ChildProcessSpawner
          const shell = Shell.acceptable()
          const env = { ...process.env }
          const exec = (session: string, command: string) =>
            ShellSessions.run(
              spawner,
              { sessionID: session, shell, cwd: projectRoot, env, command, timeout: 15_000 },
              () => Effect.void,
            )

          const warm = sid("warm")
          yield* exec(warm, "echo warmup") // pay the one-time interpreter warm-up
          const burst = yield* timed(5, (i) => exec(warm, `echo burst-${i}`))
          console.log(`H6 burst session-level: persistent=${burst.toFixed(1)}ms shell=${Shell.name(shell)}`)

          // Pre-H6 analogue: every command starts its own interpreter.
          const cold = yield* timed(5, (i) => exec(sid(`cold_${i}`), `echo burst-${i}`))
          console.log(`H6 burst session-level: fresh-spawn=${cold.toFixed(1)}ms`)

          expect(ShellSessions.spawns(warm)).toBe(1)
          expect(cold).toBeGreaterThan(0)
          expect(burst).toBeLessThan(800)
          expect(burst).toBeLessThan(cold)
        }),
      ),
    30_000,
  )

  it.live(
    "H6: the shell tool end-to-end also reuses one process",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => ShellSessions.disposeAll)
          if (!ShellSessions.supports(Shell.acceptable())) return
          const session = sid("tool")
          yield* run({ command: "echo warmup", description: "d" }, makeCtx(session))
          const start = performance.now()
          for (let i = 0; i < 5; i++) {
            yield* run({ command: `echo t-${i}`, description: "d" }, makeCtx(session))
          }
          const elapsed = performance.now() - start
          console.log(`H6 tool-level burst (informational): ${elapsed.toFixed(1)}ms`)
          expect(ShellSessions.spawns(session)).toBe(1)
        }),
      ),
    30_000,
  )

  it.live(
    "H6: same session keeps one process across commands",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => ShellSessions.disposeAll)
          if (!ShellSessions.supports(Shell.acceptable())) return
          const session = sid("reuse")
          yield* run({ command: "echo one", description: "d" }, makeCtx(session))
          const first = ShellSessions.pid(session)
          yield* run({ command: "echo two", description: "d" }, makeCtx(session))
          const second = ShellSessions.pid(session)
          expect(first).toBeDefined()
          expect(second).toBe(first)
          expect(ShellSessions.spawns(session)).toBe(1)
        }),
      ),
    30_000,
  )

  it.live(
    "H6: variables and working directory do not leak between commands",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => ShellSessions.disposeAll)
          const session = sid("iso")
          const name = Shell.name(Shell.acceptable())
          const ps = name !== "cmd" && name !== "bash"
          const seed = ps
            ? "$ocx='LEAK'; Set-Location -LiteralPath $env:TEMP; echo seeded"
            : "ocx='LEAK'; cd /tmp; echo seeded"
          const probe = ps
            ? "if ($ocx) { Write-Output 'VAR_LEAK' } else { Write-Output 'VAR_CLEAN' }; Write-Output (Get-Location).Path"
            : 'if [ -n "$ocx" ]; then echo VAR_LEAK; else echo VAR_CLEAN; fi; pwd'
          yield* run({ command: seed, description: "d" }, makeCtx(session))
          const result = yield* run({ command: probe, description: "d" }, makeCtx(session))
          expect(result.output).toContain("VAR_CLEAN")
          expect(result.output).not.toContain("VAR_LEAK")
          // The leaked `Set-Location $env:TEMP` / `cd /tmp` must not have moved
          // the next command: the reset is unconditional (single cwd policy).
          expect(result.output.replaceAll("\\", "/").toLowerCase()).not.toContain("/temp")
        }),
      ),
    30_000,
  )

  it.live(
    "H6: a changed env respawns, a stable env reuses",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() => ShellSessions.disposeAll)
          if (!ShellSessions.supports(Shell.acceptable())) return
          const spawner = yield* ChildProcessSpawner
          const session = sid("env")
          const shell = Shell.acceptable()
          const call = (env: NodeJS.ProcessEnv) =>
            ShellSessions.run(
              spawner,
              { sessionID: session, shell, cwd: projectRoot, env, command: "echo ok", timeout: 15_000 },
              () => Effect.void,
            )

          yield* call({ ...process.env, OC_H6: "1" })
          const first = ShellSessions.pid(session)
          yield* call({ ...process.env, OC_H6: "1" })
          expect(ShellSessions.pid(session)).toBe(first) // same env → same process
          yield* call({ ...process.env, OC_H6: "2" })
          expect(ShellSessions.pid(session)).not.toBe(first) // env changed → respawn
          yield* ShellSessions.dispose(session)
          expect(ShellSessions.pid(session)).toBeUndefined()
        }),
      ),
    30_000,
  )

  it.live(
    "H6: both prompt branches state persistence without state carry-over",
    () =>
      runIn(
        projectRoot,
        Effect.gen(function* () {
          const trunc = yield* Truncate.Service
          const limits = yield* trunc.limits()
          const ps = ShellPrompt.render("pwsh", "win32", limits, 120_000).description
          const posix = ShellPrompt.render("bash", "linux", limits, 120_000).description
          for (const description of [ps, posix]) {
            expect(description).toContain("persistent shell process")
            expect(description).toContain("do not survive")
          }
        }),
      ),
    30_000,
  )
})
