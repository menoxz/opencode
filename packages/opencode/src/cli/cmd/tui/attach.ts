import { spawn } from "node:child_process"
import { cmd } from "../cmd"
import { UI } from "@/cli/ui"
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { TuiConfig } from "@/cli/cmd/tui/config/tui"
import { errorMessage } from "@/util/error"
import { validateSession } from "./validate-session"
import { ServerAuth } from "@/server/auth"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function serverBinary(): string {
  const exe = process.execPath
  return exe.endsWith("opencodev2.exe") ||
    exe.endsWith("opencodev2") ||
    exe.endsWith("opencode.exe") ||
    exe.endsWith("opencode")
    ? exe
    : "opencodev2"
}

function serverReachable(url: string, headers?: RequestInit["headers"]): Promise<boolean> {
  // Any HTTP response means a server is up (401 = up but auth required) — only
  // a network-level failure means nothing is listening.
  return fetch(`${url}/config`, { headers, signal: AbortSignal.timeout(1500) }).then(
    () => true,
    () => false,
  )
}

async function ensureServer(url: string, headers?: RequestInit["headers"]): Promise<void> {
  const parsed = new URL(url)
  if (!LOCAL_HOSTS.has(parsed.hostname)) return
  if (await serverReachable(url, headers)) return

  const port = Number(parsed.port)
  if (!port) {
    throw new Error(
      `Server not reachable at ${url} and port is unknown — specify one, e.g. http://localhost:4096`,
    )
  }

  UI.println(`No server at ${parsed.origin} — starting opencodev2 serve on port ${port}…`)
  spawn(serverBinary(), ["serve", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref()

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (await serverReachable(url, headers)) {
      UI.println(`Server ready at ${parsed.origin}`)
      return
    }
  }
  throw new Error(
    `Timed out waiting for the server at ${parsed.origin} — check that port ${port} is free`,
  )
}

export const AttachCommand = cmd({
  command: "attach <url>",
  describe: "attach to a running opencodev2 server",
  builder: (yargs) =>
    yargs
      .positional("url", {
        type: "string",
        describe: "http://localhost:4096",
        demandOption: true,
      })
      .option("dir", {
        type: "string",
        description: "directory to run in",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("password", {
        alias: ["p"],
        type: "string",
        describe: "basic auth password (defaults to OPENCODE_SERVER_PASSWORD)",
      })
      .option("username", {
        alias: ["u"],
        type: "string",
        describe: "basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')",
      }),
  handler: async (args) => {
    const unguard = win32InstallCtrlCGuard()
    try {
      win32DisableProcessedInput()

      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session")
        process.exitCode = 1
        return
      }

      const directory = (() => {
        if (!args.dir) return undefined
        try {
          process.chdir(args.dir)
          return process.cwd()
        } catch {
          // If the directory doesn't exist locally (remote attach), pass it through.
          return args.dir
        }
      })()
      const headers = ServerAuth.headers({ password: args.password, username: args.username })
      const config = await TuiConfig.get()
      const { tui } = await import("./app")

      await ensureServer(args.url, headers)

      try {
        await validateSession({
          url: args.url,
          sessionID: args.session,
          directory,
          headers,
        })
      } catch (error) {
        UI.error(errorMessage(error))
        process.exitCode = 1
        return
      }

      await tui({
        url: args.url,
        config,
        args: {
          continue: args.continue,
          sessionID: args.session,
          fork: args.fork,
        },
        directory,
        headers,
      })
    } finally {
      unguard?.()
    }
  },
})
