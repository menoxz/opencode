import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "@/lsp/lsp"
import { File } from "../file"
import { Snapshot } from "../snapshot"
import * as Project from "./project"
import * as Vcs from "./vcs"
import { Bus } from "../bus"
import { InstanceState } from "@/effect/instance-state"
import { FileWatcher } from "@/file/watcher"
import { ShareNext } from "@/share/share-next"
import { Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { Service } from "./bootstrap-service"
import { Reference } from "@/reference/reference"
import { MCP } from "@/mcp"
import { RuntimeFlags } from "@/effect/runtime-flags"

export { Service } from "./bootstrap-service"
export type { Interface } from "./bootstrap-service"

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Yield each bootstrap dep at layer init so `run` itself has R = never.
    // InstanceStore imports only the lightweight tag from bootstrap-service.ts,
    // so it can depend on bootstrap without importing this implementation graph.
    const config = yield* Config.Service
    const file = yield* File.Service
    const fileWatcher = yield* FileWatcher.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const mcp = yield* MCP.Service
    const flags = yield* RuntimeFlags.Service
    const plugin = yield* Plugin.Service
    const project = yield* Project.Service
    const reference = yield* Reference.Service
    const shareNext = yield* ShareNext.Service
    const snapshot = yield* Snapshot.Service
    const vcs = yield* Vcs.Service

    const run = Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      yield* Effect.logInfo("bootstrapping").pipe(Effect.annotateLogs("directory", ctx.directory))
      // everything depends on config so eager load it for nice traces
      yield* config.get()
      // Plugin can mutate config so it has to be initialized before anything else.
      yield* plugin.init()
      // Each service self-manages its own slow work via Effect.forkScoped against
      // its per-instance state scope. We just await materialization here.
      yield* Effect.forEach(
        [reference, lsp, shareNext, format, file, fileWatcher, vcs, snapshot, project],
        (s) => s.init().pipe(Effect.catchCause((cause) => Effect.logWarning("init failed", { cause }))),
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.withSpan("InstanceBootstrap.init"))
      // MCP clients materialize on first use, which used to be the first prompt's tool resolution:
      // the prompt then waited for every connection at once — measured 3.2s here, on top of the 5s
      // the launch directory had already paid while nobody was typing. Warming them here moves that
      // work under the user's reading time instead.
      //
      // Forked on purpose: this bootstrap's completion is what releases the instance, so awaiting
      // the connections would delay every instance by however long they take.
      //
      // Opt-in (`OPENCODE_EXPERIMENTAL_MCP_WARMUP`), because the cost is paid PER INSTANCE and the
      // TUI creates one instance per folder it hydrates: measured on 2026-10-23, six instances
      // started 36 MCP clients and twelve sockets and left the process at 95% CPU. Lazy clients
      // cost one warmup (~3s) on the instance that actually runs a turn, instead of N warmups at
      // launch on instances that only list sessions.
      if (flags.mcpWarmup) {
        yield* mcp
          .status()
          .pipe(
            Effect.catchCause((cause) => Effect.logWarning("mcp warmup failed", { cause })),
            Effect.forkDetach,
          )
      }
    }).pipe(Effect.withSpan("InstanceBootstrap"))

    return Service.of({ run })
  }),
)

export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide([
    Bus.layer,
    Config.defaultLayer,
    File.defaultLayer,
    FileWatcher.defaultLayer,
    Format.defaultLayer,
    LSP.defaultLayer,
    MCP.defaultLayer,
    Plugin.defaultLayer,
    Project.defaultLayer,
    Reference.defaultLayer,
    ShareNext.defaultLayer,
    Snapshot.defaultLayer,
    Vcs.defaultLayer,
    RuntimeFlags.defaultLayer,
  ]),
)

export * as InstanceBootstrap from "./bootstrap"
