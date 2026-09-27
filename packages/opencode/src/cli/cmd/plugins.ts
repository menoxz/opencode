import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { UI } from "../ui"
import { effectCmd } from "../effect-cmd"

const defaultUrl = "http://127.0.0.1:4096"

type Action = "list" | "reload" | "add" | "remove"

function serverUrl(value?: string) {
  return (value ?? process.env.OPENCODE_SERVER_URL ?? defaultUrl).replace(/\/+$/, "")
}

async function ensureServer(url: string) {
  try {
    const health = await fetch(`${url}/global/health`, { signal: AbortSignal.timeout(2000) })
    if (health.ok) return undefined
    return `server at ${url} answered ${health.status}`
  } catch (error) {
    return `no server reachable at ${url} (${error instanceof Error ? error.message : String(error)})`
  }
}

function report(status: { version: number | string; origins: Array<{ spec: string; scope: string }>; hooks: string[] }) {
  UI.empty()
  UI.println(`generation  ${status.version}`)
  UI.println(`origins     ${status.origins.length}`)
  for (const origin of status.origins) UI.println(`  ${origin.scope}  ${origin.spec}`)
  UI.println(`hooks       ${status.hooks.length}`)
  for (const hook of status.hooks) UI.println(`  ${hook}`)
}

// Server-side plugin management. These commands talk to a running `serve` process, so a plugin can
// be added, reloaded or removed without restarting the harness; the reload is atomic and a plugin
// that fails to load is quarantined instead of breaking the session.
export const PluginsCommand = effectCmd({
  command: "plugins <action> [spec]",
  describe: "manage plugins of a running server (list, reload, add, remove)",
  builder: (yargs) =>
    yargs
      .positional("action", {
        type: "string",
        choices: ["list", "reload", "add", "remove"] as const,
        describe: "list | reload | add | remove",
      })
      .positional("spec", {
        type: "string",
        describe: "plugin specifier: local path, file URL or npm package name (add/remove)",
      })
      .option("url", {
        type: "string",
        describe: `base URL of a running server (default ${defaultUrl})`,
      }),
  handler: Effect.fn("Cli.plugins")(function* (args) {
    const action = String(args.action ?? "list") as Action
    const url = serverUrl(args.url)
    if ((action === "add" || action === "remove") && !String(args.spec ?? "").trim()) {
      UI.error(`${action} requires a plugin specifier`)
      process.exitCode = 1
      return
    }

    const unreachable = yield* Effect.promise(() => ensureServer(url))
    if (unreachable) {
      UI.error(unreachable)
      UI.println("Start one with: opencodev2 serve")
      process.exitCode = 1
      return
    }

    const client = createOpencodeClient({ baseUrl: url })
    const directory = process.cwd()
    const spec = String(args.spec ?? "").trim()

    const status = yield* Effect.promise(async () => {
      try {
        if (action === "list") return (await client.plugin.list({ directory })).data
        if (action === "reload") return (await client.plugin.reload({ directory })).data
        if (action === "add") return (await client.plugin.add({ directory, spec })).data
        return (await client.plugin.remove({ directory, spec })).data
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })

    if (typeof status === "string" || !status) {
      UI.error(`plugin ${action} failed: ${status ?? "no response"}`)
      process.exitCode = 1
      return
    }

    report(status)
  }),
})
