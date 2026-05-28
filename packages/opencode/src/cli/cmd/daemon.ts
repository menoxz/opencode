import * as fs from "node:fs"
import * as path from "node:path"
import { EOL } from "node:os"
import { spawn, execSync } from "node:child_process"
import { cmd } from "./cmd"
import { daemonDir, daemonHandler } from "./watch"
import { AppRuntime } from "@/effect/app-runtime"
import * as Log from "@opencode-ai/core/util/log"
import { readLatestReport } from "../../daemon/idle"

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the daemon data directory.
 * - Normal mode: %LOCALAPPDATA%\opencode (per-user)
 * - Service mode: %ProgramData%\opencode\daemon (system-wide)
 */
function resolveDir(serviceMode: boolean): string {
  if (serviceMode) {
    const base = process.env.ProgramData || "C:\\ProgramData"
    return path.join(base, "opencode", "daemon")
  }
  return daemonDir()
}

function pidFile(serviceMode = false): string {
  return path.join(resolveDir(serviceMode), "daemon.pid")
}

function logFile(serviceMode = false): string {
  return path.join(resolveDir(serviceMode), "daemon.log")
}

function readPid(serviceMode = false): number | null {
  try {
    const raw = fs.readFileSync(pidFile(serviceMode), "utf-8").trim()
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

/**
 * Find the opencode binary path for the Windows service binPath.
 * Tries several strategies in order:
 *   1. Current process argv[0] if it looks like opencode.exe
 *   2. `where opencode` on PATH
 *   3. npm global prefix
 *   4. Known dev fork path
 */
function findOpencodeBinary(): string | null {
  // 1. Current argv[0] — if we're running as the opencode binary
  const argv0 = process.argv[0]
  if (argv0 && (argv0.endsWith("opencode.exe") || argv0.endsWith("opencode"))) {
    const resolved = path.resolve(argv0)
    if (fs.existsSync(resolved)) return resolved
  }

  // 2. `where opencode` (Windows PATH)
  try {
    const result = execSync("where opencode", { encoding: "utf-8", timeout: 5000 }).trim()
    if (result) {
      const first = result.split("\n")[0].trim()
      if (first && fs.existsSync(first)) return first
    }
  } catch { /* not on PATH */ }

  // 3. npm global prefix
  try {
    const prefix = execSync("npm prefix -g", { encoding: "utf-8", timeout: 5000 }).trim()
    const candidates = [
      path.join(prefix, "node_modules", "@opencode-ai", "opencode", "dist", "bin", "opencode.exe"),
      path.join(prefix, "node_modules", "@opencode-ai", "opencode", "cli.js"),
      path.join(prefix, "opencode.exe"),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
  } catch { /* npm prefix failed */ }

  // 4. Dev fork path (relative to this source file)
  try {
    const devPath = path.resolve(__dirname, "..", "..", "..", "..", "dist", "bin", "opencode.exe")
    if (fs.existsSync(devPath)) return devPath
  } catch { /* __dirname unavailable */ }

  return null
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
    yargs
      .option("daemon", {
        type: "boolean",
        describe: "Run as daemon (write PID, suppress output)",
        default: true,
      })
      .option("service", {
        type: "boolean",
        describe: "Run as Windows service (SCM integration, system-wide dirs)",
        default: false,
      }),
  async handler(args) {
    const isService = args.service ?? false

    process.stdout.write(`🧠 Starting opencode-daemon...${isService ? " (service mode)" : ""}${EOL}`)

    // PID file: only check in non-service mode (SCM manages service PID)
    if (!isService) {
      const existingPid = readPid()
      if (existingPid && isProcessRunning(existingPid)) {
        process.stdout.write(`⚠️  Daemon already running (PID ${existingPid})${EOL}`)
        process.stdout.write(`   Use "opencode daemon stop" first${EOL}`)
        return
      }
    }

    // Run the daemon handler (Effect-based, runs until interrupted)
    const handler = daemonHandler({ daemon: true, service: isService }) as any
    try {
      await AppRuntime.runPromise(handler)
    } catch (err) {
      const svcTag = isService ? " (service mode)" : ""
      Log.Default.error(`daemon failed${svcTag}`, { error: String(err) })
      process.exit(1)
    }
  },
})

// ── stop ───────────────────────────────────────────────────────────────

const StopCommand = cmd({
  command: "stop",
  describe: "Stop the background daemon",
  builder: (yargs) =>
    yargs.option("service", {
      type: "boolean",
      describe: "Stop the Windows service instead of the user daemon",
      default: false,
    }),
  async handler(args) {
    const isService = args.service ?? false
    const serviceName = "OpenCodeDaemon"

    // Service mode: use sc.exe for clean SCM stop
    if (isService) {
      process.stdout.write(`🛑 Stopping Windows service "${serviceName}"...${EOL}`)
      try {
        execSync(`sc.exe stop "${serviceName}"`, { stdio: "inherit" })
        process.stdout.write(`✅ Service "${serviceName}" stopped${EOL}`)
      } catch (err) {
        process.stdout.write(`❌ Failed to stop service: ${err}${EOL}`)
      }
      return
    }

    // Normal mode: kill PID
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
  builder: (yargs) =>
    yargs.option("service", {
      type: "boolean",
      describe: "Check the Windows service status instead of the user daemon",
      default: false,
    }),
  async handler(args) {
    const isService = args.service ?? false

    // Service mode: use sc.exe query
    if (isService) {
      try {
        execSync("sc.exe query OpenCodeDaemon", { stdio: "inherit" })
      } catch {
        process.stdout.write(`📡 Service "OpenCodeDaemon" is not installed${EOL}`)
        process.stdout.write(`   Install it with: opencode daemon install${EOL}`)
      }
      return
    }

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

    // Show the latest idle analysis report
    const report = readLatestReport()
    if (report) {
      process.stdout.write(`${EOL}📊  Idle Analysis Report${EOL}`)
      process.stdout.write(`   ${report.summary}${EOL}`)
      process.stdout.write(`   Run: opencode tasks report for full details${EOL}`)
    }
  },
})

// ── logs ───────────────────────────────────────────────────────────────

const LogsCommand = cmd({
  command: "logs",
  describe: "Show recent daemon logs",
  builder: (yargs) =>
    yargs
      .option("service", {
        type: "boolean",
        describe: "Show Windows service logs instead of user daemon logs",
        default: false,
      })
      .option("tail", {
        type: "boolean",
        describe: "Follow log output in real time (like tail -f)",
        default: false,
      })
      .option("lines", {
        type: "number",
        describe: "Number of recent lines to show",
        default: 50,
      }),
  async handler(args) {
    const isService = args.service ?? false
    const file = logFile(isService)
    if (!fs.existsSync(file)) {
      process.stdout.write(`ℹ️  No daemon log file found at ${file}${EOL}`)
      process.stdout.write(`   Start the daemon first with: opencode daemon start${isService ? " --service" : ""}${EOL}`)
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
      try {
        const output = execSync(
          `powershell -NoProfile -Command "Get-Content -Path '${file}' -Tail ${tail}"`,
          { encoding: "utf-8", timeout: 10000 },
        )
        process.stdout.write(output)
      } catch {
        process.stdout.write(`⚠️  Could not read log file${EOL}`)
      }
    }
  },
})

// ── install (Windows service) ──────────────────────────────────────────

const InstallCommand = cmd({
  command: "install",
  describe: "Register the daemon as a Windows service (requires admin)",
  builder: (yargs) =>
    yargs.option("binary", {
      type: "string",
      describe: "Path to the opencode binary (auto-detected by default)",
    }),
  async handler(args) {
    if (process.platform !== "win32") {
      process.stdout.write(`⚠️  Windows service registration is only supported on Windows${EOL}`)
      process.stdout.write(`   On Linux/macOS, use systemd or launchd manually${EOL}`)
      return
    }

    if (!isElevated()) {
      process.stdout.write(`❌ Administrator privileges required.${EOL}`)
      process.stdout.write(`   Run as Administrator, then:${EOL}`)
      process.stdout.write(`     opencode daemon install${EOL}`)
      process.stdout.write(`   Or use the PowerShell one-liner:${EOL}`)
      process.stdout.write(`     Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command','opencode daemon install'${EOL}`)
      return
    }

    // Find the opencode binary path
    const binary = (args.binary as string | undefined) || findOpencodeBinary()
    if (!binary) {
      process.stdout.write(`❌ Could not locate the opencode binary.${EOL}`)
      process.stdout.write(`   Specify it with: opencode daemon install --binary "C:\\path\\to\\opencode.exe"${EOL}`)
      process.stdout.write(`   Or make sure opencode is on your PATH.${EOL}`)
      return
    }

    const serviceName = "OpenCodeDaemon"
    const displayName = "OpenCode Background Daemon"
    const description = "Autonomous agent loop for OpenCode — trigger processing, file watching, and scheduled tasks."

    process.stdout.write(`🔧 Installing Windows service "${serviceName}"...${EOL}`)
    process.stdout.write(`   Binary: ${binary}${EOL}`)
    process.stdout.write(`   Data dir: ${resolveDir(true)}${EOL}`)

    // Ensure service data dir exists
    fs.mkdirSync(resolveDir(true), { recursive: true })

    try {
      // Create the service using sc.exe
      // The binPath wraps the opencode executable with the service flag.
      // SCM launches the process and tracks its PID; the daemon handles
      // cleanup on shutdown via SIGTERM/CTRL_BREAK.
      const cmd = [
        "sc.exe", "create", serviceName,
        `binPath= "${binary} daemon start --daemon --service"`,
        `displayName= "${displayName}"`,
        `start= "auto"`,
        `description= "${description}"`,
      ].join(" ")

      execSync(cmd, { stdio: "inherit" })

      // Set failure recovery: restart after 10s, restart after 30s, then no action
      execSync(
        `sc.exe failure "${serviceName}" reset= 86400 actions= restart/10000/restart/30000/""/60000`,
        { stdio: "ignore" },
      )

      process.stdout.write(`✅ Service "${serviceName}" installed and set to auto-start${EOL}`)
      process.stdout.write(`   Start now:   sc.exe start "${serviceName}"${EOL}`)
      process.stdout.write(`   Stop:        sc.exe stop "${serviceName}"${EOL}`)
      process.stdout.write(`   View logs:   opencode daemon logs${EOL}`)
    } catch (err) {
      process.stdout.write(`❌ Failed to install service: ${err}${EOL}`)
      process.stdout.write(`   You may also try manually:${EOL}`)
      process.stdout.write(`     sc.exe create "${serviceName}" binPath= "${binary} daemon start --daemon --service" displayName= "${displayName}" start= "auto"${EOL}`)
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
