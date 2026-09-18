import { spawn } from "node:child_process"
import * as Log from "@opencode-ai/core/util/log"
import { daemonDir, isProcessRunning, pidFilePath, readPidFile } from "@/daemon/paths"

const log = Log.create({ service: "daemon.autostart" })

/**
 * Set to `1` (or `true`) to disable automatic daemon startup for every command.
 * Documented in `opencodev2 daemon --help`.
 */
export const NO_AUTOSTART_ENV = "OPENCODE_NO_DAEMON_AUTOSTART"

/**
 * Binary to re-launch for the detached daemon. Mirrors `attach`'s resolution so
 * a copied or aliased binary still works; falls back to PATH lookup in dev.
 */
export function daemonBinary(exe = process.execPath): string {
  return /(?:opencodev2|opencode)(?:\.exe)?$/i.test(exe) ? exe : "opencodev2"
}

/** True when the daemon PID file points at a live process. */
export function isDaemonRunning(dir = daemonDir()): boolean {
  const pid = readPidFile(dir)
  return pid !== null && isProcessRunning(pid)
}

/**
 * Pure auto-start decision: start unless explicitly disabled or already up.
 * Side-effect free so it can be unit-tested without spawning anything.
 */
export function shouldAutoStart(input: { env?: NodeJS.ProcessEnv; running: boolean }): boolean {
  const raw = (input.env ?? process.env)[NO_AUTOSTART_ENV]
  const disabled = raw === "1" || raw?.toLowerCase() === "true"
  return !disabled && !input.running
}

/**
 * Spawn `opencodev2 daemon start` fully detached and return immediately. The
 * child writes its own PID file and outlives this process.
 */
export function spawnDaemonDetached(exe = daemonBinary()): void {
  spawn(exe, ["daemon", "start"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    // Belt-and-braces: the detached child must never try to auto-start itself.
    env: { ...process.env, [NO_AUTOSTART_ENV]: "1" },
  }).unref()
}

/**
 * Ensure a single background daemon is running. Fire-and-forget by design: it is
 * non-blocking and swallows every error so it can never delay or fail the
 * command that triggered it.
 */
export function ensureDaemonStarted(): void {
  try {
    if (!shouldAutoStart({ running: isDaemonRunning() })) return
    log.info("daemon autostart", { pidFile: pidFilePath(daemonDir()) })
    spawnDaemonDetached()
  } catch (error) {
    log.warn("daemon autostart failed", { error: String(error) })
  }
}
