// schedule.ts - wake the agent on a plan: once / interval / cron / event triggers.
//
// Placement: this file is a plugin. It must NOT be auto-discovered from a project
// `.opencode/plugin/` directory on this fork (project plugins are ignored by design);
// declare it explicitly in the global config (~/.config/opencodev2/opencode.jsonc):
//
//   "plugin": [["file:///C:/jeanluc/opencode-fork/.opencode/plugin/schedule.ts", { "enabled": true }]]
//
// Disable without touching any code: flip "enabled" to false (or remove the config entry).
// Spec: specs/schedule-plugin.md. Pure logic + unit tests: schedule-lib.ts.
//
// Components this file talks to:
//   - plugin host: `event` hook in (bus events), `tool` hook out (tool `schedule`)
//   - opencode server, through the SDK client given by the plugin host:
//     session.create + session.prompt = the actual wake
//   - shared store on disk (schedules.json, runs.jsonl, owner.json): durable plans,
//     run journal and the multi-process wake-loop lock
//
// Absolutely no file left behind on disk is required for the fork itself: this is a
// plugin, removable from config with zero harness edits.

import os from "node:os"
import { tool, type Hooks, type PluginInput } from "@opencode-ai/plugin"
import {
  DEFAULTS,
  STORE_VERSION,
  acquireLock,
  appendRun,
  computeNextAt,
  createSchedule,
  describeSchedule,
  dueSchedules,
  errorText,
  eventSessionID,
  findSchedule,
  formatList,
  formatSchedule,
  isDue,
  loadStore,
  matchEvent,
  normalizeOptions,
  refreshLock,
  releaseLock,
  saveStore,
  tailRuns,
  wake,
  type CreateInput,
  type LockInfo,
  type Schedule,
  type ScheduleOptions,
  type StoreShape,
  type WakeClient,
} from "./schedule-lib.js"

type Source = "tick" | "event" | "manual"
type QueueEntry = { id: string; source: Source }

type State = {
  options: ScheduleOptions
  client: WakeClient
  directory: string
  worktree: string
  store: StoreShape
  queue: QueueEntry[]
  timer: ReturnType<typeof setTimeout> | undefined
  heartbeat: ReturnType<typeof setInterval> | undefined
  owner: boolean
  pumping: boolean
  disposed: boolean
  refreshedAt: number
  selfSessions: Set<string>
  dispose(reason: string): void
}

const GLOBAL_KEY = "__opencodeSchedulePluginState"

// Set OPENCODE_SCHEDULE_DEBUG=1 to trace event delivery and firing decisions on stderr.
const DEBUG = process.env.OPENCODE_SCHEDULE_DEBUG === "1"
function dbg(...args: unknown[]): void {
  if (DEBUG) console.error("[schedule:dbg]", ...args)
}

// ---- Small runtime helpers ----

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: any) {
    // EPERM = exists but not owned by us: still alive.
    return error?.code === "EPERM"
  }
}

function lockInfo(): LockInfo {
  return { pid: process.pid, startedAt: Date.now(), host: os.hostname() }
}

// staleMs = 20 ticks (min 5 min): an owner that stopped heartbeating that long loses the lock.
// The heartbeat runs every DEFAULTS.lockHeartbeatMs (30s), independent of the tick loop,
// so a long-running wake cannot let its own lock expire.
function staleMsFor(options: ScheduleOptions): number {
  return Math.max(300_000, options.tickSeconds * 20_000)
}

function enqueue(state: State, entry: QueueEntry): void {
  // One pending entry per schedule is enough: a schedule has a single trigger kind,
  // so id alone dedupes without dropping distinct runs.
  if (state.queue.some((q) => q.id === entry.id)) return
  state.queue.push(entry)
}

// ---- Fire: the wake itself ----

