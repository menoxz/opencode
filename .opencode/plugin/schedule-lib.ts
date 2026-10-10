// schedule-lib.ts - pure logic for the `schedule` plugin (spec: specs/schedule-plugin.md).
// No opencode imports: unit-tested with `bun test` in .opencode/tests/schedule.test.ts.
// The plugin (schedule.ts) wires this to plugin hooks, the SDK client and the tool registry.
//
// Covered here:
//   - trigger parsing: once (ISO / +30m), interval (every), cron (5 fields), event (bus)
//   - next-run computation and due policy (paused, maxRuns, expiresAt)
//   - persistence layout: schedules.json + runs.jsonl (with corrupt-file quarantine)
//   - multi-process owner lock (decides which opencode process runs the timer)
//   - wake(): builds and sends the session prompt through an injected SDK client
//   - formatting helpers for the `schedule` tool output

import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const STORE_VERSION = 1
export const STORE_FILE = "schedules.json"
export const RUNS_FILE = "runs.jsonl"
export const LOCK_FILE = "owner.json"

export const DEFAULTS = {
  tickSeconds: 15,
  maxSchedules: 100,
  staleLockMs: 7 * 24 * 3_600_000,
  cronSearchDays: 366 * 5,
  lockHeartbeatMs: 30_000,
} as const

const DAY_MS = 86_400_000
const MAX_DURATION_MS = 366 * DAY_MS
const DURATION_UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: DAY_MS }

// ---- Types ----

export type TriggerOnce = { type: "once"; at: number }
export type TriggerInterval = { type: "interval"; everyMs: number; firstAt?: number }
export type TriggerCron = { type: "cron"; expr: string }
export type TriggerEvent = {
  type: "event"
  event: string
  where?: Record<string, unknown>
  cooldownMs?: number
}
export type Trigger = TriggerOnce | TriggerInterval | TriggerCron | TriggerEvent

export type Schedule = {
  id: string
  name: string
  enabled: boolean
  trigger: Trigger
  prompt: string
  agent?: string
  model?: string
  sessionID?: string
  freshSession?: boolean
  maxRuns?: number
  expiresAt?: number
  createdAt: number
  updatedAt: number
  runs: number
  lastRunAt?: number
  lastStatus?: string
  lastError?: string
  nextAt?: number
  lastEventAt?: number
}

export type StoreShape = { version: number; schedules: Schedule[] }

export type RunEntry = {
  ts: number
  id: string
  name: string
  status: "ok" | "error"
  sessionID?: string
  detail?: string
}

export type LockInfo = { pid: number; startedAt: number; host: string }

export type ScheduleOptions = {
  enabled: boolean
  storeDir: string
  tickSeconds: number
  maxSchedules: number
  defaultAgent?: string
  allowEvents: boolean
}

// ---- Time parsing ----

// "30s" | "10m" | "2h" | "1d" | "1h30m" | "+45m" (leading + ignored)
export function parseDurationMs(text: string): number {
  const raw = String(text ?? "")
    .trim()
    .replace(/^\+/, "")
    .toLowerCase()
  if (!raw) throw new Error("empty duration")
  const re = /(\d+(?:\.\d+)?)\s*([smhd])/g
  let total = 0
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    if (raw.slice(cursor, match.index).trim() !== "") break
    total += Number(match[1]) * DURATION_UNITS[match[2]]
    cursor = match.index + match[0].length
  }
  if (raw.slice(cursor).trim() !== "") throw new Error(`invalid duration: ${text}`)
  if (!(total > 0)) throw new Error(`invalid duration: ${text}`)
  if (total > MAX_DURATION_MS) throw new Error(`duration too large (max 366d): ${text}`)
  return Math.round(total)
}

// ISO 8601 | "+30m" | "30m" | epoch milliseconds (>= 10 digits)
export function parseWhen(text: string, now: number): number {
  const raw = String(text ?? "").trim()
  if (!raw) throw new Error("empty time")
  if (raw.startsWith("+") || /^\d+(?:\.\d+)?\s*[smhd]/i.test(raw)) return now + parseDurationMs(raw)
  if (/^\d{10,}$/.test(raw)) return Number(raw)
  const parsed = Date.parse(raw)
  if (Number.isFinite(parsed)) return parsed
  throw new Error(`invalid time: ${text}`)
}

