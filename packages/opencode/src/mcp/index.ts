import { dynamicTool, type Tool, jsonSchema, type JSONSchema7 } from "ai"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ToolSchema,
  type Tool as MCPToolDef,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { Config } from "@/config/config"
import { ConfigMCP } from "../config/mcp"
import * as Log from "@opencode-ai/core/util/log"
import { NamedError } from "@opencode-ai/core/util/error"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { withTimeout } from "@/util/timeout"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { McpOAuthProvider, OAUTH_CALLBACK_PATH } from "./oauth-provider"
import { McpOAuthCallback } from "./oauth-callback"
import { McpAuth } from "./auth"
import { BusEvent } from "../bus/bus-event"
import { Bus } from "@/bus"
import { TuiEvent } from "@/cli/cmd/tui/event"
import open from "open"
import { Effect, Exit, Layer, Option, Context, Schema, Semaphore, Stream, Schedule, Duration } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { isConfigFile } from "@/hotreload"
import * as fs from "fs"
import path from "path"
import { createHash } from "crypto"

const log = Log.create({ service: "mcp" })
const DEFAULT_TIMEOUT = 30_000

export const defaultMcpHealthIntervalMs = 30_000
const HEALTH_PING_TIMEOUT_MS = 3_000
const RECONNECT_BACKOFF_BASE_MS = 1_000
const RECONNECT_BACKOFF_MAX_MS = 30_000

const TolerantListToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.omit({ outputSchema: true }).array(),
})

export const Resource = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optional(Schema.String),
  client: Schema.String,
}).annotate({ identifier: "McpResource" })
export type Resource = Schema.Schema.Type<typeof Resource>

export const ToolsChanged = BusEvent.define(
  "mcp.tools.changed",
  Schema.Struct({
    server: Schema.String,
  }),
)

export const BrowserOpenFailed = BusEvent.define(
  "mcp.browser.open.failed",
  Schema.Struct({
    mcpName: Schema.String,
    url: Schema.String,
  }),
)

export const Failed = NamedError.create("MCPFailed", {
  name: Schema.String,
})

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("MCP.NotFoundError", {
  name: Schema.String,
}) {}

type MCPClient = Client

const StatusConnected = Schema.Struct({ status: Schema.Literal("connected") }).annotate({
  identifier: "MCPStatusConnected",
})
const StatusDisabled = Schema.Struct({ status: Schema.Literal("disabled") }).annotate({
  identifier: "MCPStatusDisabled",
})
const StatusFailed = Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }).annotate({
  identifier: "MCPStatusFailed",
})
const StatusNeedsAuth = Schema.Struct({ status: Schema.Literal("needs_auth") }).annotate({
  identifier: "MCPStatusNeedsAuth",
})
const StatusNeedsClientRegistration = Schema.Struct({
  status: Schema.Literal("needs_client_registration"),
  error: Schema.String,
}).annotate({ identifier: "MCPStatusNeedsClientRegistration" })

export const Status = Schema.Union([
  StatusConnected,
  StatusDisabled,
  StatusFailed,
  StatusNeedsAuth,
  StatusNeedsClientRegistration,
]).annotate({ identifier: "MCPStatus", discriminator: "status" })
export type Status = Schema.Schema.Type<typeof Status>

// Store transports for OAuth servers to allow finishing auth
type TransportWithAuth = StreamableHTTPClientTransport | SSEClientTransport
const pendingOAuthTransports = new Map<string, TransportWithAuth>()

// Prompt cache types
type PromptInfo = Awaited<ReturnType<MCPClient["listPrompts"]>>["prompts"][number]
type ResourceInfo = Awaited<ReturnType<MCPClient["listResources"]>>["resources"][number]
type McpEntry = NonNullable<Config.Info["mcp"]>[string]

function isMcpConfigured(entry: McpEntry): entry is ConfigMCP.Info {
  return typeof entry === "object" && entry !== null && "type" in entry
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_")

// Clients we are closing on purpose (disconnect/reload/replace) — their
// transport close event must NOT trigger an automatic reconnect.
const intentionalClose = new WeakSet<MCPClient>()

function pingWithTimeout(client: MCPClient, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeout)
    client.ping().then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      },
    )
  })
}

function remoteURL(key: string, value: string) {
  if (URL.canParse(value)) return new URL(value)
  log.warn("invalid remote mcp url", { key })
}

function isOutputSchemaValidationError(error: Error) {
  return /can't resolve reference|resolves to more than one schema|outputSchema|schema.*reference|reference.*schema/i.test(
    error.message,
  )
}

function listTools(key: string, client: MCPClient, timeout: number) {
  const startedAt = Date.now()
  return Effect.tryPromise({
    try: () => client.listTools(undefined, { timeout }),
    catch: (err) => (err instanceof Error ? err : new Error(String(err))),
  }).pipe(
    Effect.map((result) => result.tools),
    Effect.catch((error) => {
      if (!isOutputSchemaValidationError(error)) return Effect.fail(error)

      log.warn("failed to validate MCP tool output schemas, retrying without output schema validation", { key, error })
      return Effect.tryPromise({
        try: () =>
          client.request({ method: "tools/list" }, TolerantListToolsResultSchema, {
            timeout,
          }),
        catch: (err) => (err instanceof Error ? err : new Error(String(err))),
      }).pipe(
        Effect.map((result) =>
          result.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        ),
      )
    }),
    Effect.tap((tools) =>
      Effect.sync(() => log.info("listed tools", { key, toolCount: tools.length, durationMs: Date.now() - startedAt })),
    ),
  )
}

// Signatures of a transport that died under us, as opposed to a tool that
// legitimately failed. Only these are worth retrying: a timeout (-32001) is
// deliberately excluded, since retrying it doubles an already long wait.
const DISCONNECTED_PATTERN =
  /not connected|connection closed|transport closed|session not found|econnreset|epipe|-32000|-32600/i

