import { Effect, Exit, Queue, Semaphore, Stream } from "effect"
import * as Scope from "effect/Scope"
import type * as PlatformError from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { Shell } from "@/shell/shell"

// H6 — persistent shell session.
//
// Before this module every command session paid a fresh interpreter start:
// on Windows the retained shell is `pwsh` (~273 ms measured), so a burst of
// five trivial commands cost ~1 363 ms of pure startup. The host process is
// now started once per (sessionID, shell, env) key and reused, commands being
// written to its stdin.
//
// Two invariants the fiche fixes:
//   * cwd policy is UNIQUE: the working directory is reset with `Set-Location`
//     (pwsh) / `cd` (posix) before each command; a different `cwd` never
//     respawns. Respawn happens only when `shell`/`env` change or the process
//     died.
//   * state does NOT leak between commands: each command runs inside a child
//     scope (`& { … }` / `( … )`), so variables, environment changes and
//     `Set-Location` do not survive. The finished-command marker embeds a
//     per-command random token that the command cannot know, so a command
//     cannot forge the end of the stream (§8.6).

// The spawner surface this module needs. Structural so the registry does not
// depend on the service class, only on the handle-producing method the tool
// already holds.
type Spawner = {
  spawn: (command: ChildProcess.Command) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope>
}

export type RunInput = {
  sessionID: string
  shell: string
  cwd: string
  env: NodeJS.ProcessEnv
  command: string
  timeout: number
  abort?: AbortSignal
}

export type RunResult = {
  code: number | null
  aborted: boolean
  expired: boolean
}

type Host = {
  key: string
  scope: Scope.Closeable
  handle: ChildProcessHandle
  pid: number
  inbox: Queue.Queue<Uint8Array>
  out: Queue.Queue<string | null>
  lock: Semaphore.Semaphore
  spawns: number
  dead: boolean
}

const ENCODER = new TextEncoder()
const hosts = new Map<string, Host>()

// Only shells that can host a stdin script loop are persistent. `cmd`/`fish`/`nu`
// keep the per-command spawn path in the tool.
export function supports(shell: string): boolean {
  return Shell.ps(shell) || Shell.posix(shell)
}

// Env equality drives respawn: the tool injects a per-call `env`, and serving a
// command under a stale environment would be a silent correctness bug. An
// identical env keeps the process (the common case).
function sessionKey(shell: string, env: NodeJS.ProcessEnv): string {
  return shell + "\u0000" + JSON.stringify(env)
}

export function pid(sessionID: string): number | undefined {
  return hosts.get(sessionID)?.pid
}

export function spawns(sessionID: string): number {
  return hosts.get(sessionID)?.spawns ?? 0
}