export function humanizeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "?"
  if (ms % DAY_MS === 0) return `${ms / DAY_MS}d`
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  if (ms % 1_000 === 0) return `${ms / 1_000}s`
  return `${Math.round(ms)}ms`
}

// ---- Cron (5 fields: minute hour dom month dow) ----

export type CronFields = {
  minutes: Set<number>
  hours: Set<number>
  dom: Set<number>
  months: Set<number>
  dow: Set<number>
  domWild: boolean
  dowWild: boolean
}

function parseCronField(raw: string, min: number, max: number, opts?: { dow?: boolean }): Set<number> {
  const out = new Set<number>()
  const normalize = (value: number) => (opts?.dow && value === 7 ? 0 : value)
  for (const part of raw.split(",")) {
    if (part === "") throw new Error(`invalid cron field: ${raw}`)
    const [rangePart, stepRaw] = part.split("/")
    let step = 1
    if (stepRaw !== undefined) {
      step = Number(stepRaw)
      if (!Number.isInteger(step) || step < 1) throw new Error(`invalid cron step: ${part}`)
    }
    let start: number
    let end: number
    if (rangePart === "*") {
      start = min
      end = max
    } else if (/^\d+-\d+$/.test(rangePart)) {
      const [a, b] = rangePart.split("-").map(Number)
      start = a
      end = b
    } else if (/^\d+$/.test(rangePart)) {
      start = Number(rangePart)
      end = stepRaw === undefined ? start : max
    } else {
      throw new Error(`invalid cron field: ${part}`)
    }
    if (start < min || end > max || start > end) throw new Error(`cron value out of range: ${part}`)
    for (let value = start; value <= end; value += step) out.add(normalize(value))
  }
  if (out.size === 0) throw new Error(`empty cron field: ${raw}`)
  return out
}

export function parseCron(expr: string): CronFields {
  const parts = String(expr ?? "").trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`cron must have 5 fields (min hour dom month dow): ${expr}`)
  const [minRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts
  return {
    minutes: parseCronField(minRaw, 0, 59),
    hours: parseCronField(hourRaw, 0, 23),
    dom: parseCronField(domRaw, 1, 31),
    months: parseCronField(monthRaw, 1, 12),
    dow: parseCronField(dowRaw, 0, 7, { dow: true }),
    domWild: domRaw === "*",
    dowWild: dowRaw === "*",
  }
}

// Smallest local-time minute strictly after `afterMs` matching the expression.
// Bounded search (DEFAULTS.cronSearchDays); returns null when nothing matches.
export function nextCronAt(expr: string | CronFields, afterMs: number): number | null {
  const f = typeof expr === "string" ? parseCron(expr) : expr
  const base = new Date(afterMs)
  const y = base.getFullYear()
  const mo = base.getMonth()
  const d = base.getDate()
  const baseHour = base.getHours()
  const baseMinute = base.getMinutes()
  for (let offset = 0; offset <= DEFAULTS.cronSearchDays; offset++) {
    const day = new Date(y, mo, d + offset)
    if (!f.months.has(day.getMonth() + 1)) continue
    const domMatch = f.domWild || f.dom.has(day.getDate())
    const dowMatch = f.dowWild || f.dow.has(day.getDay())
    // Standard cron: when both dom and dow are restricted, match either one.
    const dayOk = !f.domWild && !f.dowWild ? domMatch || dowMatch : domMatch && dowMatch
    if (!dayOk) continue
    const sameDay = offset === 0
    for (let h = 0; h < 24; h++) {
      if (sameDay && h < baseHour) continue
      if (!f.hours.has(h)) continue
      for (let m = 0; m < 60; m++) {
        if (sameDay && h === baseHour && m <= baseMinute) continue
        if (!f.minutes.has(m)) continue
        return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime()
      }
    }
  }
  return null
}

// ---- Schedule lifecycle ----

export function makeId(now = Date.now(), rnd: () => number = Math.random): string {
  const tail = Math.floor(rnd() * 36 ** 4)
    .toString(36)
    .padStart(4, "0")
  return `sch_${now.toString(36)}${tail}`
}

