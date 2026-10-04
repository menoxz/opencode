// Proves the live-reload loop for the fork's own sources: a watched dev server started from the
// repository root picks up a change in ANY package, with no rebuild and no redeploy of the binary.
//
// Why the repository root: `bun --watch` only watches the subtree of its working directory. Started
// from `packages/opencode`, Bun prints `File ... is not in the project directory and will not be
// watched` for every sibling package, so edits to `packages/core`, `packages/llm` and friends are
// silently ignored. Started from the root, the whole workspace is watched.
//
// Non-invasive: the probe only bumps the mtime of a watched file; it never changes content, so the
// working tree stays clean and the test is safe to run repeatedly.
//
// Usage: bun run dev:serve:smoke   (see package.json at the repository root)

import { tmpdir } from "os"
import { utimesSync } from "fs"
import path from "path"

const repoRoot = path.resolve(import.meta.dir, "../../..")
const port = 4600 + Math.floor(Math.random() * 300)
const healthURL = `http://127.0.0.1:${port}/global/health`
const logFile = path.join(tmpdir(), `opencodev2-dev-live-reload-${port}.log`)
const probe = path.join(repoRoot, "packages/core/src/installation/version.ts")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const readLog = () => Bun.file(logFile).text().catch(() => "")

const bootCount = async () => (await readLog()).split("\n").filter((line) => line.includes("server listening on")).length

const notWatched = async () => (await readLog()).split("\n").filter((line) => line.includes("will not be watched")).length

const health = async () => {
  const response = await fetch(healthURL, { signal: AbortSignal.timeout(2_000) }).catch(() => undefined)
  if (!response?.ok) return undefined
  return (await response.json()) as { healthy: boolean; version: string }
}

const until = async <T>(what: string, timeoutMs: number, probeFn: () => Promise<T | undefined>) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probeFn()
    if (value !== undefined) return value
    await sleep(500)
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
}

await Bun.write(logFile, "")

const server = Bun.spawn(
  [
    process.execPath,
    "--watch",
    "--conditions=browser",
    "./packages/opencode/src/index.ts",
    "serve",
    "--port",
    String(port),
  ],
  { cwd: repoRoot, stdout: Bun.file(logFile), stderr: Bun.file(logFile), stdin: "ignore" },
)

const first = await until("the dev server to boot from source", 120_000, health)
const warnings = await notWatched()
const bootsBefore = await bootCount()

// Touch a file from a sibling package: mtime-only change, no content change.
utimesSync(probe, new Date(), new Date())

const bootsAfter = await until("the watched server to restart", 60_000, async () => {
  const count = await bootCount()
  return count > bootsBefore ? count : undefined
})
const second = await until("the restarted server to answer", 30_000, health)

server.kill()

const results = {
  runsFromSource: first.version === "local",
  watchRootCoversWorkspace: warnings === 0,
  reloadedOnSiblingPackageEdit: bootsAfter > bootsBefore,
  healthyAfterReload: second.healthy === true,
  version: first.version,
  crossPackageWarnings: warnings,
  bootsBefore,
  bootsAfter,
  log: logFile,
}

console.log(
  `LIVE_RELOAD_SMOKE runsFromSource=${results.runsFromSource} watchRootCoversWorkspace=${results.watchRootCoversWorkspace} ` +
    `reloadedOnSiblingPackageEdit=${results.reloadedOnSiblingPackageEdit} healthyAfterReload=${results.healthyAfterReload} ` +
    `version=${results.version} crossPackageWarnings=${results.crossPackageWarnings} bootsBefore=${results.bootsBefore} ` +
    `bootsAfter=${results.bootsAfter} log=${results.log}`,
)

const failed = Object.entries(results).filter(
  ([key, value]) => typeof value === "boolean" && value === false,
)
if (failed.length === 0) {
  console.log("PASS: the fork's own sources reload live from the repository root without a rebuild")
} else {
  console.error(`FAIL: ${failed.map(([key]) => key).join(", ")}`)
  console.error((await readLog()).split("\n").slice(-20).join("\n"))
  process.exit(1)
}
