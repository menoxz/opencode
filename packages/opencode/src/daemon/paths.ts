// Daemon filesystem layout shared by the CLI, the daemon handler and the
// auto-start helper. Deliberately dependency-free (node builtins only) so
// importing it never pulls the daemon runtime graph into a CLI command.
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Per-user daemon data directory.
 * `%LOCALAPPDATA%\opencodev2` on Windows, `~/.opencode/opencodev2` elsewhere.
 */
export function daemonDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencodev2")
}

/**
 * System-wide daemon data directory for Windows service mode.
 */
export function serviceDir(): string {
  const base = process.env.ProgramData || "C:\\ProgramData"
  return path.join(base, "opencodev2", "daemon")
}

export function dataDir(serviceMode: boolean): string {
  return serviceMode ? serviceDir() : daemonDir()
}

export function pidFilePath(dir: string): string {
  return path.join(dir, "daemon.pid")
}

export function logFilePath(dir: string): string {
  return path.join(dir, "daemon.log")
}

export function readPidFile(dir: string): number | null {
  try {
    const pid = Number(fs.readFileSync(pidFilePath(dir), "utf-8").trim())
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