// Next run for a schedule given `now`. undefined = no timed next run.
// - once: fires while runs === 0 (late ok; catch-up policy: fire once, late).
// - interval: first fire = firstAt (else createdAt + everyMs); afterwards lastRunAt + everyMs.
// - cron: next local-time occurrence after the last run (or now).
// - event: no timed run; the bus listener drives it.
export function computeNextAt(sched: Schedule, now: number): number | undefined {
  const t = sched.trigger
  switch (t.type) {
    case "once":
      return sched.runs === 0 ? t.at : undefined
    case "interval": {
      if (sched.runs === 0 && t.firstAt !== undefined) return t.firstAt
      const base = sched.lastRunAt ?? t.firstAt ?? sched.createdAt
      return base + t.everyMs
    }
    case "cron": {
      const after = sched.lastRunAt ?? now
      return nextCronAt(t.expr, after) ?? undefined
    }
    case "event":
      return undefined
  }
}

export function isDue(sched: Schedule, now: number): boolean {
  if (!sched.enabled) return false
  if (sched.nextAt === undefined) return false
  if (now < sched.nextAt) return false
  if (sched.maxRuns !== undefined && sched.runs >= sched.maxRuns) return false
  if (sched.expiresAt !== undefined && now > sched.expiresAt) return false
  return true
}

export function dueSchedules(store: StoreShape, now: number): Schedule[] {
  return store.schedules
    .filter((s) => isDue(s, now))
    .sort((a, b) => (a.nextAt ?? 0) - (b.nextAt ?? 0))
}

// Smallest nextAt worth waking the timer for (enabled time triggers only).
export function nextDueAt(store: StoreShape, now: number): number | null {
  let best: number | null = null
  for (const s of store.schedules) {
    if (!s.enabled || s.nextAt === undefined) continue
    if (s.maxRuns !== undefined && s.runs >= s.maxRuns) continue
    if (s.expiresAt !== undefined && now > s.expiresAt) continue
    if (best === null || s.nextAt < best) best = s.nextAt
  }
  return best
}

// ---- Event triggers ----

function subsetMatch(filter: unknown, value: unknown): boolean {
  if (filter === null || typeof filter !== "object") return filter === value
  if (Array.isArray(filter)) {
    if (!Array.isArray(value) || value.length !== filter.length) return false
    return filter.every((item, i) => subsetMatch(item, value[i]))
  }
  if (value === null || typeof value !== "object") return false
  return Object.entries(filter as Record<string, unknown>).every(([k, v]) =>
    subsetMatch(v, (value as Record<string, unknown>)[k]),
  )
}

export function matchEvent(sched: Schedule, event: { type?: string; properties?: unknown }, now: number): boolean {
  if (!sched.enabled || sched.trigger.type !== "event") return false
  if (event?.type !== sched.trigger.event) return false
  if (sched.maxRuns !== undefined && sched.runs >= sched.maxRuns) return false
  if (sched.expiresAt !== undefined && now > sched.expiresAt) return false
  const cooldown = sched.trigger.cooldownMs ?? 0
  if (cooldown > 0 && sched.lastEventAt !== undefined && now - sched.lastEventAt < cooldown) return false
  if (sched.trigger.where && !subsetMatch(sched.trigger.where, event.properties ?? {})) return false
  return true
}

// Best-effort session id carried by a bus event (session.idle, message.updated, ...).
export function eventSessionID(event: { properties?: unknown }): string | undefined {
  const p = (event?.properties ?? {}) as Record<string, any>
  const candidates = [p.sessionID, p.session?.id, p.info?.sessionID]
  for (const c of candidates) if (typeof c === "string" && c.startsWith("ses_")) return c
  if (typeof p.info?.id === "string" && p.info.id.startsWith("ses_")) return p.info.id
  return undefined
}

// ---- Lookups ----

export type FindResult = { ok: true; schedule: Schedule } | { ok: false; error: string }

export function findSchedule(schedules: Schedule[], ref: string): FindResult {
  const key = String(ref ?? "").trim()
  if (!key) return { ok: false, error: "missing schedule id" }
  const exact = schedules.find((s) => s.id === key)
  if (exact) return { ok: true, schedule: exact }
  const hits = schedules.filter((s) => s.id.startsWith(key))
  if (hits.length === 1) return { ok: true, schedule: hits[0] }
  if (hits.length === 0) return { ok: false, error: `schedule not found: ${key}` }
  return { ok: false, error: `ambiguous id prefix: ${key} (${hits.map((s) => s.id).join(", ")})` }
}

// ---- Persistence ----

