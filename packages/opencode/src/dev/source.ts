import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Source-based development runtime.
 *
 * `opencodev2` normally runs as a self-contained binary, so the only way to see a source edit is to
 * rebuild and redeploy. When this module resolves a repository root, the CLI spawns its children
 * (the background server, the TUI, the daemon) through Bun and the TypeScript entrypoint instead of
 * the installed binary — so an edit is picked up without any rebuild.
 */
export const SOURCE_ENV = "OPENCODE_DEV_SOURCE"

/** Default port of the development background server. Pinned so every client can find it. */
export const DEFAULT_PORT = 4096

/** The repository root this process is actually running from, if any. */
function runningRoot(): string | undefined {
  const explicit = process.env[SOURCE_ENV]
  if (explicit && fs.existsSync(entry(explicit))) return explicit
  // Otherwise the process must *be* this repository's TypeScript entrypoint. Merely being located
  // near the repository is not enough: tests, scripts and tools imported from the repo must not
  // silently change how their child processes are spawned.
  const script = process.argv[1]
  if (!script) return undefined
  const running = path.resolve(script)
  const candidates = [process.env[SOURCE_ENV], path.resolve(import.meta.dir, "../../../..")].filter(
    (value): value is string => Boolean(value),
  )
  return candidates.find((candidate) => path.resolve(entry(candidate)) === running)
}

/** The TypeScript CLI entrypoint that both the TUI and the server boot from in development. */
export function entry(root: string): string {
  return path.join(root, "packages", "opencode", "src", "index.ts")
}

/** Resolved repository root, or `undefined` when running from a built binary. */
export function root(): string | undefined {
  return runningRoot()
}

/** Root of the fork's own runtime state, kept outside the repository. */
function base(): string {
  const fallback = path.join(os.homedir(), ".local", "share")
  return process.env.OPENCODE_DEV_HOME ?? path.join(process.env.LOCALAPPDATA ?? fallback, "opencodev2")
}

/**
 * Per-root bookkeeping for the background server.
 *
 * It must live outside the repository: the server is started with `bun --watch` rooted on the repo,
 * so a file written inside it would be observed as a source change and restart the server that wrote
 * it — an endless self-restart loop.
 */
export function state(root: string) {
  const key = createHash("sha1").update(root).digest("hex").slice(0, 8)
  return { dir: path.join(base(), "dev"), pidFile: path.join(base(), "dev", `${key}.json`) }
}

function mtime(file: string) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return 0
  }
}

/** Newest log file the CLI writes, wherever the logger resolved its directory. */
export function newestLog(): string {
  const dirs = [process.env.OPENCODE_LOG_DIR, path.join(base(), "log"), path.join(process.env.LOCALAPPDATA ?? "", "opencode", "log")]
  const files = dirs
    .filter((dir): dir is string => Boolean(dir))
    .flatMap((dir) => {
      try {
        return fs.readdirSync(dir).map((name) => path.join(dir, name))
      } catch {
        return []
      }
    })
    .filter((file) => file.endsWith(".log"))
  return files.sort((a, b) => mtime(b) - mtime(a))[0] ?? ""
}

/** Command prefix that runs the CLI from sources. Mirrors the repo's own `dev:serve:watch` invocation. */
export function runner(root: string, watch = false): string[] {
  return [process.execPath, ...(watch ? ["--watch"] : []), "--conditions=browser", entry(root)]
}

/** True when the CLI itself is running from the repository rather than from the installed binary. */
export function isSourceRun(): boolean {
  return root() !== undefined
}

export const DevSource = { SOURCE_ENV, DEFAULT_PORT, entry, root, state, newestLog, runner, isSourceRun }