export function isDisconnected(error: unknown): boolean {
  return DISCONNECTED_PATTERN.test(error instanceof Error ? error.message : String(error))
}

const HEALTH_FAILURE_THRESHOLD = 3

export function shouldDisconnectAfterHealthFailures(failures: number): boolean {
  return failures >= HEALTH_FAILURE_THRESHOLD
}

// Convert MCP tool definition to AI SDK Tool type.
//
// `resolve` deliberately re-reads the live client on every call instead of
// capturing it (see AUDIT-opencodev2.md, D6): auto-reconnect replaces the
// client object in state, but a captured reference keeps pointing at the dead
// transport, so every later call in that session failed with `Not connected`
// even though a healthy client was sitting right there. ~40 such failures were
// measured over 45 days, plus a hundred timeouts.
function convertMcpTool(
  mcpTool: MCPToolDef,
  resolve: () => MCPClient | undefined,
  recover: (failed: MCPClient, error: unknown) => Promise<MCPClient | undefined>,
  timeout?: number,
  server?: string,
): Tool {
  const inputSchema = mcpTool.inputSchema

  // Spread first, then override type to ensure it's always "object"
  const schema: JSONSchema7 = {
    ...(inputSchema as JSONSchema7),
    type: "object",
    properties: (inputSchema.properties ?? {}) as JSONSchema7["properties"],
    additionalProperties: false,
  }

  const label = server ?? mcpTool.name

  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),
    execute: async (args: unknown, options) => {
      const startedAt = Date.now()
      const call = (client: MCPClient) =>
        client.callTool(
          {
            name: mcpTool.name,
            arguments: (args || {}) as Record<string, unknown>,
          },
          CallToolResultSchema,
          {
            resetTimeoutOnProgress: true,
            timeout,
            signal: options.abortSignal,
          },
        )

      const live = resolve()
      if (!live)
        throw new Error(
          `MCP server "${label}" is not connected, so the ${mcpTool.name} tool is unavailable right now. It reconnects automatically in the background — retry shortly, or use a non-MCP tool for this step.`,
        )

      const retryOnce = async (error: unknown) => {
        if (!isDisconnected(error) || options.abortSignal?.aborted) throw error
        log.warn("mcp tool call hit a dead transport, reconnecting before retry", { tool: mcpTool.name, server: label })
        const fresh = await recover(live, error)
        if (!fresh)
          throw new Error(
            `MCP server "${label}" dropped mid-call and has not reconnected yet, so ${mcpTool.name} could not run. It reconnects automatically in the background — retry shortly, or use a non-MCP tool for this step.`,
          )
        return await call(fresh)
      }

      return await call(live)
        .catch(retryOnce)
        .finally(() =>
          log.info("tool call complete", {
            tool: mcpTool.name,
            durationMs: Date.now() - startedAt,
            aborted: options.abortSignal?.aborted ?? false,
          }),
        )
    },
  })
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]),
  )
}

function configFingerprint(config: ConfigMCP.Info) {
  return createHash("sha256").update(JSON.stringify(canonical(config))).digest("hex")
}

function defs(key: string, client: MCPClient, timeout?: number) {
  return listTools(key, client, timeout ?? DEFAULT_TIMEOUT).pipe(
    Effect.catch((err) => {
      log.error("failed to get tools from client", { key, error: err })
      return Effect.succeed(undefined)
    }),
  )
}

function fetchFromClient<T extends { name: string }>(
  clientName: string,
  client: Client,
  listFn: (c: Client) => Promise<T[]>,
  label: string,
) {
  return Effect.tryPromise({
    try: () => listFn(client),
    catch: (e: any) => {
      log.error(`failed to get ${label}`, { clientName, error: e.message })
      return e
    },
  }).pipe(
    Effect.map((items) => {
      const out: Record<string, T & { client: string }> = {}
      const sanitizedClient = sanitize(clientName)
      for (const item of items) {
        out[sanitizedClient + ":" + sanitize(item.name)] = { ...item, client: clientName }
      }
      return out
    }),
    Effect.orElseSucceed(() => undefined),
  )
}

interface CreateResult {
  mcpClient?: MCPClient
  status: Status
  defs?: MCPToolDef[]
}

interface AuthResult {
  authorizationUrl: string
  oauthState: string
  client?: MCPClient
}

// --- Effect Service ---

interface State {
  status: Record<string, Status>
  clients: Record<string, MCPClient>
  defs: Record<string, MCPToolDef[]>
  fingerprints: Record<string, string>
  healthFailures: Record<string, number>
  catalogVersion: number
}

export interface Interface {
  readonly status: () => Effect.Effect<Record<string, Status>>
  readonly clients: () => Effect.Effect<Record<string, MCPClient>>
  readonly catalogVersion?: () => Effect.Effect<number>
  readonly tools: () => Effect.Effect<Record<string, Tool>>
  readonly prompts: () => Effect.Effect<Record<string, PromptInfo & { client: string }>>
  readonly resources: () => Effect.Effect<Record<string, ResourceInfo & { client: string }>>
  readonly add: (name: string, mcp: ConfigMCP.Info) => Effect.Effect<{ status: Record<string, Status> | Status }>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly reload: () => Effect.Effect<void>
  readonly getPrompt: (
    clientName: string,
    name: string,
    args?: Record<string, string>,
  ) => Effect.Effect<Awaited<ReturnType<MCPClient["getPrompt"]>> | undefined>
  readonly readResource: (
    clientName: string,
    resourceUri: string,
  ) => Effect.Effect<Awaited<ReturnType<MCPClient["readResource"]>> | undefined>
  readonly startAuth: (
    mcpName: string,
  ) => Effect.Effect<{ authorizationUrl: string; oauthState: string }, NotFoundError>
  readonly authenticate: (mcpName: string) => Effect.Effect<Status, NotFoundError>
  readonly finishAuth: (mcpName: string, authorizationCode: string) => Effect.Effect<Status, NotFoundError>
  readonly removeAuth: (mcpName: string) => Effect.Effect<void>
  readonly supportsOAuth: (mcpName: string) => Effect.Effect<boolean, NotFoundError>
  readonly hasStoredTokens: (mcpName: string) => Effect.Effect<boolean>
  readonly getAuthStatus: (mcpName: string) => Effect.Effect<AuthStatus>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MCP") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const auth = yield* McpAuth.Service
    const bus = yield* Bus.Service
    const reloadLock = Semaphore.makeUnsafe(1)
    const reconnectLock = Semaphore.makeUnsafe(1)

