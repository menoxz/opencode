/**
 * QA guardrails: configurable budgets, browser circuit-breaker, tool scope,
 * and finish diagnostics for long autonomous verification runs.
 *
 * Observed failure mode (session ses_f5c9cd965ffeGOXsrEr2Ce03Fh): 218 assistant
 * turns, 363 tool calls, cost 37.63, 8.5M input tokens, 13 tool errors including
 * six ~60s screenshot timeouts, and one silent zero-token `finish=unknown`.
 * Budgets stay opt-in (no implicit ceiling) but, once configured, stop the run
 * with an observable reason instead of drifting.
 */

export interface QaBudget {
  /** Maximum assistant steps before forcing a text-only stop. */
  steps?: number
  /** Maximum wall-clock minutes for the run. */
  budgetMinutes?: number
  /** Maximum accumulated session cost before stopping. */
  maxCost?: number
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

function envNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  if (!(key in env)) return undefined
  const raw = Number(env[key])
  return positive(raw)
}

/**
 * Resolve the effective QA budget. Explicit agent config wins; environment
 * provides a configurable ceiling; nothing configured means unbounded
 * (matching the existing opt-in step-budget contract).
 */
export function resolveQaBudget(
  agent: { steps?: number; budgetMinutes?: number; maxCost?: number },
  env: NodeJS.ProcessEnv = process.env,
): QaBudget {
  const steps = positive(agent.steps) ?? envNumber(env, "OPENCODE_QA_STEPS")
  const budgetMinutes =
    positive(agent.budgetMinutes) ?? envNumber(env, "OPENCODE_QA_BUDGET_MINUTES") ?? envNumber(env, "OPENCODE_TASK_BUDGET_MINUTES")
  const maxCost = positive(agent.maxCost) ?? envNumber(env, "OPENCODE_QA_MAX_COST")
  return {
    ...(steps !== undefined ? { steps } : {}),
    ...(budgetMinutes !== undefined ? { budgetMinutes } : {}),
    ...(maxCost !== undefined ? { maxCost } : {}),
  }
}

export type QaStopReason = "step-limit" | "wall-clock" | "cost-limit"

export interface QaBudgetState {
  step: number
  steps?: number
  startedAt?: number
  now?: number
  budgetMinutes?: number
  cost?: number
  maxCost?: number
}

export interface QaBudgetVerdict {
  stopped: boolean
  reason?: QaStopReason
  detail: string
}

/** Check configured budgets; a stop always carries an observable reason. */
export function checkQaBudgets(state: QaBudgetState): QaBudgetVerdict {
  if (state.steps !== undefined && state.step >= state.steps) {
    return {
      stopped: true,
      reason: "step-limit",
      detail: `QA step budget reached: step ${state.step} of ${state.steps}.`,
    }
  }
  if (
    state.budgetMinutes !== undefined &&
    state.startedAt !== undefined &&
    state.now !== undefined &&
    state.now - state.startedAt >= state.budgetMinutes * 60_000
  ) {
    return {
      stopped: true,
      reason: "wall-clock",
      detail: `QA time budget reached: ${state.budgetMinutes} minutes elapsed.`,
    }
  }
  if (state.maxCost !== undefined && (state.cost ?? 0) >= state.maxCost) {
    return {
      stopped: true,
      reason: "cost-limit",
      detail: `QA cost budget reached: ${state.cost ?? 0} >= ${state.maxCost}.`,
    }
  }
  return { stopped: false, detail: "QA budgets not reached." }
}

/** Browser-interaction tools observed looping in the QA audit. */
export const BROWSER_TOOL_IDS = [
  "take_snapshot",
  "take_screenshot",
  "click",
  "list_console_messages",
  "list_network_requests",
  "evaluate_script",
] as const

export type BrowserToolID = (typeof BROWSER_TOOL_IDS)[number]

const BROWSER_TOOLS = new Set<string>(BROWSER_TOOL_IDS)

/** Default read-only + browser scope for a verification subagent. */
export const QA_DEFAULT_TOOLS = [
  "read",
  "glob",
  "grep",
  "session_info",
  ...BROWSER_TOOL_IDS,
] as const

const QA_DEFAULT_SCOPE = new Set<string>(QA_DEFAULT_TOOLS)

export function isQaToolAllowed(tool: string): boolean {
  return QA_DEFAULT_SCOPE.has(tool)
}

export interface BrowserAttempt {
  tool: string
  ok: boolean
  timeout: boolean
  at: number
}

export interface BrowserCircuitState {
  consecutiveTimeouts: number
  lastTool?: string
  trippedAt?: number
}

const CIRCUIT_TIMEOUT_LIMIT = 3

export const browserCircuit = {
  init(): BrowserCircuitState {
    return { consecutiveTimeouts: 0 }
  },
  record(state: BrowserCircuitState, attempt: BrowserAttempt): BrowserCircuitState {
    if (!BROWSER_TOOLS.has(attempt.tool)) return state
    if (attempt.timeout || !attempt.ok) {
      const consecutiveTimeouts = attempt.timeout ? state.consecutiveTimeouts + 1 : state.consecutiveTimeouts
      return {
        consecutiveTimeouts,
        lastTool: attempt.tool,
        ...(consecutiveTimeouts >= CIRCUIT_TIMEOUT_LIMIT ? { trippedAt: attempt.at } : {}),
      }
    }
    return { consecutiveTimeouts: 0, lastTool: attempt.tool }
  },
  tripped(state: BrowserCircuitState): boolean {
    return state.consecutiveTimeouts >= CIRCUIT_TIMEOUT_LIMIT
  },
  reason(state: BrowserCircuitState): string {
    if (!browserCircuit.tripped(state)) return ""
    return `Browser circuit open after ${state.consecutiveTimeouts} consecutive timeouts (last: ${state.lastTool ?? "unknown"}). Pause browser tools, report state, and continue verification without screenshots.`
  },
}

export interface FinishSample {
  finish: string | undefined
  input: number
  output: number
  cost: number
  durationMs: number
}

/**
 * Diagnose a provider finish reason. Normal `tool-calls` stays quiet;
 * a zero-token `unknown` (observed once in the audit) must surface a
 * diagnostic instead of passing silently.
 */
export function diagnoseFinish(sample: FinishSample): string {
  if (sample.finish === "tool-calls") return ""
  if (sample.finish === "unknown" && sample.input === 0 && sample.output === 0) {
    return `Provider returned finish=unknown with zero tokens after ${sample.durationMs}ms: treat as transport anomaly, not completion. Retry the step once, then stop with reason provider-unknown.`
  }
  return ""
}

export * as QaGuardrails from "./qa-guardrails"
