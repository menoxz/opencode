import { Effect } from "effect"
import { Server } from "../../server/server"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions, validateNetworkAuthentication } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless opencodev2 server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const opts = yield* resolveNetworkOptions(args)
    validateNetworkAuthentication(opts.hostname, Flag.OPENCODE_SERVER_PASSWORD)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`opencodev2 server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})