export async function loadStore(dir: string): Promise<StoreShape> {
  const file = path.join(dir, STORE_FILE)
  try {
    const text = await readFile(file, "utf8")
    const data = JSON.parse(text) as StoreShape
    if (!data || !Array.isArray(data.schedules)) throw new Error("bad store shape")
    return { version: STORE_VERSION, schedules: data.schedules }
  } catch (error: any) {
    if (error?.code === "ENOENT") return { version: STORE_VERSION, schedules: [] }
    // Corrupt store: quarantine the file (never silently discard) and start clean.
    try {
      await rename(file, `${file}.corrupt-${Date.now()}`)
    } catch {}
    return { version: STORE_VERSION, schedules: [] }
  }
}

export async function saveStore(dir: string, store: StoreShape): Promise<void> {
  const file = path.join(dir, STORE_FILE)
  const tmp = `${file}.tmp`
  await mkdir(dir, { recursive: true })
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf8")
  await rename(tmp, file)
}

export async function appendRun(dir: string, entry: RunEntry): Promise<void> {
  await mkdir(dir, { recursive: true })
  await appendFile(path.join(dir, RUNS_FILE), JSON.stringify(entry) + "\n", "utf8")
}

export async function tailRuns(dir: string, id: string, limit = 5): Promise<RunEntry[]> {
  try {
    const text = await readFile(path.join(dir, RUNS_FILE), "utf8")
    const lines = text.split("\n").filter(Boolean)
    const out: RunEntry[] = []
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]) as RunEntry
        if (entry?.id === id) out.push(entry)
      } catch {}
    }
    return out
  } catch {
    return []
  }
}

export function defaultStoreDir(): string {
  if (process.env.OPENCODE_SCHEDULE_HOME) return process.env.OPENCODE_SCHEDULE_HOME
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  return path.join(base, "opencodev2", "schedule")
}

// ---- Multi-process owner lock ----

export async function readLock(dir: string): Promise<LockInfo | null> {
  try {
    const text = await readFile(path.join(dir, LOCK_FILE), "utf8")
    const info = JSON.parse(text) as LockInfo
    if (typeof info?.pid !== "number" || !Number.isFinite(info.pid)) return null
    return { pid: info.pid, startedAt: Number(info.startedAt) || 0, host: String(info.host ?? "") }
  } catch {
    return null
  }
}

export async function writeLock(dir: string, info: LockInfo): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, LOCK_FILE), JSON.stringify(info), "utf8")
}

export async function clearLock(dir: string): Promise<void> {
  try {
    await rm(path.join(dir, LOCK_FILE))
  } catch {}
}

// Exclusive acquire: create the lock file (flag wx) or take over a stale/dead owner.
export async function acquireLock(
  dir: string,
  info: LockInfo,
  now: number,
  alive: (pid: number) => boolean,
  staleMs: number = DEFAULTS.staleLockMs,
): Promise<"owner" | "observer"> {
  const file = path.join(dir, LOCK_FILE)
  await mkdir(dir, { recursive: true })
  const create = async () => {
    try {
      await writeFile(file, JSON.stringify(info), { flag: "wx" })
      return true
    } catch (error: any) {
      if (error?.code === "EEXIST") return false
      throw error
    }
  }
  if (await create()) return "owner"
  const lock = await readLock(dir)
  const decision = ownerDecision(lock, info.pid, now, alive, staleMs)
  if (decision === "observer") return "observer"
  if (lock?.pid === info.pid) {
    await writeLock(dir, info)
    return "owner"
  }
  try {
    await rm(file)
  } catch {}
  return (await create()) ? "owner" : "observer"
}

// Heartbeat: only the current owner may refresh; false means the lock was lost.
export async function refreshLock(dir: string, info: LockInfo): Promise<boolean> {
  const lock = await readLock(dir)
  if (!lock || lock.pid !== info.pid) return false
  await writeLock(dir, info)
  return true
}

// Drop the lock only if we still hold it.
export async function releaseLock(dir: string, pid: number): Promise<void> {
  const lock = await readLock(dir)
  if (lock?.pid === pid) await clearLock(dir)
}

// Pure decision: should selfPid own the wake loop, or stay observer?
// `alive` is injected (process.kill(pid, 0) in the plugin) so tests stay pure.
export function ownerDecision(
  lock: LockInfo | null,
  selfPid: number,
  now: number,
  alive: (pid: number) => boolean,
  staleMs: number = DEFAULTS.staleLockMs,
): "owner" | "observer" {
  if (!lock) return "owner"
  if (lock.pid === selfPid) return "owner"
  if (now - lock.startedAt > staleMs) return "owner"
  if (!alive(lock.pid)) return "owner"
  return "observer"
}