async function fireOne(state: State, sched: Schedule, source: Source): Promise<void> {
  const now = Date.now()
  const target: Schedule = { ...sched }
  if (!target.agent && state.options.defaultAgent) target.agent = state.options.defaultAgent

  // Claim the due instant BEFORE waking: reload the shared store, consume the run and
  // recompute nextAt, then persist. A second process (or a re-instantiated plugin) that
  // reads the store after this sees the run consumed and will not fire again. A crash
  // mid-wake still consumes the run, matching the documented at-least-once policy.
  let claimed = false
  try {
    const fresh = await loadStore(state.options.storeDir)
    const entry = fresh.schedules.find((s) => s.id === sched.id)
    if (entry) {
      // Re-check the event cooldown at FIRE time, not only at enqueue time: while a slow wake
      // is in flight a second event can already sit in the queue, and enqueue-time matching
      // alone would let it through (observed: two fires 2s apart with a 5s cooldown).
      if (source === "event" && entry.trigger.type === "event") {
        const cooldown = entry.trigger.cooldownMs ?? DEFAULTS.eventCooldownMs
        if (cooldown > 0 && entry.lastEventAt !== undefined && now - entry.lastEventAt < cooldown) return
      }
      entry.runs += 1
      entry.lastRunAt = now
      entry.lastStatus = "running"
      entry.lastError = undefined
      if (source === "event") entry.lastEventAt = now
      entry.updatedAt = now
      entry.nextAt = computeNextAt(entry, now)
      await saveStore(state.options.storeDir, fresh)
      claimed = true
    }
    state.store = fresh
  } catch (error) {
    console.error("[schedule] claim failed for", sched.id, errorText(error))
  }
  if (!claimed) return

  let sessionID: string | undefined
  let status: "ok" | "error" = "ok"
  let detail: string | undefined
  try {
    const result = await wake(state.client, target)
    sessionID = result.sessionID
    if (result.created) {
      state.selfSessions.add(result.sessionID)
      if (state.selfSessions.size > 200) {
        const oldest = state.selfSessions.values().next().value
        if (oldest) state.selfSessions.delete(oldest)
      }
    }
  } catch (error) {
    status = "error"
    detail = errorText(error)
    console.error("[schedule] wake failed for", sched.id, detail)
  }

  try {
    const fresh = await loadStore(state.options.storeDir)
    const entry = fresh.schedules.find((s) => s.id === sched.id)
    if (entry) {
      entry.lastStatus = status
      entry.lastError = detail
      if (status === "ok" && sessionID && !entry.freshSession) entry.sessionID = sessionID
      entry.updatedAt = Date.now()
      await saveStore(state.options.storeDir, fresh)
    }
    state.store = fresh
  } catch (error) {
    console.error("[schedule] store update failed for", sched.id, errorText(error))
  }
  await appendRun(state.options.storeDir, {
    ts: now,
    id: sched.id,
    name: sched.name,
    status,
    sessionID,
    detail,
  }).catch(() => {})
}

// ---- Queue pump: sequential wakes, one at a time ----

async function pump(state: State): Promise<void> {
  if (state.pumping) return
  state.pumping = true
  try {
    while (state.queue.length > 0 && !state.disposed) {
      const entry = state.queue.shift()!
      let fresh: StoreShape
      try {
        fresh = await loadStore(state.options.storeDir)
      } catch {
        continue
      }
      state.store = fresh
      const sched = fresh.schedules.find((s) => s.id === entry.id)
      if (!sched) {
        dbg("pump skip: schedule gone", entry.id)
        continue
      }
      if (!sched.enabled && entry.source !== "manual") {
        dbg("pump skip: disabled", entry.id)
        continue
      }
      const now = Date.now()
      if (entry.source === "event") {
        const maxReached = sched.maxRuns !== undefined && sched.runs >= sched.maxRuns
        const expired = sched.expiresAt !== undefined && now > sched.expiresAt
        if (maxReached || expired) continue
      } else if (entry.source === "tick" && !isDue(sched, now)) {
        continue
      }
      await fireOne(state, sched, entry.source)
    }
  } finally {
    state.pumping = false
  }
}

// ---- Tick: lock ownership + due scan, then reschedule ----

async function tick(state: State): Promise<void> {
  if (state.disposed) return
  try {
    const now = Date.now()
    if (state.owner) {
      const kept = await refreshLock(state.options.storeDir, lockInfo())
      if (!kept) state.owner = false
    } else {
      const decision = await acquireLock(state.options.storeDir, lockInfo(), now, alive, staleMsFor(state.options))
      if (decision === "owner") {
        state.owner = true
        console.error("[schedule] wake-loop owner acquired by pid " + process.pid)
      }
    }
    const fresh = await loadStore(state.options.storeDir)
    state.store = fresh
    state.refreshedAt = now
    if (state.owner) {
      // Self-heal: an enabled time-based schedule must always carry a nextAt. A store entry
      // written by hand, by a tool, or by an older version may lack it, which would otherwise
      // leave the schedule alive but never due.
      let repaired = false
      for (const s of fresh.schedules) {
        if (!s.enabled || s.trigger.type === "event") continue
        if (s.nextAt !== undefined) continue
        if (s.maxRuns !== undefined && s.runs >= s.maxRuns) continue
        if (s.expiresAt !== undefined && now > s.expiresAt) continue
        const next = computeNextAt(s, now)
        s.nextAt = next
        s.updatedAt = now
        if (next !== undefined) repaired = true
      }
      if (repaired) await saveStore(state.options.storeDir, fresh)
      for (const s of dueSchedules(fresh, now)) enqueue(state, { id: s.id, source: "tick" })
    }
    await pump(state)
  } catch (error) {
    console.error("[schedule] tick failed:", errorText(error))
  } finally {
    scheduleNext(state)
  }
}

