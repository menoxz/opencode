import { spawn, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { DevSource } from "@/dev/source"

const actions = ["up", "down", "status", "tui", "logs"] as const

type ServerState = { pid: number; port: number; entry: string; watch: boolean; startedAt: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const url = (port: number) => `http://127.0.0.1:${port}`

async function health(port: number) {
  try {
    const res = await fetch(`${url(port)}/global/health`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return undefined
    return (await res.json()) as { healthy?: boolean; version?: string }
  } catch {
    return undefined
  }
}

function readState(file: string): ServerState | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ServerState
  } catch {
    return undefined
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function logTail(file: string, lines: number) {
  try {
    return fs
      .readFileSync(file, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-lines)
      .join("\n")
  } catch {
    return ""
  }
}

function owns(pid: number, entry: string) {
  if (process.platform !== "win32") {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, "utf-8").includes(entry)
    } catch {
      return false
    }
  }
  const probe = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
    { encoding: "utf-8", windowsHide: true },
  )
  return (probe.stdout ?? "").includes(entry)
}

function terminate(pid: number) {
  // The server may be a watcher with a child process, so the whole tree has to go.
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true })
    return
  }
  try {
    process.kill(-pid)
  } catch {
    // Not a group leader; fall through to the plain signal.
  }
  try {
    process.kill(pid)
  } catch {
    // Already gone.
  }
}

function port(args: { port?: number }) {
  return args.port ?? Number(process.env.OPENCODE_DEV_PORT ?? DevSource.DEFAULT_PORT)
}

async function up(root: string, target: number, watch: boolean) {
  const running = await health(target)
  if (running) {
    UI.println(`dev server already up on ${url(target)} (version ${running.version})`)
    return true
  }

  const { dir, pidFile } = DevSource.state(root)
  fs.mkdirSync(dir, { recursive: true })
  const [command, ...prefix] = DevSource.runner(root, watch)
  const child = spawn(command, [...prefix, "serve", "--port", String(target)], {
    // The repository is both the working directory (`bun --watch` only watches the working directory)
    // and the watched tree. Detached with ignored stdio is the combination that survives this
    // launcher's exit; the server keeps its own log through the product logger.
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, OPENCODE_DEV_SOURCE: root, OPENCODE_NO_DAEMON_AUTOSTART: "1" },
  })
  child.on("error", (error) => UI.error(`dev server spawn failed: ${error.message}`))
  child.unref()

  if (child.pid) {
    const state: ServerState = {
      pid: child.pid,
      port: target,
      entry: DevSource.entry(root),
      watch,
      startedAt: new Date().toISOString(),
    }
    fs.writeFileSync(pidFile, JSON.stringify(state, null, 2))
  }

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await health(target)) {
      UI.println(`dev server up on ${url(target)} (pid ${child.pid ?? "?"}, watch ${watch})`)
      return true
    }
    await sleep(500)
  }
  UI.error(`dev server did not answer on ${url(target)}`)
  const tail = logTail(DevSource.newestLog(), 20)
  if (tail) UI.println(tail)
  return false
}

async function down(root: string) {
  const { pidFile } = DevSource.state(root)
  const state = readState(pidFile)
  if (!state) {
    UI.println("no dev server recorded")
    return true
  }

  // A PID is only signalled when its command line still points at our entrypoint, so a recycled PID
  // can never be killed from a stale record, and a server that lost its port is still reaped.
  const owned = owns(state.pid, state.entry)
  if (owned) {
    terminate(state.pid)
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline && (await health(state.port))) await sleep(300)
    if (await health(state.port)) {
      UI.error(`port ${state.port} still answering after terminating pid ${state.pid}`)
      return false
    }
    UI.println(`dev server stopped (pid ${state.pid}, port ${state.port})`)
  } else if (await health(state.port)) {
    UI.error(`port ${state.port} answers but pid ${state.pid} is not ${state.entry}; not terminating it`)
    return false
  } else {
    UI.println(`dev server already down (recorded pid ${state.pid})`)
  }
  fs.rmSync(pidFile, { force: true })
  return true
}

async function status(root: string, target: number) {
  const { pidFile } = DevSource.state(root)
  const logFile = DevSource.newestLog()
  const state = readState(pidFile)
  const running = await health(target)
  UI.empty()
  UI.println(`root        ${root}`)
  UI.println(`entry       ${DevSource.entry(root)}`)
  UI.println(`port        ${target}`)
  UI.println(`recorded    ${state ? `${state.pid} (watch ${state.watch}, since ${state.startedAt})` : "none"}`)
  UI.println(`pid alive   ${state ? alive(state.pid) : false}`)
  UI.println(`health      ${running ? JSON.stringify(running) : "down"}`)
  UI.println(`log         ${logFile}`)
  const tail = logTail(logFile, 8)
  if (tail) {
    UI.println("--- last log lines ---")
    UI.println(tail)
  }
}

async function tui(root: string, target: number, watch: boolean) {
  if (!(await up(root, target, watch))) return false
  // The TUI is a disposable client: handing the terminal to a fresh source-built process means every
  // reload picks up the working tree while the session itself lives in the server.
  const [command, ...prefix] = DevSource.runner(root)
  const child = spawn(command, [...prefix, "attach", url(target)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, OPENCODE_DEV_SOURCE: root, OPENCODE_NO_DAEMON_AUTOSTART: "1" },
  })
  const code = await new Promise<number>((resolve) => child.on("exit", (value) => resolve(value ?? 0)))
  process.exitCode = code
  return code === 0
}

// Run the fork's own sources: a background server whose process tree never includes the installed
// binary, plus disposable clients (TUI, GUI, CLI) that attach to it.
export const DevCommand = cmd({
  command: "dev <action>",
  describe: "run from repository sources with a background server (up, down, status, tui, logs)",
  builder: (yargs) =>
    yargs
      .positional("action", {
        type: "string",
        choices: actions,
        default: "tui" as const,
        describe: "up | down | status | tui | logs",
      })
      .option("port", {
        type: "number",
        describe: `port of the background server (default ${DevSource.DEFAULT_PORT})`,
      })
      .option("watch", {
        type: "boolean",
        default: true,
        describe: "restart the server when sources change (--no-watch to disable)",
      })
      .option("lines", {
        type: "number",
        default: 40,
        describe: "log lines to show for the logs action",
      }),
  handler: async (args) => {
    const root = DevSource.root()
    if (!root) {
      UI.error("not running from repository sources")
      UI.println("This command needs the fork's TypeScript entrypoint, e.g. `bun run dev:tui`.")
      process.exitCode = 1
      return
    }

    const target = port(args)
    const action = String(args.action ?? "tui")

    if (action === "up" && !(await up(root, target, args.watch))) process.exitCode = 1
    if (action === "down" && !(await down(root))) process.exitCode = 1
    if (action === "status") await status(root, target)
    if (action === "logs") {
      const logFile = DevSource.newestLog()
      const tail = logTail(logFile, args.lines)
      UI.println(tail || `no log yet (looked for the product log, newest was ${logFile || "none"})`)
    }
    if (action === "tui" && !(await tui(root, target, args.watch))) process.exitCode = 1
  },
})