// ---- Wake: session prompt through the injected SDK client ----

// Structural subset of the opencode SDK used for waking. Kept structural so the
// lib stays import-free and tests can inject a stub.
export type WakeClient = {
  session: {
    create: (opts: { body?: { title?: string; parentID?: string } }) => Promise<any>
    prompt: (opts: { path: { id: string }; body: Record<string, unknown> }) => Promise<any>
  }
}

function isErrorResult(result: any): boolean {
  return result !== null && typeof result === "object" && "error" in result && result.error
}

export function buildWakeBody(sched: Schedule): Record<string, unknown> {
  const body: Record<string, unknown> = { parts: [{ type: "text", text: sched.prompt }] }
  if (sched.agent) body.agent = sched.agent
  if (sched.model) {
    const slash = sched.model.indexOf("/")
    if (slash > 0) body.model = { providerID: sched.model.slice(0, slash), modelID: sched.model.slice(slash + 1) }
  }
  return body
}

export async function wake(client: WakeClient, sched: Schedule): Promise<{ sessionID: string }> {
  let sessionID = sched.freshSession ? undefined : sched.sessionID
  if (!sessionID) {
    const created = await client.session.create({ body: { title: `schedule: ${sched.name || sched.id}` } })
    if (isErrorResult(created)) throw new Error(errorText(created.error))
    const id = created?.data?.id ?? created?.id
    if (typeof id !== "string" || !id) throw new Error("session.create returned no id")
    sessionID = id
  }
  const sent = await client.session.prompt({ path: { id: sessionID }, body: buildWakeBody(sched) })
  if (isErrorResult(sent)) throw new Error(errorText(sent.error))
  return { sessionID }
}

// ---- Creation from tool input ----

export type CreateInput = {
  name?: string
  prompt: string
  after?: string
  every?: string
  firstAt?: string
  cron?: string
  on?: string
  where?: Record<string, unknown>
  cooldown?: string
  agent?: string
  model?: string
  sessionID?: string
  freshSession?: boolean
  maxRuns?: number
  expiresIn?: string
}

export type BuildTriggerResult = { ok: true; trigger: Trigger } | { ok: false; error: string }