function scheduleNext(state: State): void {
  if (state.disposed) return
  const timer = setTimeout(() => void tick(state), Math.max(1, state.options.tickSeconds) * 1000)
  ;(timer as any).unref?.()
  state.timer = timer
}

// ---- Event triggers: bus events observed by this process ----
// Not owner-gated on purpose: bus events are process-local, so the process that
// observed the event is the only one that can honor it.

async function handleEvent(state: State, event: { type?: string; properties?: any }): Promise<void> {
  if (state.disposed) {
    dbg("event dropped: state disposed", event?.type)
    return
  }
  if (!state.options.allowEvents) {
    dbg("event dropped: allowEvents=false", event?.type)
    return
  }
  dbg("bus event", event?.type)
  const now = Date.now()
  // Read the current store before matching: an event can arrive immediately after the
  // store changed on disk (tool action, another process, external edit), and the tick's
  // periodic refresh would otherwise leave a just-created event schedule unseen.
  try {
    state.store = await loadStore(state.options.storeDir)
    state.refreshedAt = now
    dbg("event store reloaded:", state.store.schedules.length, "schedules")
  } catch (error) {
    console.error("[schedule] store reload failed on event:", errorText(error))
    return
  }
  let found = false
  for (const s of state.store.schedules) {
    if (s.trigger.type !== "event") continue
    // Feedback-loop guard: a session the plugin just created for a wake must not count as
    // an external `session.created`, otherwise the schedule would wake itself forever.
    if (s.trigger.event === "session.created") {
      const sid = eventSessionID(event)
      if (sid && state.selfSessions.has(sid)) {
        state.selfSessions.delete(sid)
        continue
      }
    }
    if (!matchEvent(s, event, now)) {
      dbg("no match for", s.id, "trigger=event:", String(s.trigger.event))
      continue
    }
    dbg("matched", s.id, "on", event?.type)
    enqueue(state, { id: s.id, source: "event" })
    found = true
  }
  if (found) void pump(state)
}

// ---- Tool: agent-facing surface ----

const ACTIONS = ["create", "list", "get", "pause", "resume", "delete", "history", "run"] as const

type ToolArgs = {
  action: string
  id?: string
  name?: string
  prompt?: string
  after?: string
  every?: string
  firstAt?: string
  cron?: string
  on?: string
  where?: unknown
  cooldown?: string
  agent?: string
  model?: string
  sessionID?: string
  freshSession?: boolean
  maxRuns?: number
  expiresIn?: string
}

function toolError(action: string, message: string) {
  return { title: `schedule ${action}`, output: `error: ${message}` }
}

async function executeTool(
  state: State,
  args: ToolArgs,
  context: { sessionID: string },
): Promise<{ title: string; output: string }> {
  if (!ACTIONS.includes(args.action as (typeof ACTIONS)[number])) {
    return toolError(args.action, `unknown action; use one of: ${ACTIONS.join(", ")}`)
  }
  try {
    return await runAction(state, args, context)
  } catch (error) {
    return toolError(args.action, errorText(error))
  }
}

