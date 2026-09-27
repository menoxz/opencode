import { Effect } from "effect"
import { Server } from "../../server/server"
import { UI } from "../ui"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions, validateNetworkAuthentication } from "../network"
import { ensureDaemonStarted } from "@/daemon/autostart"
import { DevSource } from "@/dev/source"
import { startAppDevServer } from "@/dev/app-server"
import { Flag } from "@opencode-ai/core/flag/flag"
import open from "open"
import { networkInterfaces } from "os"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = effectCmd({
  command: "web",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "start opencodev2 server and open web interface",
  // Server loads instances per-request via x-opencode-directory header — no
  // ambient project InstanceContext needed at startup.
  instance: false,
  handler: Effect.fn("Cli.web")(function* (args) {
    ensureDaemonStarted()
    const root = DevSource.root()
    const opts = yield* resolveNetworkOptions(args)
    // In a source checkout the GUI is served by the app dev server, whose default backend is
    // the well-known port: pin it unless the user chose one, so both sides agree.
    const port = root && !process.argv.includes("--port") && opts.port === 0 ? DevSource.DEFAULT_PORT : opts.port

    validateNetworkAuthentication(opts.hostname, Flag.OPENCODE_SERVER_PASSWORD)

    const server = yield* Effect.promise(() => Server.listen({ ...opts, port }))

    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    // Live GUI from the working tree; undefined outside a source checkout, where the server
    // keeps serving the build-time bundle (or proxying the hosted app).
    const gui = root
      ? yield* Effect.promise(() => startAppDevServer(root, { hostname: "localhost", port: server.port }))
      : undefined
    if (gui) UI.println(UI.Style.TEXT_INFO_BOLD + "  GUI from sources:  ", UI.Style.TEXT_NORMAL, gui.url)

    if (opts.hostname === "0.0.0.0") {
      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          UI.println(
            UI.Style.TEXT_INFO_BOLD + "  Network access:    ",
            UI.Style.TEXT_NORMAL,
            `http://${ip}:${server.port}`,
          )
        }
      }

      if (opts.mdns) {
        UI.println(
          UI.Style.TEXT_INFO_BOLD + "  mDNS:              ",
          UI.Style.TEXT_NORMAL,
          `${opts.mdnsDomain}:${server.port}`,
        )
      }

      // Open localhost in browser
      open(gui?.url ?? localhostUrl).catch(() => {})
    } else {
      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      open(gui?.url ?? displayUrl).catch(() => {})
    }

    yield* Effect.never
  }),
})
