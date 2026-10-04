import fs from "node:fs"
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

/** Command prefix that runs the CLI from sources. Mirrors the repo's own `dev:serve:watch` invocation. */
export function runner(root: string, watch = false): string[] {
  return [process.execPath, ...(watch ? ["--watch"] : []), "--conditions=browser", entry(root)]
}

export const DevSource = { SOURCE_ENV, DEFAULT_PORT, entry, root, runner }