function quote(text: string): string {
  return "'" + text.replace(/'/g, "''") + "'"
}

// `Set-Location -LiteralPath <cwd>` (pwsh) / `cd -- <cwd>` (posix) is sent on
// every command: the reset is unconditional, so a leaked `cd` from a command
// cannot move the next one. The payload is base64 for pwsh so the frame is a
// single physical line whatever the command contains (a multi-line `-Command -`
// body would be read line by line and break compound statements); posix `-s`
// reads a compound command across lines, so its payload stays verbatim inside
// `( … )`.
function frame(shell: string, cwd: string, command: string, token: string): string {
  if (Shell.ps(shell)) {
    const encoded = Buffer.from(command, "utf-8").toString("base64")
    return (
      `Set-Location -LiteralPath ${quote(cwd)}; ` +
      `$__oc_c=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); ` +
      // `Invoke-Expression '& { … }'` runs the payload in a child scope (no
      // state carry-over) and skips `[ScriptBlock]::Create`, whose per-call AMSI
      // scan cost ~195 ms — measured against ~13 ms for this form.
      `Invoke-Expression ('& { ' + $__oc_c + ' }'); ` +
      `Write-Output "${token}:$([int]$LASTEXITCODE):$([int][bool]$?)"`
    )
  }
  // A posix shell on Windows (git bash) needs forward slashes, and a failed
  // `cd` must NOT terminate the host (`|| exit` killed it, forcing a respawn per
  // command); we log the miss instead and keep the previous directory.
  const dir = cwd.replace(/\\/g, "/")
  return `cd -- ${quote(dir)} 2>/dev/null;\n( ${command}\n )\nprintf '${token}:%s\\n' "$?"`
}

function parseCode(rest: string, token: string): number {
  const after = rest.slice(token.length + 1)
  const value = Number.parseInt(after, 10)
  return Number.isNaN(value) ? 0 : value
}

function spawnHost(spawner: Spawner, key: string, input: RunInput) {
  return Effect.gen(function* () {
    const scope = Scope.makeUnsafe()
    const inbox = yield* Queue.unbounded<Uint8Array>()
    const out = yield* Queue.unbounded<string | null>()
    const args = Shell.ps(input.shell)
      ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"]
      : ["-s"]
    const command = ChildProcess.make(input.shell, args, {
      cwd: input.cwd,
      env: input.env,
      // stdin stays open (`endOnDone: false`): closing it would end the host loop.
      stdin: { stream: Stream.fromQueue(inbox), endOnDone: false, encoding: "utf-8" },
      detached: false,
    })
    const handle = yield* spawner.spawn(command).pipe(Scope.provide(scope))
    const reader = Stream.decodeText(handle.all).pipe(
      Stream.runForEach((chunk) => Queue.offer(out, chunk)),
      // A dead host must wake any waiter: the sentinel is what turns process
      // death into a resolved `run` instead of a hang.
      Effect.ensuring(Queue.offer(out, null)),
    )
    yield* Effect.forkScoped(reader).pipe(Scope.provide(scope))
    const host: Host = {
      key,
      scope,
      handle,
      pid: handle.pid,
      inbox,
      out,
      lock: Semaphore.makeUnsafe(1),
      spawns: 1,
      dead: false,
    }
    // pwsh writes redirected stdout in the OEM code page; without this prologue
    // every non-ASCII byte reaches the model as U+FFFD. The one-shot spawn path
    // applied the same prologue via `cmd()`.
    if (Shell.ps(input.shell)) yield* Queue.offer(inbox, ENCODER.encode(`${Shell.PS_UTF8}\n`))
    return host
  })
}

function disposeHost(host: Host): Effect.Effect<void> {
  return Effect.gen(function* () {
    host.dead = true
    yield* host.handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.ignore)
    yield* Scope.close(host.scope, Exit.void).pipe(Effect.ignore)
  })
}

function acquire(spawner: Spawner, input: RunInput): Effect.Effect<Host, PlatformError.PlatformError> {
  return Effect.gen(function* () {
    const key = sessionKey(input.shell, input.env)
    const existing = hosts.get(input.sessionID)
    if (existing) {
      const alive = yield* existing.handle.isRunning.pipe(Effect.orElseSucceed(() => false))
      if (!existing.dead && alive && existing.key === key) return existing
      // shell/env changed, or the process is gone: kill and start over. `cwd`
      // is deliberately absent from this test (single cwd policy, §4/O1).
      yield* disposeHost(existing)
      hosts.delete(input.sessionID)
    }
    const host = yield* spawnHost(spawner, key, input)
    hosts.set(input.sessionID, host)
    return host
  })
}

// Drains output left over from a command that spawned a background writer after
// its marker; leaving it would prepend foreign text to the next command's read.
function drainStale(queue: Queue.Queue<string | null>): Effect.Effect<void> {
  return Effect.raceAll([Queue.takeAll(queue), Effect.sleep("0 millis")]).pipe(Effect.asVoid, Effect.ignore)
}

export function dispose(sessionID: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    const host = hosts.get(sessionID)
    if (!host) return
    hosts.delete(sessionID)
    yield* disposeHost(host)
  })
}

export const disposeAll: Effect.Effect<void> = Effect.gen(function* () {
  const all = Array.from(hosts.values())
  hosts.clear()
  for (const host of all) yield* disposeHost(host)
})