async function runAction(
  state: State,
  args: ToolArgs,
  context: { sessionID: string },
): Promise<{ title: string; output: string }> {
  const now = Date.now()
  const dir = state.options.storeDir
  switch (args.action) {
    case "create": {
      const store = await reload(state)
      if (store.schedules.length >= state.options.maxSchedules) {
        return toolError(args.action, `limit reached: ${state.options.maxSchedules} schedules`)
      }
      if (args.on !== undefined && !state.options.allowEvents) {
        return toolError(args.action, "event triggers are disabled (allowEvents: false)")
      }
      const input: CreateInput = {
        name: args.name,
        prompt: args.prompt ?? "",
        after: args.after,
        every: args.every,
        firstAt: args.firstAt,
        cron: args.cron,
        on: args.on,
        where: args.where as Record<string, unknown> | undefined,
        cooldown: args.cooldown,
        agent: args.agent ?? state.options.defaultAgent,
        model: args.model,
        sessionID: args.sessionID ?? context.sessionID,
        freshSession: args.freshSession,
        maxRuns: args.maxRuns,
        expiresIn: args.expiresIn,
      }
      const created = createSchedule(store, input, now)
      if (!created.ok) return toolError(args.action, created.error)
      await persist(state, store)
      return { title: `schedule create: ${created.schedule.id}`, output: formatSchedule(created.schedule, now) }
    }
    case "list": {
      const store = await reload(state)
      return { title: "schedule list", output: formatList(store, now) }
    }
    case "get": {
      if (!args.id) return toolError(args.action, "id is required")
      const store = await reload(state)
      const found = findSchedule(store.schedules, args.id)
      if (!found.ok) return toolError(args.action, found.error)
      const runs = await tailRuns(dir, found.schedule.id, 5)
      return { title: `schedule get: ${found.schedule.id}`, output: describeSchedule(found.schedule, runs, now) }
    }
    case "pause":
    case "resume": {
      if (!args.id) return toolError(args.action, "id is required")
      const store = await reload(state)
      const found = findSchedule(store.schedules, args.id)
      if (!found.ok) return toolError(args.action, found.error)
      const enabled = args.action === "resume"
      found.schedule.enabled = enabled
      found.schedule.updatedAt = now
      found.schedule.nextAt = enabled ? computeNextAt(found.schedule, now) : undefined
      await persist(state, store)
      return { title: `schedule ${args.action}: ${found.schedule.id}`, output: formatSchedule(found.schedule, now) }
    }
    case "delete": {
      if (!args.id) return toolError(args.action, "id is required")
      const store = await reload(state)
      const found = findSchedule(store.schedules, args.id)
      if (!found.ok) return toolError(args.action, found.error)
      store.schedules = store.schedules.filter((s) => s.id !== found.schedule.id)
      await persist(state, store)
      return { title: `schedule delete: ${found.schedule.id}`, output: `deleted ${found.schedule.id} (${found.schedule.name})` }
    }
    case "history": {
      if (!args.id) return toolError(args.action, "id is required")
      const store = await reload(state)
      const found = findSchedule(store.schedules, args.id)
      if (!found.ok) return toolError(args.action, found.error)
      const runs = await tailRuns(dir, found.schedule.id, 10)
      const lines = runs.length
        ? runs.map(
            (r) =>
              `${new Date(r.ts).toISOString()} ${r.status}${r.sessionID ? ` session=${r.sessionID}` : ""}${r.detail ? ` ${r.detail}` : ""}`,
          )
        : ["no runs yet"]
      return { title: `schedule history: ${found.schedule.id}`, output: lines.join("\n") }
    }
    case "run": {
      if (!args.id) return toolError(args.action, "id is required")
      const store = await reload(state)
      const found = findSchedule(store.schedules, args.id)
      if (!found.ok) return toolError(args.action, found.error)
      const id = found.schedule.id
      enqueue(state, { id, source: "manual" })
      await pump(state)
      if (state.queue.some((q) => q.id === id)) {
        return { title: `schedule run: ${id}`, output: `queued (wake loop busy): ${id}` }
      }
      const runs = await tailRuns(dir, id, 1)
      const last = runs[0]
      const output = last
        ? `fired ${last.status}${last.sessionID ? ` session=${last.sessionID}` : ""}${last.detail ? ` (${last.detail})` : ""}`
        : `fired (no run record): ${id}`
      return { title: `schedule run: ${id}`, output }
    }
    default:
      return toolError(args.action, `unknown action: ${args.action}`)
  }
}

async function reload(state: State): Promise<StoreShape> {
  state.store = await loadStore(state.options.storeDir)
  return state.store
}

async function persist(state: State, store: StoreShape): Promise<void> {
  await saveStore(state.options.storeDir, store)
}