    type Transport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

    /**
     * Connect a client via the given transport with resource safety:
     * on failure the transport is closed; on success the caller owns it.
     */
    const connectTransport = (transport: Transport, timeout: number) =>
      Effect.acquireUseRelease(
        Effect.succeed(transport),
        (t) =>
          Effect.tryPromise({
            try: () => {
              const client = new Client({ name: "opencode", version: InstallationVersion })
              return withTimeout(
                client.connect(t).then(() => client.listTools()),
                timeout,
              ).then(() => client)
            },
            catch: (e) => (e instanceof Error ? e : new Error(String(e))),
          }),
        (t, exit) => (Exit.isFailure(exit) ? Effect.tryPromise(() => t.close()).pipe(Effect.ignore) : Effect.void),
      )

    const DISABLED_RESULT: CreateResult = { status: { status: "disabled" } }

    const connectRemote = Effect.fn("MCP.connectRemote")(function* (
      key: string,
      mcp: ConfigMCP.Info & { type: "remote" },
    ) {
      const oauthDisabled = mcp.oauth === false
      const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined
      const url = remoteURL(key, mcp.url)
      if (!url) {
        return {
          client: undefined as MCPClient | undefined,
          status: { status: "failed" as const, error: `Invalid MCP URL for "${key}"` },
        }
      }
      let authProvider: McpOAuthProvider | undefined

      if (!oauthDisabled) {
        authProvider = new McpOAuthProvider(
          key,
          mcp.url,
          {
            clientId: oauthConfig?.clientId,
            clientSecret: oauthConfig?.clientSecret,
            scope: oauthConfig?.scope,
            callbackPort: oauthConfig?.callbackPort,
            redirectUri: oauthConfig?.redirectUri,
          },
          {
            onRedirect: async (url) => {
              log.info("oauth redirect requested", { key, url: url.toString() })
            },
          },
          auth,
        )
      }

      const transports: Array<{ name: string; transport: TransportWithAuth }> = [
        {
          name: "StreamableHTTP",
          transport: new StreamableHTTPClientTransport(url, {
            authProvider,
            requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
          }),
        },
        {
          name: "SSE",
          transport: new SSEClientTransport(url, {
            authProvider,
            requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
          }),
        },
      ]

      // Race both remote protocols. Effect.raceAll waits for the first success;
      // interrupted losers run connectTransport's release finalizer and close.
      const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
      let authFailure:
        | { error: Error; transport: TransportWithAuth; transportName: string }
        | undefined
      let lastError = new Error("Unknown error")
      const attempts = transports.map(({ name, transport }) =>
        connectTransport(transport, connectTimeout).pipe(
          Effect.map((client) => ({ client, transportName: name })),
          Effect.tapError((error) =>
            Effect.sync(() => {
              lastError = error instanceof Error ? error : new Error(String(error))
              if (error instanceof UnauthorizedError || (authProvider && lastError.message.includes("OAuth"))) {
                authFailure = { error: lastError, transport, transportName: name }
              }
              log.debug("transport connection failed", {
                key,
                transport: name,
                url: mcp.url,
                error: lastError.message,
              })
            }),
          ),
        ),
      )
      const outcome = yield* Effect.raceAll(attempts).pipe(
        Effect.map((result) => ({ ok: true as const, result })),
        Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
      )

      if (outcome.ok) {
        log.info("connected", { key, transport: outcome.result.transportName })
        return {
          client: outcome.result.client as MCPClient | undefined,
          status: { status: "connected" } as Status,
        }
      }

      if (authFailure) {
        log.info("mcp server requires authentication", { key, transport: authFailure.transportName })
        if (authFailure.error.message.includes("registration") || authFailure.error.message.includes("client_id")) {
          yield* bus
            .publish(TuiEvent.ToastShow, {
              title: "MCP Authentication Required",
              message: `Server "${key}" requires a pre-registered client ID. Add clientId to your config.`,
              variant: "warning",
              duration: 8000,
            })
            .pipe(Effect.ignore)
          return {
            client: undefined as MCPClient | undefined,
            status: {
              status: "needs_client_registration" as const,
              error: "Server does not support dynamic client registration. Please provide clientId in config.",
            } as Status,
          }
        }
        pendingOAuthTransports.set(key, authFailure.transport)
        yield* bus
          .publish(TuiEvent.ToastShow, {
            title: "MCP Authentication Required",
            message: `Server "${key}" requires authentication. Run: opencodev2 mcp auth ${key}`,
            variant: "warning",
            duration: 8000,
          })
          .pipe(Effect.ignore)
        return {
          client: undefined as MCPClient | undefined,
          status: { status: "needs_auth" } as Status,
        }
      }

      return {
        client: undefined as MCPClient | undefined,
        status: { status: "failed", error: lastError.message } as Status,
      }
    })

