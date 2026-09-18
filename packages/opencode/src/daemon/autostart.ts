import { spawn } from "node:child_process"
import * as fs from "node:fs"
import * as Log from "@opencode-ai/core/util/log"
import { daemonDir, isProcessRunning, pidFilePath, readPidFile, spawnLockPath } from "@/daemon/paths"

const log = Log.create({ service: "daemon.autostart" })

/**
 * Set to `1` (or `true`) to disable automatic daemon startup for every command.
 * Documented in `opencodev2 daemon --help`.
 */
export const NO_AUTOSTART_ENV = "OPENCODE_NO_DAEMON_AUTOSTART"

/** How long a launcher's spawn lock is honoured before it is considered dead. */
const SPAWN_LOCK_TTL_MS = 30_000

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
 * Take the spawn lock so concurrent binaries cannot launch two daemons while
 * the first child is still booting. A stale lock left by a crashed launcher is
 * stolen once its TTL elapses.
 */
export function acquireSpawnLock(dir = daemonDir()): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const fd = fs.openSync(spawnLockPath(dir), "wx")
    fs.writeSync(fd, String(Date.now()))
    fs.closeSync(fd)
    return true
  } catch {
    try {
      const held = Date.now() - Number(fs.readFileSync(spawnLockPath(dir), "utf-8"))
      if (!Number.isFinite(held) || held > SPAWN_LOCK_TTL_MS) {
        fs.writeFileSync(spawnLockPath(dir), String(Date.now()))
        return true
      }
    } catch {
      // A lock we cannot read is treated as held.
    }
    return false
  }
}

export function releaseSpawnLock(dir = daemonDir()): void {
  try {
    fs.unlinkSync(spawnLockPath(dir))
  } catch {
    // Best effort.
  }
}

/**
 * Spawn `opencodev2 daemon start` fully detached and return its PID. The child
 * writes its own PID file, releases the spawn lock and outlives this process.
 */
export function spawnDaemonDetached(exe = daemonBinary()): number | undefined {
  const child = spawn(exe, ["daemon", "start"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    // Belt-and-braces: the detached child must never try to auto-start itself.
    env: { ...process.env, [NO_AUTOSTART_ENV]: "1" },
  })
  child.on("error", (error) => {
    log.warn("daemon spawn failed", { error: String(error) })
    releaseSpawnLock()
  })
  child.unref()
  return child.pid
}

/**
 * Ensure a single background daemon is running. Fire-and-forget by design: it is
 * non-blocking and swallows every error so it can never delay or fail the
 * command that triggered it.
 */
export function ensureDaemonStarted(): void {
  try {
    if (!shouldAutoStart({ running: isDaemonRunning() })) return
    if (!acquireSpawnLock()) return
    try {
      log.info("daemon autostart", { pidFile: pidFilePath(daemonDir()) })
      spawnDaemonDetached()
    } catch (error) {
      releaseSpawnLock()
      throw error
    }
  } catch (error) {
    log.warn("daemon autostart failed", { error: String(error) })
  }
}