// Last-resort orphan guard: a resident `pwsh` must not outlive the process that
// owns it, even on an abrupt termination where the scope finalizer never runs.
let hooked = false
function hook() {
  if (hooked) return
  hooked = true
  process.once("exit", () => {
    for (const host of hosts.values()) {
      try {
        if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(host.pid), "/f", "/t"], { stdio: "ignore" })
        else process.kill(host.pid, "SIGKILL")
      } catch {
        // best effort on the way out
      }
    }
    hosts.clear()
  })
}

export function run(
  spawner: Spawner,
  input: RunInput,
  onChunk: (text: string) => Effect.Effect<void, unknown>,
): Effect.Effect<RunResult, PlatformError.PlatformError> {
  return Effect.gen(function* () {
    hook()
    const host = yield* acquire(spawner, input)
    return yield* Semaphore.withPermits(host.lock, 1)(
      Effect.gen(function* () {
        yield* drainStale(host.out)
        const token = randomUUID()
        yield* Queue.offer(host.inbox, ENCODER.encode(frame(input.shell, input.cwd, input.command, token) + "\n"))

        const deadline = Date.now() + input.timeout
        const signal = input.abort
        // No signal means "never abort": this arm must not settle, or the race
        // below would fire on the first iteration and tear the host down on
        // every call (the host is only disposed on abort/timeout).
        const abortWait = Effect.callback<{ kind: "abort"; chunk: null }>((resume) => {
          if (!signal) return
          if (signal.aborted) return resume(Effect.succeed({ kind: "abort", chunk: null }))
          const handler = () => resume(Effect.succeed({ kind: "abort", chunk: null }))
          signal.addEventListener("abort", handler, { once: true })
          return Effect.sync(() => signal.removeEventListener("abort", handler))
        })

        let buffer = ""
        let emitted = 0
        let aborted = false
        let expired = false
        let code: number | null = null

        while (true) {
          const remaining = Math.max(0, deadline - Date.now())
          const next = yield* Effect.raceAll([
            Queue.take(host.out).pipe(Effect.map((chunk) => ({ kind: "out" as const, chunk }))),
            abortWait,
            Effect.sleep(`${remaining} millis`).pipe(Effect.map(() => ({ kind: "timeout" as const, chunk: null }))),
          ])

          if (next.kind === "abort" || next.kind === "timeout") {
            aborted = next.kind === "abort"
            expired = next.kind === "timeout"
            // A killed host is unusable: tear it down so the next command respawns.
            hosts.delete(input.sessionID)
            yield* disposeHost(host)
            return { code: null, aborted, expired }
          }

          const chunk = next.chunk
          if (chunk === null) {
            // Host died (e.g. the command ran `exit N`): report its own code.
            code = yield* host.handle.exitCode.pipe(
              Effect.map((value) => Number(value)),
              Effect.orElseSucceed(() => null),
            )
            host.dead = true
            hosts.delete(input.sessionID)
            yield* Scope.close(host.scope, Exit.void).pipe(Effect.ignore)
            return { code, aborted: false, expired: false }
          }

          buffer += chunk
          const idx = buffer.indexOf(token)
          if (idx >= 0) {
            const before = buffer.slice(0, idx)
            if (before.length > emitted) yield* onChunk(before.slice(emitted)).pipe(Effect.ignore)
            code = parseCode(buffer.slice(idx), token)
            return { code, aborted: false, expired: false }
          }
          // No marker yet. The marker always starts its own line, so any partial
          // trailing line can only be a prefix of the token: hold it back and
          // emit everything else at once. This must stay this cheap — holding a
          // fixed token-sized tail (first attempt) starved progressive output:
          // short lines like "before"/"started" were never emitted, so an abort
          // driven by the stream never fired and observation was lost.
          const lastNewline = buffer.lastIndexOf("\n")
          const tail = buffer.slice(lastNewline + 1)
          const safe = tail.length === 0 || !token.startsWith(tail) ? buffer.length : lastNewline + 1
          if (safe > emitted) {
            yield* onChunk(buffer.slice(emitted, safe)).pipe(Effect.ignore)
            emitted = safe
          }
        }
      }),
    )
  })
}

export * as ShellSessions from "./session"
