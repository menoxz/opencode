import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import * as fs from "node:fs"
import * as path from "node:path"
import { handlePendingTriggers } from "./trigger-handler"
import { runIdleAnalysis } from "./idle"

const log = Log.create({ service: "daemon.triggers" })

// ── Trigger store helpers ──────────────────────────────────────────────

function triggerDir(): string {
  // 1. Explicit env var override
  const envDir = process.env.OPENCODE_TRIGGER_DIR
  if (envDir) return envDir

  // 2. Known installation paths (first that exists)
  const knownPaths = [
    "C:\\jeanluc\\mcp-servers\\opencode-trigger",
    path.join(process.env.HOME || process.env.USERPROFILE || "C:\\", ".config", "opencode", "opencode-trigger"),
  ]
  for (const p of knownPaths) {
    if (fs.existsSync(path.join(p, "triggers.json"))) return p
  }

  // 3. Default fallback
  return knownPaths[knownPaths.length - 1]
}

function triggerFile(): string {
  return path.join(triggerDir(), "triggers.json")
}

function hasTriggerStore(): boolean {
  return fs.existsSync(triggerFile())
}

function readPendingTriggers(): Array<{ id: string; source: string; payload: unknown; received_at: string }> {
  const raw = fs.readFileSync(triggerFile(), "utf-8")
  const triggers = JSON.parse(raw) as Array<{ acked: boolean } & Record<string, unknown>>
  return triggers.filter((t) => !t.acked) as any
}

function writeAck(triggerId: string): boolean {
  const file = triggerFile()
  const raw = fs.readFileSync(file, "utf-8")
  const triggers = JSON.parse(raw) as Array<{ id: string; acked: boolean; acked_at: string | null }>
  let found = false
  for (const t of triggers) {
    if (t.id === triggerId && !t.acked) {
      t.acked = true
      t.acked_at = new Date().toISOString()
      found = true
      break
    }
  }
  if (found) fs.writeFileSync(file, JSON.stringify(triggers, null, 2))
  return found
}

// ── Periodic tasks ─────────────────────────────────────────────────────

/**
 * Check for pending triggers from the opencode-trigger server.
 * Reads the shared triggers.json file and logs any pending triggers.
 */
export const checkTriggers = Effect.fnUntraced(function* () {
  try {
    if (!hasTriggerStore()) {
      log.info("Trigger store not found — start opencode-trigger first (python server.py --daemon)")
      return
    }

    const pending = readPendingTriggers()
    if (pending.length === 0) {
      log.info("No pending triggers — running idle analysis")
      yield* runIdleAnalysis()
      return
    }

    log.info("Pending triggers detected", { count: pending.length })

    yield* handlePendingTriggers(pending)
  } catch (error) {
    log.error("checkTriggers failed", { error })
  }
})

/**
 * Acknowledge a specific trigger as processed.
 */
export const ackTrigger = Effect.fnUntraced(function* (triggerId: string) {
  try {
    if (!hasTriggerStore()) {
      log.warn("Cannot ack trigger — trigger store not found")
      return false
    }
    const ok = writeAck(triggerId)
    if (ok) log.info("Trigger acknowledged", { id: triggerId })
    else log.warn("Trigger not found or already acked", { id: triggerId })
    return ok
  } catch (error) {
    log.error("ackTrigger failed", { error })
    return false
  }
})

/**
 * Periodic memory consolidation — defers to the memory tool which is
 * only available during agent sessions. Logs intent and leaves actual
 * consolidation to the next agent session.
 */
export const memoryConsolidate = Effect.fnUntraced(function* () {
  log.info("Memory consolidation: deferred to next agent session")
})

/**
 * Periodic tunnel / trigger-server health check.
 * Pings the opencode-trigger HTTP endpoint on localhost:8645.
 */
export const tunnelHealthCheck = Effect.fnUntraced(function* () {
  const healthUrl = process.env.OPENCODE_TRIGGER_URL ?? "http://localhost:8645/health"
  log.info("Running tunnel health check...", { url: healthUrl })

  try {
    const result = yield* Effect.promise(() =>
      fetch(healthUrl).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Record<string, unknown>>
      }),
    )

    log.info("Trigger server healthy", { http_port: result.http_port, triggers: result.triggers })
  } catch (error) {
    log.warn("Trigger server not reachable — daemon mode may need opencode-trigger running", { error })
  }
})

export * as TriggerChecker from "."