    const connectLocal = Effect.fn("MCP.connectLocal")(function* (
      key: string,
      mcp: ConfigMCP.Info & { type: "local" },
    ) {
      const [cmd, ...args] = mcp.command
      const cwd = yield* InstanceState.directory
      const transport = new StdioClientTransport({
        stderr: "pipe",
        command: cmd,
        args,
        cwd,
        env: {
          ...process.env,
          ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}),
          ...mcp.environment,
        },
      })
      transport.stderr?.on("data", (chunk: Buffer) => {
        log.info(`mcp stderr: ${chunk.toString()}`, { key })
      })

      const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
      return yield* connectTransport(transport, connectTimeout).pipe(
        Effect.map((client): { client: MCPClient | undefined; status: Status } => ({
          client,
          status: { status: "connected" },
        })),
        Effect.catch((error): Effect.Effect<{ client: MCPClient | undefined; status: Status }> => {
          const msg = error instanceof Error ? error.message : String(error)
          log.error("local mcp startup failed", { key, command: mcp.command, cwd, error: msg })
          return Effect.succeed({ client: undefined, status: { status: "failed", error: msg } })
        }),
      )
    })

    const create = Effect.fn("MCP.create")(function* (key: string, mcp: ConfigMCP.Info) {
      if (mcp.enabled === false) {
        log.info("mcp server disabled", { key })
        return DISABLED_RESULT
      }

      const startedAt = Date.now()
      log.info("connecting", { key, type: mcp.type })

      const { client: mcpClient, status } =
        mcp.type === "remote"
          ? yield* connectRemote(key, mcp as ConfigMCP.Info & { type: "remote" })
          : yield* connectLocal(key, mcp as ConfigMCP.Info & { type: "local" })

      if (!mcpClient) {
        log.info("connection complete", { key, type: mcp.type, status: status.status, durationMs: Date.now() - startedAt })
        return { status } satisfies CreateResult
      }

      const listed = yield* defs(key, mcpClient, mcp.timeout)
      if (!listed) {
        yield* Effect.tryPromise(() => mcpClient.close()).pipe(Effect.ignore)
        return { status: { status: "failed", error: "Failed to get tools" } } satisfies CreateResult
      }

      log.info("create() successfully created client", { key, toolCount: listed.length })
      log.info("connection complete", { key, type: mcp.type, status: status.status, durationMs: Date.now() - startedAt })
      return { mcpClient, status, defs: listed } satisfies CreateResult
    })
    const cfgSvc = yield* Config.Service

    const descendants = Effect.fnUntraced(
      function* (pid: number) {
        if (process.platform === "win32") return [] as number[]
        const pids: number[] = []
        const queue = [pid]
        while (queue.length > 0) {
          const current = queue.shift()!
          const handle = yield* spawner.spawn(ChildProcess.make("pgrep", ["-P", String(current)], { stdin: "ignore" }))
          const text = yield* Stream.mkString(Stream.decodeText(handle.stdout))
          yield* handle.exitCode
          for (const tok of text.split("\n")) {
            const cpid = parseInt(tok, 10)
            if (!isNaN(cpid) && !pids.includes(cpid)) {
              pids.push(cpid)
              queue.push(cpid)
            }
          }
        }
        return pids
      },
      Effect.scoped,
      Effect.catch(() => Effect.succeed([] as number[])),
    )

    function watch(s: State, name: string, client: MCPClient, bridge: EffectBridge.Shape, timeout?: number) {
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        log.info("tools list changed notification received", { server: name })
        if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

        const listed = await bridge.promise(defs(name, client, timeout))
        if (!listed) return
        if (s.clients[name] !== client || s.status[name]?.status !== "connected") return

        s.defs[name] = listed
        s.catalogVersion++
        await bridge.promise(bus.publish(ToolsChanged, { server: name }).pipe(Effect.ignore))
      })

      // Watch the transport so a dead process/pipe marks the server failed
      // immediately instead of staying "connected" while every call errors.
      const transport = client.transport
      if (!transport) return
      const prevClose = transport.onclose
      const prevError = transport.onerror
      transport.onclose = () => {
        prevClose?.()
        bridge.promise(markDisconnected(s, name, client, "transport closed").pipe(Effect.ignore))
      }
      transport.onerror = (error: Error) => {
        prevError?.(error)
        bridge.promise(markDisconnected(s, name, client, `transport error: ${error.message}`).pipe(Effect.ignore))
      }
    }

    const state = yield* InstanceState.make<State>(
      Effect.fn("MCP.state")(function* () {
        const cfg = yield* cfgSvc.get()
        const bridge = yield* EffectBridge.make()
        const config = cfg.mcp ?? {}
        const s: State = {
          status: {},
          clients: {},
          defs: {},
          fingerprints: {},
          healthFailures: {},
          catalogVersion: 1,
        }

        yield* Effect.forEach(
          Object.entries(config),
          ([key, mcp]) =>
            Effect.gen(function* () {
              if (!isMcpConfigured(mcp)) {
                log.error("Ignoring MCP config entry without type", { key })
                return
              }

              s.fingerprints[key] = configFingerprint(mcp)

              if (mcp.enabled === false) {
                s.status[key] = { status: "disabled" }
                return
              }

              const result = yield* create(key, mcp).pipe(Effect.catch(() => Effect.void))
              if (!result) return

              s.status[key] = result.status
              if (result.mcpClient) {
                s.clients[key] = result.mcpClient
                s.defs[key] = result.defs!
                watch(s, key, result.mcpClient, bridge, mcp.timeout)
              }
            }),
          { concurrency: "unbounded" },
        )

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            yield* Effect.forEach(
              Object.values(s.clients),
              (client) =>
                Effect.gen(function* () {
                  const pid = client.transport instanceof StdioClientTransport ? client.transport.pid : null
                  if (typeof pid === "number") {
                    const pids = yield* descendants(pid)
                    for (const dpid of pids) {
                      try {
                        process.kill(dpid, "SIGTERM")
                      } catch {}
                    }
                  }
                  yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
                }),
              { concurrency: "unbounded" },
            )
            pendingOAuthTransports.clear()
          }),
        )

        // Health-check loop: ping connected servers and auto-reconnect failed
        // ones with exponential backoff, so a dead MCP process is detected and
        // repaired without manual mcp_connect.
        const reconnectAttempts = new Map<string, number>()
        const nextAttemptAt = new Map<string, number>()

        const healthTick = (): Effect.Effect<void> =>
          Effect.gen(function* () {
            const cfgNow = yield* cfgSvc.get()
          const autoreconnect = cfgNow.experimental?.mcp_autoreconnect !== false
          const pingTimeout = Math.min(cfgNow.experimental?.mcp_timeout ?? DEFAULT_TIMEOUT, HEALTH_PING_TIMEOUT_MS)
          const now = Date.now()

          // A dead server must not delay the others: a serial loop costs
          // N x pingTimeout per tick and starves the schedule.
          yield* Effect.forEach(
            Object.entries(s.clients),
            ([name, client]) =>
              s.status[name]?.status !== "connected"
                ? Effect.void
                : Effect.tryPromise(() => pingWithTimeout(client, pingTimeout)).pipe(
                    Effect.catch(() => Effect.succeed(false)),
                    Effect.flatMap((ok) => {
                      if (ok) {
                        delete s.healthFailures[name]
                        return Effect.void
                      }
                      const failures = (s.healthFailures[name] ?? 0) + 1
                      s.healthFailures[name] = failures
                      if (!shouldDisconnectAfterHealthFailures(failures)) return Effect.void
                      return markDisconnected(s, name, client, `health check ping failed ${failures} times`)
                    }),
                  ),
            { concurrency: "unbounded", discard: true },
          )

          if (!autoreconnect) return
          yield* Effect.forEach(
            Object.entries(s.status),
            ([name, st]) =>
              Effect.gen(function* () {
                if (st.status !== "failed" || s.clients[name]) return
                if ((nextAttemptAt.get(name) ?? 0) > now) return
                const attempt = reconnectAttempts.get(name) ?? 0
                const ok = yield* reconnectLock.withPermits(1)(reconnectServer(s, name))
                if (ok) {
                  reconnectAttempts.delete(name)
                  nextAttemptAt.delete(name)
                  return
                }
                reconnectAttempts.set(name, attempt + 1)
                nextAttemptAt.set(
                  name,
                  now + Math.min(RECONNECT_BACKOFF_BASE_MS * 2 ** attempt, RECONNECT_BACKOFF_MAX_MS),
                )
              }),
            { concurrency: "unbounded", discard: true },
          )
        })

        const healthInterval = cfg.experimental?.mcp_health_interval_ms ?? defaultMcpHealthIntervalMs
        if (healthInterval > 0) {
          // Delay the first tick so freshly connected clients are stable before
          // the first ping (avoids a false "failed" right after startup).
          yield* Effect.forkScoped(
            Effect.repeat(
              healthTick().pipe(
                Effect.delay(Duration.millis(healthInterval)),
                Effect.catch(() => Effect.void),
                Effect.catchCause(() => Effect.void),
              ),
              Schedule.fixed(Duration.millis(healthInterval)),
            ),
          )
        }

        return s
      }),
    )

    function closeClient(s: State, name: string) {
      const client = s.clients[name]
      if (s.defs[name]) s.catalogVersion++
      delete s.defs[name]
      if (!client) return Effect.void
      intentionalClose.add(client)
      return Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
    }

    function markDisconnected(s: State, name: string, client: MCPClient, reason: string): Effect.Effect<void> {
      if (s.clients[name] !== client || s.status[name]?.status !== "connected") return Effect.void
      if (intentionalClose.has(client)) return Effect.void
      log.warn("mcp connection lost, marking failed", { name, reason })
      return closeClient(s, name).pipe(
        Effect.flatMap(() =>
          Effect.sync(() => {
            delete s.clients[name]
            s.status[name] = { status: "failed", error: reason }
          }),
        ),
        Effect.flatMap(() => bus.publish(ToolsChanged, { server: name }).pipe(Effect.ignore)),
      )
    }

    const storeClient = Effect.fnUntraced(function* (
      s: State,
      name: string,
      client: MCPClient,
      listed: MCPToolDef[],
      timeout?: number,
    ) {
      const bridge = yield* EffectBridge.make()
      yield* closeClient(s, name)
      s.status[name] = { status: "connected" }
      s.clients[name] = client
      s.defs[name] = listed
      delete s.healthFailures[name]
      s.catalogVersion++
      watch(s, name, client, bridge, timeout)
      return s.status[name]
    })

    const status = Effect.fn("MCP.status")(function* () {
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const result: Record<string, Status> = {}

      for (const [key, mcp] of Object.entries(config)) {
        if (!isMcpConfigured(mcp)) continue
        result[key] = s.status[key] ?? { status: "disabled" }
      }

      return result
    })

    const clients = Effect.fn("MCP.clients")(function* () {
      const s = yield* InstanceState.get(state)
      return s.clients
    })

    const catalogVersion = Effect.fn("MCP.catalogVersion")(function* () {
      const s = yield* InstanceState.get(state)
      return s.catalogVersion
    })

    const createAndStore = Effect.fn("MCP.createAndStore")(function* (name: string, mcp: ConfigMCP.Info) {
      const s = yield* InstanceState.get(state)
      const result = yield* create(name, mcp)
      s.fingerprints[name] = configFingerprint(mcp)

      s.status[name] = result.status
      if (!result.mcpClient) {
        yield* closeClient(s, name)
        delete s.clients[name]
        return result.status
      }

      return yield* storeClient(s, name, result.mcpClient, result.defs!, mcp.timeout)
    })

    const reconnectServer = (s: State, name: string): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        if (s.clients[name] || s.status[name]?.status !== "failed") return false
        const mcp = yield* getMcpConfig(name)
        if (!mcp || mcp.enabled === false) return false
        if (s.fingerprints[name] !== configFingerprint(mcp)) return false

        const result = yield* create(name, mcp)
        if (!result.mcpClient) {
          log.warn("mcp auto-reconnect attempt failed", { name })
          return false
        }
        yield* storeClient(s, name, result.mcpClient, result.defs!, mcp.timeout)
        yield* bus.publish(ToolsChanged, { server: name }).pipe(Effect.ignore)
        log.info("mcp auto-reconnected", { name })
        return true
      })

    const add = Effect.fn("MCP.add")(function* (name: string, mcp: ConfigMCP.Info) {
      yield* createAndStore(name, mcp)
      const s = yield* InstanceState.get(state)
      return { status: s.status }
    })

    const connect = Effect.fn("MCP.connect")(function* (name: string) {
      const mcp = yield* requireMcpConfig(name)
      yield* createAndStore(name, { ...mcp, enabled: true })
    })

    const disconnect = Effect.fn("MCP.disconnect")(function* (name: string) {
      yield* requireMcpConfig(name)
      const s = yield* InstanceState.get(state)
      yield* closeClient(s, name)
      delete s.clients[name]
      s.status[name] = { status: "disabled" }
    })

    // --- Config file watcher for hot-reload ---
    let mcpWatcherCleanup: (() => void) | null = null

    const setupMcpWatchers = Effect.fnUntraced(function* () {
      if (mcpWatcherCleanup) { mcpWatcherCleanup(); mcpWatcherCleanup = null }

      const cfgDirs = yield* cfgSvc.directories()
      const allDirs = [...new Set(cfgDirs)]

      const watchers: fs.FSWatcher[] = []
      const timers = new Map<string, ReturnType<typeof setTimeout>>()
      const bridge = yield* EffectBridge.make()
      const DEBOUNCE_MS = 300

      const handleChange = (fp: string) => {
        if (isConfigFile(fp)) {
          log.info("config file change detected, reloading MCP", { file: fp })
          bridge.promise(reload()).catch((err) => log.error("MCP reload error", { err }))
        }
      }

      for (const dir of allDirs) {
        if (!fs.existsSync(dir)) continue
        try {
          const w = fs.watch(dir, { recursive: false }, (eventType, filename) => {
            if (!filename) return
            const fp = path.join(dir, filename.toString())
            clearTimeout(timers.get(fp))
            timers.set(
              fp,
              setTimeout(() => {
                timers.delete(fp)
                handleChange(fp)
              }, DEBOUNCE_MS),
            )
          })
          watchers.push(w)
        } catch (err) {
          log.warn("cannot watch config directory", { dir, err })
        }
      }

      mcpWatcherCleanup = () => {
        for (const w of watchers) w.close()
        for (const t of timers.values()) clearTimeout(t)
        timers.clear()
      }

      if (allDirs.length > 0) log.info("MCP config watchers active", { dirs: allDirs.length })
    })

    // Initial watcher setup (resilient: InstanceRef may not be available yet)
    yield* setupMcpWatchers().pipe(Effect.catchCause(() => Effect.void))

    const reloadUnsafe = Effect.fn("MCP.reloadUnsafe")(function* () {
      log.info("reloading MCP servers from config")
      const s = yield* InstanceState.get(state)
      yield* cfgSvc.invalidate()
      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}

      // Disconnect servers no longer in config
      for (const name of Object.keys(s.clients)) {
        if (!config[name] || !isMcpConfigured(config[name])) {
          yield* closeClient(s, name)
          delete s.clients[name]
          delete s.defs[name]
          delete s.fingerprints[name]
          s.status[name] = { status: "disabled" }
        }
      }

      // Connect new servers or reconnect changed ones
      for (const [key, mcp] of Object.entries(config)) {
        if (!isMcpConfigured(mcp)) continue
        const fingerprint = configFingerprint(mcp)
        if (mcp.enabled === false) {
          if (s.clients[key]) {
            yield* closeClient(s, key)
            delete s.clients[key]
            delete s.defs[key]
          }
          s.status[key] = { status: "disabled" }
          s.fingerprints[key] = fingerprint
          continue
        }

        const changed = s.fingerprints[key] !== fingerprint
        // Reconnect if not connected or if the effective configuration changed.
        if (!s.clients[key] || changed) {
          const operation = s.clients[key] ? "reconnect" : "connect"
          const startedAt = Date.now()
          log.info(`${operation} started`, { key })
          const result = yield* create(key, mcp).pipe(Effect.catch(() => Effect.void))
          if (result) {
            s.status[key] = result.status
            s.fingerprints[key] = fingerprint
            if (result.mcpClient) {
              const bridge = yield* EffectBridge.make()
              yield* closeClient(s, key)
              s.clients[key] = result.mcpClient
              s.defs[key] = result.defs!
              s.catalogVersion++
              watch(s, key, result.mcpClient, bridge, mcp.timeout)
            } else {
              yield* closeClient(s, key)
              delete s.clients[key]
            }
          }
          log.info(`${operation} complete`, {
            key,
            status: s.status[key]?.status ?? "failed",
            durationMs: Date.now() - startedAt,
          })
        }
      }

      // Re-establish config watchers
      yield* setupMcpWatchers().pipe(Effect.catchCause(() => Effect.void))
      log.info("MCP reload complete")
    })

    const reload = Effect.fn("MCP.reload")(function* () {
      return yield* reloadLock.withPermits(1)(reloadUnsafe())
    })

    const tools = Effect.fn("MCP.tools")(function* () {
      const result: Record<string, Tool> = {}
      const s = yield* InstanceState.get(state)

      const cfg = yield* cfgSvc.get()
      const config = cfg.mcp ?? {}
      const defaultTimeout = cfg.experimental?.mcp_timeout

      const connectedClients = Object.entries(s.clients).filter(
        ([clientName]) => s.status[clientName]?.status === "connected",
      )

      yield* Effect.forEach(
        connectedClients,
        ([clientName, client]) =>
          Effect.gen(function* () {
            const mcpConfig = config[clientName]
            const entry = mcpConfig && isMcpConfigured(mcpConfig) ? mcpConfig : undefined

            const listed = s.defs[clientName]
            if (!listed) {
              log.warn("missing cached tools for connected server", { clientName })
              return
            }

            const timeout = entry?.timeout ?? defaultTimeout
            const bridge = yield* EffectBridge.make()
            for (const mcpTool of listed) {
              result[sanitize(clientName) + "_" + sanitize(mcpTool.name)] = convertMcpTool(
                mcpTool,
                // Re-read from live state so a reconnect is picked up mid-session.
                () => s.clients[clientName],
                (failed, error) =>
                  bridge.promise(
                    reconnectLock.withPermits(1)(
                      markDisconnected(s, clientName, failed, `tool call failed: ${String(error)}`).pipe(
                        Effect.flatMap(() => reconnectServer(s, clientName)),
                        Effect.map(() => s.clients[clientName]),
                      ),
                    ),
                  ),
                timeout,
                clientName,
              )
            }
          }),
        { concurrency: "unbounded" },
      )
      return result
    })

    function collectFromConnected<T extends { name: string }>(
      s: State,
      listFn: (c: Client) => Promise<T[]>,
      label: string,
    ) {
      return Effect.forEach(
        Object.entries(s.clients).filter(([name]) => s.status[name]?.status === "connected"),
        ([clientName, client]) =>
          fetchFromClient(clientName, client, listFn, label).pipe(Effect.map((items) => Object.entries(items ?? {}))),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((results) => Object.fromEntries<T & { client: string }>(results.flat())))
    }

    const prompts = Effect.fn("MCP.prompts")(function* () {
      const s = yield* InstanceState.get(state)
      return yield* collectFromConnected(s, (c) => c.listPrompts().then((r) => r.prompts), "prompts")
    })

    const resources = Effect.fn("MCP.resources")(function* () {
      const s = yield* InstanceState.get(state)
      return yield* collectFromConnected(s, (c) => c.listResources().then((r) => r.resources), "resources")
    })

    const withClient = Effect.fnUntraced(function* <A>(
      clientName: string,
      fn: (client: MCPClient) => Promise<A>,
      label: string,
      meta?: Record<string, unknown>,
    ) {
      const s = yield* InstanceState.get(state)
      const client = s.clients[clientName]
      if (!client) {
        log.warn(`client not found for ${label}`, { clientName })
        return undefined
      }
      return yield* Effect.tryPromise({
        try: () => fn(client),
        catch: (e: any) => {
          log.error(`failed to ${label}`, { clientName, ...meta, error: e?.message })
          return e
        },
      }).pipe(Effect.orElseSucceed(() => undefined))
    })

    const getPrompt = Effect.fn("MCP.getPrompt")(function* (
      clientName: string,
      name: string,
      args?: Record<string, string>,
    ) {
      return yield* withClient(clientName, (client) => client.getPrompt({ name, arguments: args }), "getPrompt", {
        promptName: name,
      })
    })

    const readResource = Effect.fn("MCP.readResource")(function* (clientName: string, resourceUri: string) {
      return yield* withClient(clientName, (client) => client.readResource({ uri: resourceUri }), "readResource", {
        resourceUri,
      })
    })

    const getMcpConfig = Effect.fnUntraced(function* (mcpName: string) {
      const cfg = yield* cfgSvc.get()
      const mcpConfig = cfg.mcp?.[mcpName]
      if (!mcpConfig || !isMcpConfigured(mcpConfig)) return undefined
      return mcpConfig
    })

    const requireMcpConfig = Effect.fnUntraced(function* (mcpName: string) {
      const mcpConfig = yield* getMcpConfig(mcpName)
      if (!mcpConfig) return yield* new NotFoundError({ name: mcpName })
      return mcpConfig
    })

    const startAuth = Effect.fn("MCP.startAuth")(function* (mcpName: string) {
      const mcpConfig = yield* requireMcpConfig(mcpName)
      if (mcpConfig.type !== "remote") throw new Error(`MCP server ${mcpName} is not a remote server`)
      if (mcpConfig.oauth === false) throw new Error(`MCP server ${mcpName} has OAuth explicitly disabled`)
      const url = remoteURL(mcpName, mcpConfig.url)
      if (!url) throw new Error(`Invalid MCP URL for "${mcpName}"`)

      // OAuth config is optional - if not provided, we'll use auto-discovery
      const oauthConfig = typeof mcpConfig.oauth === "object" ? mcpConfig.oauth : undefined

      // Resolve effective redirect URI: explicit redirectUri > callbackPort shorthand > default
      const effectiveRedirectUri =
        oauthConfig?.redirectUri ??
        (oauthConfig?.callbackPort ? `http://127.0.0.1:${oauthConfig.callbackPort}${OAUTH_CALLBACK_PATH}` : undefined)

      // Start the callback server with custom redirectUri if configured
      yield* Effect.promise(() => McpOAuthCallback.ensureRunning(effectiveRedirectUri))

      const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      yield* auth.updateOAuthState(mcpName, oauthState)
      let capturedUrl: URL | undefined
      const authProvider = new McpOAuthProvider(
        mcpName,
        mcpConfig.url,
        {
          clientId: oauthConfig?.clientId,
          clientSecret: oauthConfig?.clientSecret,
          scope: oauthConfig?.scope,
          redirectUri: effectiveRedirectUri,
        },
        {
          onRedirect: async (url) => {
            capturedUrl = url
          },
        },
        auth,
      )

      const transport = new StreamableHTTPClientTransport(url, { authProvider })

      return yield* Effect.tryPromise({
        try: () => {
          const client = new Client({ name: "opencode", version: InstallationVersion })
          return client
            .connect(transport)
            .then(() => ({ authorizationUrl: "", oauthState, client }) satisfies AuthResult)
        },
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) => {
          if (error instanceof UnauthorizedError && capturedUrl) {
            pendingOAuthTransports.set(mcpName, transport)
            return Effect.succeed({ authorizationUrl: capturedUrl.toString(), oauthState } satisfies AuthResult)
          }
          return Effect.die(error)
        }),
      )
    })

    const authenticate = Effect.fn("MCP.authenticate")(function* (mcpName: string) {
      const result = yield* startAuth(mcpName)
      if (!result.authorizationUrl) {
        const client = "client" in result ? result.client : undefined
        const mcpConfig = yield* requireMcpConfig(mcpName).pipe(
          Effect.tapError(() => Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)),
        )

        const listed = client ? yield* defs(mcpName, client, mcpConfig.timeout) : undefined
        if (!client || !listed) {
          yield* Effect.tryPromise(() => client?.close() ?? Promise.resolve()).pipe(Effect.ignore)
          return { status: "failed", error: "Failed to get tools" } as Status
        }

        const s = yield* InstanceState.get(state)
        yield* auth.clearOAuthState(mcpName)
        return yield* storeClient(s, mcpName, client, listed, mcpConfig.timeout)
      }

      log.info("opening browser for oauth", { mcpName, url: result.authorizationUrl, state: result.oauthState })

      const callbackPromise = McpOAuthCallback.waitForCallback(result.oauthState, mcpName)

      yield* Effect.tryPromise(() => open(result.authorizationUrl)).pipe(
        Effect.flatMap((subprocess) =>
          Effect.callback<void, Error>((resume) => {
            const timer = setTimeout(() => resume(Effect.void), 500)
            subprocess.on("error", (err) => {
              clearTimeout(timer)
              resume(Effect.fail(err))
            })
            subprocess.on("exit", (code) => {
              if (code !== null && code !== 0) {
                clearTimeout(timer)
                resume(Effect.fail(new Error(`Browser open failed with exit code ${code}`)))
              }
            })
          }),
        ),
        Effect.catch(() => {
          log.warn("failed to open browser, user must open URL manually", { mcpName })
          return bus.publish(BrowserOpenFailed, { mcpName, url: result.authorizationUrl }).pipe(Effect.ignore)
        }),
      )

      const code = yield* Effect.promise(() => callbackPromise)

      const storedState = yield* auth.getOAuthState(mcpName)
      if (storedState !== result.oauthState) {
        yield* auth.clearOAuthState(mcpName)
        throw new Error("OAuth state mismatch - potential CSRF attack")
      }
      yield* auth.clearOAuthState(mcpName)
      return yield* finishAuth(mcpName, code)
    })

    const finishAuth = Effect.fn("MCP.finishAuth")(function* (mcpName: string, authorizationCode: string) {
      yield* requireMcpConfig(mcpName)
      const transport = pendingOAuthTransports.get(mcpName)
      if (!transport) throw new Error(`No pending OAuth flow for MCP server: ${mcpName}`)

      const result = yield* Effect.tryPromise({
        try: () => transport.finishAuth(authorizationCode).then(() => true as const),
        catch: (error) => {
          log.error("failed to finish oauth", { mcpName, error })
          return error
        },
      }).pipe(Effect.option)

      if (Option.isNone(result)) {
        return { status: "failed", error: "OAuth completion failed" } as Status
      }

      yield* auth.clearCodeVerifier(mcpName)
      pendingOAuthTransports.delete(mcpName)

      const mcpConfig = yield* requireMcpConfig(mcpName)

      return yield* createAndStore(mcpName, mcpConfig)
    })

    const removeAuth = Effect.fn("MCP.removeAuth")(function* (mcpName: string) {
      yield* auth.remove(mcpName)
      McpOAuthCallback.cancelPending(mcpName)
      pendingOAuthTransports.delete(mcpName)
      log.info("removed oauth credentials", { mcpName })
    })

    const supportsOAuth = Effect.fn("MCP.supportsOAuth")(function* (mcpName: string) {
      const mcpConfig = yield* requireMcpConfig(mcpName)
      return mcpConfig.type === "remote" && mcpConfig.oauth !== false
    })

    const hasStoredTokens = Effect.fn("MCP.hasStoredTokens")(function* (mcpName: string) {
      const entry = yield* auth.get(mcpName)
      return !!entry?.tokens
    })

    const getAuthStatus = Effect.fn("MCP.getAuthStatus")(function* (mcpName: string) {
      const entry = yield* auth.get(mcpName)
      if (!entry?.tokens) return "not_authenticated" as AuthStatus
      const expired = yield* auth.isTokenExpired(mcpName)
      return (expired ? "expired" : "authenticated") as AuthStatus
    })

    return Service.of({
      status,
      clients,
      catalogVersion,
      tools,
      prompts,
      resources,
      add,
      connect,
      disconnect,
      reload,
      getPrompt,
      readResource,
      startAuth,
      authenticate,
      finishAuth,
      removeAuth,
      supportsOAuth,
      hasStoredTokens,
      getAuthStatus,
    })
  }),
)

export type AuthStatus = "authenticated" | "expired" | "not_authenticated"

// --- Per-service runtime ---

export const defaultLayer = layer.pipe(
  Layer.provide(McpAuth.layer),
  Layer.provide(Bus.layer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(CrossSpawnSpawner.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
)

export * as MCP from "."
