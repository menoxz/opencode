import * as fs from "node:fs"
import * as path from "node:path"
import { EOL } from "node:os"
import { spawn, execSync } from "node:child_process"
import { cmd } from "./cmd"
import { daemonDir, daemonHandler } from "./watch"
import { AppRuntime } from "@/effect/app-runtime"
import * as Log from "@opencode-ai/core/util/log"

// ── Helpers ────────────────────────────────────────────────────────────

function pidFile(): string {
  return path.join(daemonDir(), "daemon.pid")
}

function logFile(): string {
  return path.join(daemonDir(), "daemon.log")
}

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(pidFile(), "utf-8").trim()
    const pid = Number(raw)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isElevated(): boolean {
  try {
    execSync("net session", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

// ── Top-level command ──────────────────────────────────────────────────

export const DaemonCommand = cmd({
  command: "daemon",
  describe: "Manage the opencode background daemon (autonomous agent loop)",
  builder: (yargs) =>
    yargs
      .command(StartCommand)
      .command(StopCommand)
      .command(StatusCommand)
      .command(LogsCommand)
      .command(InstallCommand)
      .command(UninstallCommand)
      .demandCommand(1, "Specify a subcommand: start, stop, status, logs, install, uninstall"),
  async handler() {},
})

// ── start ──────────────────────────────────────────────────────────────

const StartCommand = cmd({
  command: "start",
  describe: "Start the background daemon",
  builder: (yargs) =>
    yargs.option("daemon", {
      type: "boolean",
      describe: "Run as daemon (write PID, suppress output)",
      default: true,
    }),
  async handler(args) {
    process.stdout.write(`🧠 Starting opencode-daemon...${EOL}`)

    // Check if already running
    const existingPid = readPid()
    if (existingPid && isProcessRunning(existingPid)) {
      process.stdout.write(`⚠️  Daemon already running (PID ${existingPid})${EOL}`)
      process.stdout.write(`   Use "opencode daemon stop" first${EOL}`)
      return
    }

    // Run the daemon handler (Effect-based, runs until interrupted)
    const handler = daemonHandler({ daemon: true }) as any
    try {
      await AppRuntime.runPromise(handler)
    } catch (err) {
      Log.Default.error("daemon failed", { error: String(err) })
      process.exit(1)
    }
  },
})

// ── stop ───────────────────────────────────────────────────────────────

const StopCommand = cmd({
  command: "stop",
  describe: "Stop the background daemon",
  async handler() {
    const pid = readPid()
    if (!pid) {
      process.stdout.write(`ℹ️  Daemon is not running (no PID file)${EOL}`)
      return
    }

    if (!isProcessRunning(pid)) {
      process.stdout.write(`ℹ️  Daemon process ${pid} is already dead — cleaning up PID file${EOL}`)
      fs.unlinkSync(pidFile())
      return
    }

    process.stdout.write(`🛑 Stopping daemon (PID ${pid})...${EOL}`)

    try {
      process.kill(pid, "SIGTERM")
      // Wait up to 5s for graceful shutdown
      for (let i = 0; i < 50; i++) {
        if (!isProcessRunning(pid)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (isProcessRunning(pid)) {
        process.stdout.write(`⚠️  Daemon did not stop gracefully, sending SIGKILL${EOL}`)
        process.kill(pid, "SIGKILL")
      }
    } catch (err) {
      process.stdout.write(`❌ Failed to stop daemon: ${err}${EOL}`)
      return
    }

    // Clean up PID file if left behind
    try {
      if (fs.existsSync(pidFile())) fs.unlinkSync(pidFile())
    } catch { /* best-effort */ }

    process.stdout.write(`✅ Daemon stopped${EOL}`)
  },
})

// ── status ─────────────────────────────────────────────────────────────

const StatusCommand = cmd({
  command: "status",
  describe: "Check if the daemon is running",
  async handler() {
    const pid = readPid()

    if (!pid) {
      process.stdout.write(`📡 Daemon status: STOPPED${EOL}`)
      process.stdout.write(`   No PID file found at ${pidFile()}${EOL}`)
      process.stdout.write(`   Start it with: opencode daemon start${EOL}`)
      return
    }

    if (!isProcessRunning(pid)) {
      process.stdout.write(`📡 Daemon status: STOPPED (stale PID ${pid})${EOL}`)
      process.stdout.write(`   The process died unexpectedly — cleaning up${EOL}`)
      try { fs.unlinkSync(pidFile()) } catch {}
      return
    }

    process.stdout.write(`📡 Daemon status: RUNNING${EOL}`)
    process.stdout.write(`   PID: ${pid}${EOL}`)
    process.stdout.write(`   PID file: ${pidFile()}${EOL}`)
    process.stdout.write(`   Log file: ${logFile()}${EOL}`)
  },
})

// ── logs ───────────────────────────────────────────────────────────────

const LogsCommand = cmd({
  command: "logs",
  describe: "Show recent daemon logs",
  builder: (yargs) =>
    yargs.option("tail", {
      type: "boolean",
      describe: "Follow log output in real time (like tail -f)",
      default: false,
    }).option("lines", {
      type: "number",
      describe: "Number of recent lines to show",
      default: 50,
    }),
  async handler(args) {
    const file = logFile()
    if (!fs.existsSync(file)) {
      process.stdout.write(`ℹ️  No daemon log file found at ${file}${EOL}`)
      return
    }

    const tail = args.lines ?? 50
    const follow = args.tail ?? false

    if (follow) {
      const bat = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `Get-Content -Path "${file}" -Tail ${tail} -Wait`,
      ], { stdio: "inherit" })
      bat.on("exit", () => process.exit(0))
      process.on("SIGINT", () => {
        bat.kill()
        process.exit(0)
      })
    } else {
      const output = execSync(
        `powershell -NoProfile -Command "Get-Content -Path '${file}' -Tail ${tail}"`,
        { encoding: "utf-8" },
      )
      process.stdout.write(output)
    }
  },
})

// ── install (Windows service) ──────────────────────────────────────────

const InstallCommand = cmd({
  command: "install",
  describe: "Register the daemon as a Windows service (requires admin)",
  async handler() {
    if (process.platform !== "win32") {
      process.stdout.write(`⚠️  Windows service registration is only supported on Windows${EOL}`)
      process.stdout.write(`   On Linux/macOS, use systemd or launchd manually${EOL}`)
      return
    }

    if (!isElevated()) {
      process.stdout.write(`❌ Administrator privileges required.${EOL}`)
      process.stdout.write(`   Run: Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command','opencode daemon install'${EOL}`)
      return
    }

    const opencodePath = process.execPath
    const serviceName = "OpenCodeDaemon"
    const displayName = "OpenCode Background Daemon"
    const description = "Autonomous agent loop for OpenCode — trigger processing, file watching, and scheduled tasks."

    process.stdout.write(`🔧 Installing Windows service "${serviceName}"...${EOL}`)
    process.stdout.write(`   Binary: ${opencodePath}${EOL}`)
    process.stdout.write(`   PID dir: ${daemonDir()}${EOL}`)

    // Ensure daemon dir exists
    fs.mkdirSync(daemonDir(), { recursive: true })

    try {
      // Create the service using sc.exe
      const cmd = [
        "sc.exe", "create", serviceName,
        `binPath= "${opencodePath} daemon start --daemon"`,
        `displayName= "${displayName}"`,
        `start= "auto"`,
        `description= "${description}"`,
      ].join(" ")

      execSync(cmd, { stdio: "inherit" })

      // Set failure recovery: restart on failure after 10s, restart after 30s
      execSync(
        `sc.exe failure "${serviceName}" reset= 86400 actions= restart/10000/restart/30000/""/60000`,
        { stdio: "ignore" },
      )

      process.stdout.write(`✅ Service "${serviceName}" installed${EOL}`)
      process.stdout.write(`   Start it with: sc.exe start "${serviceName}"${EOL}`)
      process.stdout.write(`   Or: opencode daemon start${EOL}`)
    } catch (err) {
      process.stdout.write(`❌ Failed to install service: ${err}${EOL}`)
      process.stdout.write(`   You may also try manually:${EOL}`)
      process.stdout.write(`     sc.exe create "${serviceName}" binPath= "${opencodePath} daemon start --daemon" displayName= "${displayName}" start= "auto"${EOL}`)
    }
  },
})

// ── uninstall (Windows service) ────────────────────────────────────────

const UninstallCommand = cmd({
  command: "uninstall",
  describe: "Remove the Windows service registration (requires admin)",
  async handler() {
    if (process.platform !== "win32") {
      process.stdout.write(`⚠️  Windows service uninstall is only supported on Windows${EOL}`)
      return
    }

    if (!isElevated()) {
      process.stdout.write(`❌ Administrator privileges required.${EOL}`)
      process.stdout.write(`   Run as Administrator or use: Start-Process powershell -Verb RunAs${EOL}`)
      return
    }

    const serviceName = "OpenCodeDaemon"

    process.stdout.write(`🔧 Uninstalling Windows service "${serviceName}"...${EOL}`)

    try {
      // Stop the service first
      execSync(`sc.exe stop "${serviceName}"`, { stdio: "ignore" })
    } catch { /* service might not be running */ }

    try {
      execSync(`sc.exe delete "${serviceName}"`, { stdio: "inherit" })
      process.stdout.write(`✅ Service "${serviceName}" uninstalled${EOL}`)
    } catch (err) {
      process.stdout.write(`❌ Failed to uninstall service: ${err}${EOL}`)
    }
  },
})