export function buildTrigger(input: CreateInput, now: number): BuildTriggerResult {
  const given = [
    input.after !== undefined ? "after" : null,
    input.every !== undefined ? "every" : null,
    input.cron !== undefined ? "cron" : null,
    input.on !== undefined ? "on" : null,
  ].filter(Boolean) as string[]
  if (given.length === 0) return { ok: false, error: "one trigger is required: after | every | cron | on" }
  if (given.length > 1) return { ok: false, error: `exactly one trigger is required, got: ${given.join(", ")}` }
  try {
    if (input.after !== undefined) return { ok: true, trigger: { type: "once", at: parseWhen(input.after, now) } }
    if (input.every !== undefined) {
      const everyMs = parseDurationMs(input.every)
      const firstAt = input.firstAt !== undefined ? parseWhen(input.firstAt, now) : undefined
      return { ok: true, trigger: { type: "interval", everyMs, firstAt } }
    }
    if (input.cron !== undefined) {
      parseCron(input.cron) // validate early, fail before persistence
      return { ok: true, trigger: { type: "cron", expr: input.cron.trim() } }
    }
    const event = String(input.on).trim()
    if (!/^[a-z][a-z0-9._-]*$/i.test(event)) return { ok: false, error: `invalid event name: ${input.on}` }
    const cooldownMs = input.cooldown !== undefined ? parseDurationMs(input.cooldown) : undefined
    const trigger: TriggerEvent = { type: "event", event }
    if (input.where !== undefined) trigger.where = input.where
    if (cooldownMs !== undefined) trigger.cooldownMs = cooldownMs
    return { ok: true, trigger }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

export type CreateResult = { ok: true; schedule: Schedule } | { ok: false; error: string }

export function createSchedule(store: StoreShape, input: CreateInput, now = Date.now()): CreateResult {
  const prompt = String(input.prompt ?? "").trim()
  if (!prompt) return { ok: false, error: "prompt is required" }
  const built = buildTrigger(input, now)
  if (!built.ok) return { ok: false, error: built.error }
  const trigger = built.trigger
  const schedule: Schedule = {
    id: makeId(now),
    name: sanitizeName(input.name ?? prompt.slice(0, 50)),
    enabled: true,
    trigger,
    prompt,
    runs: 0,
    createdAt: now,
    updatedAt: now,
  }
  if (input.agent) schedule.agent = input.agent
  if (input.model) schedule.model = input.model
  if (input.sessionID) schedule.sessionID = input.sessionID
  if (input.freshSession !== undefined) schedule.freshSession = input.freshSession
  if (input.maxRuns !== undefined) {
    if (!Number.isInteger(input.maxRuns) || input.maxRuns < 1)
      return { ok: false, error: "maxRuns must be a positive integer" }
    schedule.maxRuns = input.maxRuns
  }
  if (input.expiresIn !== undefined) {
    try {
      schedule.expiresAt = now + parseDurationMs(input.expiresIn)
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  }
  schedule.nextAt = computeNextAt(schedule, now)
  store.schedules.push(schedule)
  return { ok: true, schedule }
}

// ---- Formatting ----

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`
}

export function sanitizeName(text: string): string {
  return String(text ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 80)
}

export function humanizeTrigger(t: Trigger): string {
  switch (t.type) {
    case "once":
      return `once at ${new Date(t.at).toISOString()}`
    case "interval":
      return `every ${humanizeMs(t.everyMs)}${t.firstAt !== undefined ? ` (first ${new Date(t.firstAt).toISOString()})` : ""}`
    case "cron":
      return `cron "${t.expr}" (local time)`
    case "event":
      return `on ${t.event}${t.where ? ` where ${JSON.stringify(t.where)}` : ""}${
        t.cooldownMs ? ` (cooldown ${humanizeMs(t.cooldownMs)})` : ""
      }`
  }
}

export function formatSchedule(s: Schedule, now: number): string {
  const bits = [`${s.id}${s.enabled ? "" : " [paused]"} - ${s.name || "(unnamed)"}`, humanizeTrigger(s.trigger)]
  if (s.nextAt !== undefined) bits.push(`next: ${new Date(s.nextAt).toISOString()}`)
  bits.push(`runs: ${s.runs}${s.maxRuns !== undefined ? `/${s.maxRuns}` : ""}`)
  if (s.sessionID) bits.push(`session: ${s.sessionID}`)
  if (s.lastStatus) bits.push(`last: ${s.lastStatus}${s.lastError ? ` (${truncate(s.lastError, 80)})` : ""}`)
  return bits.join(" | ")
}

export function formatList(store: StoreShape, now: number): string {
  if (store.schedules.length === 0) return "No schedules."
  return store.schedules
    .slice()
    .sort(
      (a, b) =>
        (a.nextAt ?? Number.MAX_SAFE_INTEGER) - (b.nextAt ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt,
    )
    .map((s) => `- ${formatSchedule(s, now)}`)
    .join("\n")
}

export function describeSchedule(s: Schedule, runs: RunEntry[], now: number): string {
  const lines = [formatSchedule(s, now), `prompt: ${truncate(s.prompt, 200)}`]
  if (s.agent) lines.push(`agent: ${s.agent}`)
  if (s.model) lines.push(`model: ${s.model}`)
  if (s.expiresAt !== undefined) lines.push(`expires: ${new Date(s.expiresAt).toISOString()}`)
  if (runs.length) {
    lines.push("recent runs:")
    for (const r of runs)
      lines.push(`  ${new Date(r.ts).toISOString()} ${r.status}${r.detail ? ` ${truncate(r.detail, 120)}` : ""}`)
  }
  return lines.join("\n")
}

export function normalizeOptions(raw: Record<string, unknown> | undefined): ScheduleOptions {
  const o = raw ?? {}
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.floor(n)))
  }
  return {
    enabled: o.enabled !== false,
    storeDir: typeof o.storeDir === "string" && o.storeDir.trim() ? o.storeDir.trim() : defaultStoreDir(),
    tickSeconds: num(o.tickSeconds, DEFAULTS.tickSeconds, 1, 3600),
    maxSchedules: num(o.maxSchedules, DEFAULTS.maxSchedules, 1, 1000),
    defaultAgent: typeof o.defaultAgent === "string" && o.defaultAgent.trim() ? o.defaultAgent.trim() : undefined,
    allowEvents: o.allowEvents !== false,
  }
}
