import { spawn, spawnSync } from "node:child_process"
import path from "node:path"

/** Vite dev server port declared by packages/app/vite.config.ts. */
const APP_PORT = 3000
const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 250

/**
 * The app resolves its backend from these at start-up and falls back to `localhost:4096`
 * (packages/app/src/entry.tsx getDefaultUrl, declared in packages/app/src/env.d.ts).
 */
export function appEnv(hostname: string, port: number): Record<string, string> {
  return { VITE_OPENCODE_SERVER_HOST: hostname, VITE_OPENCODE_SERVER_PORT: String(port) }
}

export function appUrl(port = APP_PORT): string {
  return `http://localhost:${port}`
}

function killTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
    return
  }
  process.kill(pid, "SIGTERM")
}

async function waitForApp(url: string, child: { exitCode: number | null }) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the web GUI dev server exited with code ${child.exitCode}`)
    const ready = await fetch(url)
      .then((response) => response.ok)
      .catch(() => false)
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
  }
  throw new Error(`timed out waiting for the web GUI dev server at ${url}`)
}

/**
 * Serves the web GUI from the working tree instead of the bundle generated at build time.
 * The child is torn down with this process: an orphaned Vite would hold the port and make the
 * next run bind somewhere else.
 */
export async function startAppDevServer(
  root: string,
  backend: { hostname: string; port: number },
  port = APP_PORT,
): Promise<{ url: string; stop: () => void }> {
  const child = spawn(process.execPath, ["run", "dev", "--", "--port", String(port)], {
    cwd: path.join(root, "packages", "app"),
    env: { ...process.env, ...appEnv(backend.hostname, backend.port), BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))

  const stop = () => {
    if (child.pid === undefined || child.exitCode !== null) return
    killTree(child.pid)
  }
  process.once("exit", stop)
  process.once("SIGINT", () => {
    stop()
    process.exit(0)
  })
  process.once("SIGTERM", () => {
    stop()
    process.exit(0)
  })

  const url = appUrl(port)
  await waitForApp(url, child)
  return { url, stop }
}
