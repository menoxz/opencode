import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import * as fs from "node:fs"
import * as path from "node:path"
import { handlePendingTriggers, listPendingTasks, writeTask } from "./trigger-handler"
import { runIdleAnalysis } from "./idle"
import { processNextTask, isExecutorBusy } from "./auto-executor"
import { Eval } from "@/eval"
import * as MemoryStore from "@/memory/store"
import * as PatternDetector from "@/memory/patterns"
import { persistLearningArtifacts } from "./learning-artifacts"

const log = Log.create({ service: "daemon.triggers" })

// ── Trigger store helpers ──────────────────────────────────────────────

function triggerDir(): string {
  // 1. Explicit env var override
  const envDir = process.env.OPENCODE_TRIGGER_DIR
  if (envDir) return envDir

  // 2. Known installation paths (first that exists)
  const knownPaths = [
    "C:\\jeanluc\\mcp-servers\\opencode-trigger",
    path.join(process.env.HOME || process.env.USERPROFILE || "C:\\", ".config", "opencodev2", "opencode-trigger"),
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
 * Periodic memory consolidation — runs decay, prune, and merge on the
 * native memory store via MemoryStore (no Session dependency needed).
 */
export const memoryConsolidate = Effect.fnUntraced(function* () {
  log.info("Running memory consolidation via MemoryStore...")
  try {
    const store = yield* MemoryStore.Service
    const { consolidate } = yield* Effect.promise(() => import("@/memory/consolidation"))
    const stats = yield* consolidate(store as any, false)
    log.info("Consolidation complete", {
      decayed: stats.decayed, pruned: stats.pruned, merged: stats.merged,
      remainingAfter: stats.remainingAfter,
    })
  } catch (err) {
    log.warn("Memory consolidation skipped", { error: String(err) })
  }

  // 'REM' synthesis pass — offline generalisation of episodic clusters into
  // semantic memories. Opt-in (experimental.memory.synthesis), free-model only,
  // fail-safe. Isolated from consolidation: its failure never affects the above.
  try {
    const { runSynthesis } = yield* Effect.promise(() => import("@/memory/synthesis-runner"))
    yield* runSynthesis(false)
  } catch (err) {
    log.warn("Memory synthesis skipped", { error: String(err) })
  }
})

/**
 * Periodic pattern detection — via MemoryStore directly.
 */
export const detectPatterns = Effect.fnUntraced(function* () {
  log.info("Running pattern detection via MemoryStore...")
  try {
    const store = yield* MemoryStore.Service
    const patterns = yield* PatternDetector.Service
    const report = yield* patterns.detect(30)
    const persisted = persistLearningArtifacts(report)
    if (report.recurringPatterns.length > 0 || report.antiPatterns.length > 0) {
      log.info("Patterns detected", {
        patterns: report.recurringPatterns.length,
        antiPatterns: report.antiPatterns.length,
        successPatterns: report.successPatterns.length,
        reportFile: persisted.reportFile,
        candidatesCreated: persisted.candidatesCreated,
        candidatesUpdated: persisted.candidatesUpdated,
      })
    }
  } catch (err) {
    log.warn("Pattern detection skipped", { error: String(err) })
  }
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

/**
 * Process the next queued task autonomously.
 * Called periodically by the daemon scheduler (every 5m).
 *
 * Only processes one task at a time (sequential).
 * If the executor is already busy, this is a no-op.
 */
export const processQueue = Effect.fnUntraced(function* () {
  if (isExecutorBusy()) {
    log.info("processQueue: executor busy, skipping")
    return
  }

  const pending = listPendingTasks()
  if (pending.length === 0) {
    // No pending tasks — that's fine, idle analysis already covers this case
    return
  }

  log.info("processQueue: attempting auto-execution", { pendingCount: pending.length })
  const result = yield* processNextTask()
  log.info("processQueue: result", { result })
})

/**
 * Periodic sanity eval — runs the sanity suite and checks for regression.
 * Requires Eval.Service to be in the Effect context (provided by AppRuntime).
 */
export const runSanityEval = Effect.fnUntraced(function* () {
  log.info("Running auto sanity eval...")
  try {
    const evalSvc = yield* Eval.Service
    // Gated REAL runner: default stays simulated; OPENCODE_DAEMON_EVAL_REAL=1 → real headless sessions.
    const real = process.env.OPENCODE_DAEMON_EVAL_REAL === "1"
    if (real) log.info("sanity eval: REAL runner enabled (OPENCODE_DAEMON_EVAL_REAL=1)")
    const report = yield* evalSvc.runSuite("sanity", real ? { mode: "real" } : undefined)

    // A simulated run executes no agent and therefore verifies nothing. Comparing
    // its pass rate to a baseline would report a permanent phantom regression and
    // enqueue an investigation task every hour. Say the truth once instead.
    if (report.scenarios.every((sc) => sc.verdict === "unverified")) {
      log.warn("sanity eval verified nothing: simulated mode runs no agent", {
        scenarios: report.totalScenarios,
        hint: "set OPENCODE_DAEMON_EVAL_REAL=1 to actually exercise the agent",
      })
      return
    }

    const baselineOpt = yield* Effect.option(evalSvc.getBaseline("sanity"))
    if (baselineOpt._tag === "Some") {
      const bl = baselineOpt.value
      if (bl) {
        const regressionOpt = yield* Effect.option(evalSvc.compareToBaseline(report))
        if (regressionOpt._tag === "Some") {
          const reg = regressionOpt.value
          if (reg && reg.major) {
            log.warn("REGRESSION DETECTED in sanity suite!", {
              passRate: `${(report.passRate * 100).toFixed(0)}%`,
              baselinePassRate: `${(bl.passRate * 100).toFixed(0)}%`,
              details: reg.details,
            })

            // PROPOSE: enqueue an investigation task. Idempotent — one stable
            // id means an unresolved regression won't spam the queue.
            const taskId = "eval-regression-sanity"
            const exists = listPendingTasks().some((t) => t.triggerId === taskId)
            if (!exists) {
              const failing = reg.details.newFailures
              writeTask({
                id: taskId,
                source: "eval-regression",
                payload: {
                  objective: "Investigate sanity eval regression",
                  suite: "sanity",
                  passRate: report.passRate,
                  baselinePassRate: bl.passRate,
                  failingScenarios: failing,
                  details: reg.details,
                },
              })
              log.info("PROPOSE: enqueued eval-regression task", { taskId, failing: failing.length })
            }
          }
        }
      }
    }

    log.info("Auto eval complete", { passRate: `${(report.passRate * 100).toFixed(1)}%` })
  } catch (error) {
    log.error("runSanityEval failed", { error })
  }
})

export * as TriggerChecker from "."
