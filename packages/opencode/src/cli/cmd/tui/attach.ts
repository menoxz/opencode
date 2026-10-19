import { spawn } from "node:child_process"
import { cmd } from "../cmd"
import { UI } from "@/cli/ui"
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { TuiConfig } from "@/cli/cmd/tui/config/tui"
import { errorMessage } from "@/util/error"
import { validateSession } from "./validate-session"
import { ServerAuth } from "@/server/auth"
import { ensureDaemonStarted } from "@/daemon/autostart"
import { DevSource } from "@/dev/source"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { readServerVersion, versionNotice } from "./server-version"
import {
  decideServerRestart,
  isOwnServerImage,
  portOccupants,
  processImage,
  restartLocalServer,
  waitFor,
} from "@/cli/server-restart"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function serverCommand(): string[] {
  // In development the background server must be the source entrypoint: spawning `opencodev2` here
  // would silently serve the last deployed build instead of the working tree.
  const root = DevSource.root()
  if (root) return DevSource.runner(root)
  const exe = process.execPath
  const binary =
    exe.endsWith("opencodev2.exe") || exe.endsWith("opencodev2") || exe.endsWith("opencode.exe") || exe.endsWith("opencode")
      ? exe
      : "opencodev2"
  return [binary]
}

/** Serveurs engendrés par cette session : on ne se tue pas soi-même en croyant nettoyer un ancien. */
const owned = new Set<number>()

function spawnServer(port: number, listener: readonly string[]) {
  const [command, ...prefix] = serverCommand()
  const child = spawn(command, [...prefix, "serve", "--port", String(port), ...listener], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  if (child.pid) owned.add(child.pid)
  child.unref()
}

function serverReachable(url: string, headers?: RequestInit["headers"]): Promise<boolean> {
  // Any HTTP response means a server is up (401 = up but auth required) — only
  // a network-level failure means nothing is listening.
  return fetch(`${url}/config`, { headers, signal: AbortSignal.timeout(1500) }).then(
    () => true,
    () => false,
  )
}

/**
 * Démarre le serveur local s'il n'écoute pas encore, et attend qu'il réponde.
 *
 * `listener` porte les options d'écoute de l'invocation (`--hostname`, `--mdns`, `--cors`…) : les
 * perdre ferait un serveur qui n'écoute pas là où le client qui vient de le lancer l'appelle.
 */
export async function ensureServer(
  url: string,
  headers?: RequestInit["headers"],
  listener: readonly string[] = [],
): Promise<void> {
  const parsed = new URL(url)
  if (!LOCAL_HOSTS.has(parsed.hostname)) return

  const port = Number(parsed.port)
  const waitVersion = async () => {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const version = await readServerVersion({ url, headers })
      if (version !== undefined) return version
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return undefined
  }

  if (await serverReachable(url, headers)) {
    const served = await readServerVersion({ url, headers })
    const notice = versionNotice(InstallationVersion, served)
    if (!notice) return
    // Le serveur qui répond n'est pas celui qu'on vient de déployer : la mise à jour resterait sans
    // effet, en silence. On applique la recette de remplacement à la place de l'utilisateur —
    // arrêt ciblé du processus qui tient le port, puis relance depuis le binaire courant.
    const holder = (await portOccupants(port))[0]
    const decision = decideServerRestart({
      mismatch: true,
      portOccupant: holder,
      ownServer: holder ? isOwnServerImage(await processImage(holder)) : undefined,
      children: [...owned],
    })
    if (decision.action === "keep") {
      UI.println(notice)
      return
    }
    UI.println(`Server ${served} ≠ this build (${InstallationVersion}) — restarting it…`)
    const restarted = await restartLocalServer({
      pid: decision.pid,
      spawn: () => spawnServer(port, listener),
      waitPortFree: () => waitFor(async () => (await portOccupants(port)).length === 0, 10_000),
      waitVersion,
    })
    if (restarted) {
      UI.println(`Server ready at ${parsed.origin} (${InstallationVersion})`)
      return
    }
    // La bascule a échoué : on ne bloque pas le lancement, on dit l'écart et on laisse l'ancien
    // serveur maître de ses sessions.
    UI.println(notice)
    return
  }

  if (!port) {
    throw new Error(
      `Server not reachable at ${url} and port is unknown — specify one, e.g. http://localhost:4096`,
    )
  }

  UI.println(`No server at ${parsed.origin} — starting opencodev2 serve on port ${port}…`)
  spawnServer(port, listener)

  if ((await waitVersion()) !== undefined) {
    UI.println(`Server ready at ${parsed.origin}`)
    return
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

      // Ensure the single background daemon is up (fire-and-forget, never fails).
      ensureDaemonStarted()

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