function buildTool(state: State) {
  return tool({
    description:
      "Plan a task that wakes this agent later: once (after), repeating (every), cron (local time) or bus event (on). " +
      "list/get/pause/resume/delete/history/run manage existing schedules; run fires now without consuming a run. " +
      "On fire, `prompt` is sent back to the creating session (or sessionID, or a fresh session when freshSession).",
    args: {
      action: tool.schema
        .string()
        .describe("one of: create, list, get, pause, resume, delete, history, run"),
      id: tool.schema.string().optional().describe("schedule id or unique prefix"),
      name: tool.schema.string().optional().describe("short label"),
      prompt: tool.schema.string().optional().describe("text sent to the agent on each fire (required for create)"),
      after: tool.schema.string().optional().describe('one-shot time: ISO 8601, "+30m", "45m" or epoch ms'),
      every: tool.schema.string().optional().describe('fixed interval, e.g. "30s", "10m", "1h30m", "1d"'),
      firstAt: tool.schema.string().optional().describe("first fire for `every` (default: now + every)"),
      cron: tool.schema.string().optional().describe('5-field cron in local time, e.g. "0 9 * * 1-5"'),
      on: tool.schema.string().optional().describe("bus event, e.g. session.idle / file.edited / message.updated"),
      where: tool.schema.any().optional().describe("event filter: properties must contain this subset"),
      cooldown: tool.schema.string().optional().describe("minimum delay between event fires, e.g. 10m"),
      agent: tool.schema.string().optional().describe("agent used when firing"),
      model: tool.schema.string().optional().describe('model "providerID/modelID" used when firing'),
      sessionID: tool.schema.string().optional().describe("target session (default: the session calling create)"),
      freshSession: tool.schema.boolean().optional().describe("send each fire to a brand-new session"),
      maxRuns: tool.schema.number().int().positive().optional().describe("stop after N runs"),
      expiresIn: tool.schema.string().optional().describe('stop for good after this delay, e.g. "7d"'),
    },
    execute: (args, context) => executeTool(state, args, context),
  })
}

// ---- Plugin factory ----

export default async function schedulePlugin(
  input: PluginInput,
  options?: Record<string, unknown>,
): Promise<Hooks> {
  const opts = normalizeOptions(options)
  const g = globalThis as Record<string, unknown>
  const previous = g[GLOBAL_KEY] as State | undefined
  // The harness may instantiate the plugin more than once per process (once per served
  // instance). Reuse a live state for the same store instead of churning timers and locks.
  if (previous && !previous.disposed && previous.options.storeDir === opts.storeDir) {
    console.error("[schedule] reused existing state (same store)")
    return {
      event: async ({ event }) => {
        await handleEvent(previous, event as { type?: string; properties?: any })
      },
      tool: { schedule: buildTool(previous) },
    }
  }
  previous?.dispose("reloaded")
  if (!opts.enabled) {
    console.error("[schedule] disabled (options.enabled=false): no timer, no tool")
    return {}
  }
  const state: State = {
    options: opts,
    client: input.client as unknown as WakeClient,
    directory: input.directory,
    worktree: input.worktree,
    store: { version: STORE_VERSION, schedules: [] },
    queue: [],
    timer: undefined,
    heartbeat: undefined,
    owner: false,
    pumping: false,
    disposed: false,
    refreshedAt: 0,
    selfSessions: new Set<string>(),
    dispose: () => {},
  }
  state.dispose = (reason: string) => {
    if (state.disposed) return
    state.disposed = true
    if (state.timer) clearTimeout(state.timer)
    if (state.heartbeat) clearInterval(state.heartbeat)
    if (state.owner) void releaseLock(opts.storeDir, process.pid).catch(() => {})
    if (g[GLOBAL_KEY] === state) delete g[GLOBAL_KEY]
    console.error(`[schedule] disposed (${reason})`)
  }
  g[GLOBAL_KEY] = state
  state.store = await loadStore(opts.storeDir)
  state.heartbeat = setInterval(() => {
    if (state.disposed || !state.owner) return
    void refreshLock(opts.storeDir, lockInfo())
      .then((kept) => {
        if (!kept) state.owner = false
      })
      .catch(() => {})
  }, DEFAULTS.lockHeartbeatMs)
  ;(state.heartbeat as any).unref?.()
  console.error(`[schedule] active: store=${opts.storeDir} tick=${opts.tickSeconds}s pid=${process.pid}`)
  void tick(state)
  return {
    event: async ({ event }) => {
      await handleEvent(state, event as { type?: string; properties?: any })
    },
    tool: { schedule: buildTool(state) },
  }
}
