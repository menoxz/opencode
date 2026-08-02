import { Effect, Console } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { effectCmd } from "../effect-cmd"
import { create as createDaemon } from "../../daemon/index"
import { checkTriggers, memoryConsolidate, tunnelHealthCheck, processQueue, detectPatterns, runSanityEval } from "../../daemon/triggers"
import { processMCPCommands } from "../../daemon/mcp-control"
import { every_30s, every_5m, every_1m, every_6h, every_24h, every_1h } from "../../daemon/scheduler"
import { subscribeFileChanges, startFileWatcher } from "../../daemon/file-watcher"
import { listenForTriggers } from "../../daemon/ws-push"
import * as Log from "@opencode-ai/core/util/log"
import * as fs from "node:fs"
import * as path from "node:path"

const log = Log.create({ service: "daemon.cli" })

/**
 * Get the daemon data directory (platform-appropriate).
 */
export function daemonDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencodev2")
}

/**
 * Get the service data directory (system-wide, for Windows service mode).
 */
export function serviceDir(): string {
  const base = process.env.ProgramData || "C:\\ProgramData"
  return path.join(base, "opencodev2", "daemon")
}

/**
 * Write a PID file so the wrapper script (or system monitoring) can track us.
 */
export function writePidFile(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "daemon.pid"), String(process.pid), "utf-8")
  } catch (e) {
    console.error(`Failed to write PID file: ${e}`)
  }
}

/**
 * Remove the PID file on shutdown.
 */
export function removePidFile(dir: string): void {
  try {
    const pidFile = path.join(dir, "daemon.pid")
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile)
  } catch { /* best-effort */ }
}

/**
 * Core daemon handler — shared between `opencode watch`, `opencode daemon start`,
 * and Windows service mode (`opencode daemon start --service`).
 */
export const daemonHandler = Effect.fn("Daemon.handler")(function* (
  args: { daemon?: boolean; service?: boolean; "pid-file"?: string },
) {
  const isDaemon = args.daemon ?? false
  const isService = args.service ?? false
  const customPidFile = args["pid-file"] as string | undefined
  const dd = customPidFile
    ? path.dirname(customPidFile)
    : isService
      ? serviceDir()
      : daemonDir()

  if (isService) {
    // Service mode: write PID to system-wide directory, log via structured logger
    writePidFile(dd)
    log.info("daemon start (service mode)", { pid: process.pid, pidDir: dd })
  } else if (isDaemon) {
    writePidFile(dd)
    log.info("daemon start", { pid: process.pid, pidDir: dd })
  } else {
    Console.log(`🧠 opencodev2-daemon starting (PID: ${process.pid})`)
  }

  const daemon = yield* createDaemon

  // Register periodic tasks
  yield* daemon.register("trigger-check", checkTriggers, every_30s)
  yield* daemon.register("mcp-control", processMCPCommands as unknown as () => Effect.Effect<void>, every_30s)
  yield* daemon.register("memory-consolidate", memoryConsolidate as unknown as () => Effect.Effect<void>, every_6h)
  yield* daemon.register("pattern-detection", detectPatterns as unknown as () => Effect.Effect<void>, every_24h)
  yield* daemon.register("tunnel-health", tunnelHealthCheck, every_1m)

  // Periodic eval: run sanity suite and check for regression
  yield* daemon.register("sanity-eval", runSanityEval as unknown as () => Effect.Effect<void>, every_1h)

  // Auto-executor: process queued tasks autonomously
  yield* daemon.register("process-queue", processQueue, every_5m)

  // File watcher cleanup (periodic — removes stale cooldown entries)
  yield* daemon.register("file-watcher-cleanup", subscribeFileChanges, every_30s)

  // File watcher subscription (long-lived — event-driven via @parcel/watcher)
  yield* daemon.forkForever("file-watcher", startFileWatcher)

  // Register WebSocket push listener (event-driven, reconnects automatically)
  yield* daemon.forkForever("ws-push", listenForTriggers)

  const st = yield* daemon.status()

  if (isService) {
    log.info("daemon ready (service mode)", { tasks: st.tasks })
  } else if (isDaemon) {
    log.info("daemon ready", { tasks: st.tasks })
  } else {
    Console.log(`✅ Daemon running. Registered tasks: ${st.tasks.join(", ")}`)
    Console.log("ℹ️  Press Ctrl+C to stop")
  }

  // Graceful shutdown: stop daemon tasks and remove PID file
  const shutdown = Effect.gen(function* () {
    if (isService) log.info("daemon shutting down (service mode)...")
    else if (isDaemon) log.info("daemon shutting down...")
    else Console.log("\nShutting down daemon...")
    removePidFile(dd)
    yield* daemon.stop().pipe(Effect.ignore)
  })

  // Trap OS signals for clean exit
  const onSignal = (signal: string) => {
    AppRuntime.runFork(
      shutdown.pipe(Effect.andThen(() => process.exit(0))) as any,
    )
  }
  process.on("SIGTERM", () => onSignal("SIGTERM"))
  // Service mode: SCM sends CTRL_BREAK (not SIGINT), so don't trap SIGINT
  // which interferes with Windows console event handling.
  if (!isService) {
    process.on("SIGINT", () => onSignal("SIGINT"))
  }

  // Keep alive indefinitely — daemon runs until interrupted
  yield* Effect.never
})

export const WatchCommand = effectCmd({
  command: "watch",
  describe: "Run opencodev2 in daemon mode — background agent with periodic tasks",
  builder: (yargs) =>
    yargs
      .option("daemon", {
        type: "boolean",
        describe: "Daemonize — write PID file and suppress interactive output",
        default: false,
      })
      .option("pid-file", {
        type: "string",
        describe: "Custom PID file path (default: $LOCALAPPDATA/opencodev2/daemon.pid)",
      }),
  instance: false,
  handler: Effect.fn("Cli.watch")(function* (args) {
    return yield* daemonHandler(args)
  }),
})
