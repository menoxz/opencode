import { Effect, Option, Schema } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import * as Log from "@opencode-ai/core/util/log"
import { MCP } from "@/mcp"

const log = Log.create({ service: "daemon.mcp-control" })

// ── Command file location ────────────────────────────────────────────────

export function commandsDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || process.env.USERPROFILE || "C:\\", ".opencode")
  return path.join(base, "opencodev2")
}

export function commandsFile(): string {
  return path.join(commandsDir(), "mcp-commands.json")
}

// ── Command schema ───────────────────────────────────────────────────────

export class MCPCommand extends Schema.Class<MCPCommand>("MCPCommand")({
  id: Schema.String,
  action: Schema.Union([
    Schema.Literal("connect"),
    Schema.Literal("disconnect"),
    Schema.Literal("reload"),
    Schema.Literal("restart"),
    Schema.Literal("list"),
  ]),
  name: Schema.optional(Schema.String),
  status: Schema.Union([
    Schema.Literal("pending"),
    Schema.Literal("running"),
    Schema.Literal("completed"),
    Schema.Literal("error"),
  ]),
  result: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  created_at: Schema.String,
  completed_at: Schema.optional(Schema.String),
}) {}

// ── Read / write helpers ─────────────────────────────────────────────────

function readCommands(): Array<Record<string, unknown>> {
  const file = commandsFile()
  if (!fs.existsSync(file)) return []
  try {
    const raw = fs.readFileSync(file, "utf-8")
    return JSON.parse(raw) as Array<Record<string, unknown>>
  } catch {
    return []
  }
}

function writeCommands(commands: Array<Record<string, unknown>>): void {
  const dir = commandsDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(commandsFile(), JSON.stringify(commands, null, 2))
}

/**
 * Merge updated commands back into the current file state.
 * Re-reads the file before writing to avoid overwriting concurrently-added commands.
 */
function mergeAndWrite(updated: Array<Record<string, unknown>>): void {
  const current = readCommands()
  const updatedIds = new Set(updated.map((c) => String(c.id)))

  // Keep commands from the current file that weren't in our update batch
  const merged = [
    ...current.filter((c) => !updatedIds.has(String(c.id))),
    ...updated,
  ]

  writeCommands(merged)
}

// ── Execute a single command ─────────────────────────────────────────────

/**
 * Execute a single MCP command and return a tagged result.
 * Wraps the outcome in `{ _tag: "ok"; value }` or `{ _tag: "error"; error }`.
 */
const executeCommand = Effect.fnUntraced(function* (cmd: MCPCommand) {
  const mcp = yield* MCP.Service
  log.info("executing MCP command", { id: cmd.id, action: cmd.action, name: cmd.name ?? "(global)" })

  if (cmd.action === "connect") {
    if (!cmd.name) return { _tag: "error" as const, error: "Missing 'name' for connect command" }
    yield* mcp.connect(cmd.name)
    return { _tag: "ok" as const, value: "Connected" }
  }
  if (cmd.action === "disconnect") {
    if (!cmd.name) return { _tag: "error" as const, error: "Missing 'name' for disconnect command" }
    yield* mcp.disconnect(cmd.name)
    return { _tag: "ok" as const, value: "Disconnected" }
  }
  if (cmd.action === "reload") {
    yield* mcp.reload()
    return { _tag: "ok" as const, value: "Reloaded" }
  }
  if (cmd.action === "restart") {
    if (!cmd.name) return { _tag: "error" as const, error: "Missing 'name' for restart command" }
    yield* mcp.disconnect(cmd.name)
    yield* mcp.connect(cmd.name)
    return { _tag: "ok" as const, value: "Restarted" }
  }
  if (cmd.action === "list") {
    const status = yield* mcp.status()
    return { _tag: "ok" as const, value: JSON.stringify(status, null, 2) }
  }

  return { _tag: "error" as const, error: `Unknown action: ${(cmd as any).action}` }
})

/**
 * Call executeCommand and catch any Effect failure, returning the same tagged-union shape.
 */
const safeExecuteCommand = Effect.fnUntraced(function* (cmd: MCPCommand) {
  const opt = yield* executeCommand(cmd).pipe(Effect.option)
  if (Option.isNone(opt)) {
    return { _tag: "error" as const, error: "Command failed (see daemon logs for details)" }
  }
  return opt.value
})

// ── Main task: process all pending commands ──────────────────────────────

export const processMCPCommands = Effect.fnUntraced(function* () {
  const file = commandsFile()
  if (!fs.existsSync(file)) {
    return
  }

  const commands = readCommands()
  const pending = commands.filter((c) => c.status === "pending")

  if (pending.length === 0) return

  log.info("processing MCP commands", { count: pending.length })

  for (const raw of pending) {
    const cmd = raw as unknown as MCPCommand

    // Mark as running
    mergeAndWrite([{ ...cmd, status: "running" }])

    const outcome = yield* safeExecuteCommand(cmd)

    if (outcome._tag === "error") {
      mergeAndWrite([{ ...cmd, status: "error", error: outcome.error, completed_at: new Date().toISOString() }])
      log.warn("MCP command failed", { id: cmd.id, action: cmd.action, name: cmd.name, error: outcome.error })
    } else {
      mergeAndWrite([{ ...cmd, status: "completed", result: outcome.value, completed_at: new Date().toISOString() }])
      log.info("MCP command completed", { id: cmd.id, action: cmd.action, name: cmd.name })
    }
  }
})

export * as MCPControl from "."
