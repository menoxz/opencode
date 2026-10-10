// Tests of the schedule component's pure logic (spec: specs/schedule-plugin.md).
// Run from .opencode (the repo-root bunfig sets [test].root = "./do-not-run-tests-from-root"):
//   cd .opencode && bun test tests/schedule.test.ts tests/schedule-plugin.test.ts
import { describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  DEFAULTS,
  acquireLock,
  appendRun,
  buildWakeBody,
  computeNextAt,
  createSchedule,
  dueSchedules,
  findSchedule,
  formatList,
  formatSchedule,
  isDue,
  loadStore,
  matchEvent,
  nextCronAt,
  normalizeOptions,
  ownerDecision,
  parseCron,
  parseDurationMs,
  parseWhen,
  readLock,
  refreshLock,
  releaseLock,
  saveStore,
  tailRuns,
  wake,
  type Schedule,
  type StoreShape,
} from "../plugin/schedule-lib.js"

function at(y: number, mo: number, d: number, h = 0, mi = 0, s = 0) {
  return new Date(y, mo, d, h, mi, s).getTime()
}

function sched(partial: Partial<Schedule> & { trigger: Schedule["trigger"] }): Schedule {
  const now = Date.now()
  return {
    id: "sch_test",
    name: "test",
    enabled: true,
    prompt: "wake",
    runs: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

async function tmp(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "schedule-test-"))
}

describe("durées et dates", () => {
  test("parseDurationMs accepts compound units", () => {
    expect(parseDurationMs("30s")).toBe(30_000)
    expect(parseDurationMs("10m")).toBe(600_000)
    expect(parseDurationMs("2h")).toBe(7_200_000)
    expect(parseDurationMs("1d")).toBe(86_400_000)
    expect(parseDurationMs("1h30m")).toBe(5_400_000)
    expect(parseDurationMs("+45m")).toBe(2_700_000)
  })
  test("parseDurationMs rejects junk, zero and >366d", () => {
    expect(() => parseDurationMs("")).toThrow()
    expect(() => parseDurationMs("abc")).toThrow()
    expect(() => parseDurationMs("0s")).toThrow()
    expect(() => parseDurationMs("400d")).toThrow()
  })
  test("parseWhen handles relative, ISO and epoch", () => {
    const now = at(2026, 0, 1)
    expect(parseWhen("+30m", now)).toBe(now + 1_800_000)
    expect(parseWhen("10m", now)).toBe(now + 600_000)
    expect(parseWhen("2026-10-10T12:00:00", now)).toBe(at(2026, 9, 10, 12))
    expect(parseWhen("1760000000000", now)).toBe(1_760_000_000_000)
    expect(() => parseWhen("zzz", now)).toThrow()
  })
})

describe("cron", () => {
  test("fields, steps, lists", () => {
    const f = parseCron("*/15 9 1,15 * 1-5")
    expect([...f.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45])
    expect([...f.hours]).toEqual([9])
    expect([...f.dom]).toEqual([1, 15])
    expect([...f.dow].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    expect(f.domWild).toBe(false)
  })
  test("rejects malformed expressions", () => {
    expect(() => parseCron("0 9 * *")).toThrow()
    expect(() => parseCron("60 * * * *")).toThrow()
    expect(() => parseCron("0 0 30 2 *")).not.toThrow()
  })
  test("nextCronAt on weekdays", () => {
    expect(nextCronAt("0 9 * * 1-5", at(2026, 0, 5, 8))).toBe(at(2026, 0, 5, 9))
    expect(nextCronAt("0 9 * * 1-5", at(2026, 0, 5, 10))).toBe(at(2026, 0, 6, 9))
    expect(nextCronAt("0 0 30 2 *", at(2026, 0, 1))).toBeNull()
  })
  test("dom-or-dow semantics", () => {
    // both restricted: either matches (Vixie cron quirk); Jan 1 2026 is a Thursday
    expect(nextCronAt("0 12 13 * 5", at(2026, 0, 1))).toBe(at(2026, 0, 2, 12)) // Fri Jan 2 (dow 5)
    expect(nextCronAt("0 12 13 * 5", at(2026, 0, 10))).toBe(at(2026, 0, 13, 12)) // Tue Jan 13 (dom 13)
  })
})

describe("échéances", () => {
  test("computeNextAt covers once / interval / cron / event", () => {
    const now = at(2026, 5, 1, 10, 0)
    const once = sched({ trigger: { type: "once", at: now + 60_000 } })
    expect(computeNextAt(once, now)).toBe(now + 60_000)
    expect(computeNextAt({ ...once, runs: 1 }, now)).toBeUndefined()
    const interval = sched({ createdAt: now, trigger: { type: "interval", everyMs: 3_600_000 } })
    expect(computeNextAt(interval, now)).toBe(now + 3_600_000)
    const withFirst = sched({
      runs: 0,
      createdAt: now,
      trigger: { type: "interval", everyMs: 3_600_000, firstAt: now + 300_000 },
    })
    expect(computeNextAt(withFirst, now)).toBe(now + 300_000)
    const after = sched({ runs: 1, lastRunAt: now, trigger: { type: "interval", everyMs: 3_600_000 } })
    expect(computeNextAt(after, now)).toBe(now + 3_600_000)
    const cron = sched({ trigger: { type: "cron", expr: "0 9 * * *" } })
    expect(computeNextAt(cron, at(2026, 0, 5, 8))).toBe(at(2026, 0, 5, 9))
    const ev = sched({ trigger: { type: "event", event: "session.idle" } })
    expect(computeNextAt(ev, now)).toBeUndefined()
  })
  test("isDue + dueSchedules respect pause, maxRuns, expiry", () => {
    const now = 1_000_000
    const due = sched({ trigger: { type: "once", at: now - 1 }, nextAt: now - 1 })
    expect(isDue(due, now)).toBe(true)
    expect(isDue({ ...due, enabled: false }, now)).toBe(false)
    expect(isDue({ ...due, nextAt: now + 1 }, now)).toBe(false)
    expect(isDue({ ...due, runs: 2, maxRuns: 2 }, now)).toBe(false)
    expect(isDue({ ...due, expiresAt: now - 5 }, now)).toBe(false)
    const later = sched({ id: "sch_later", trigger: { type: "once", at: now + 5 }, nextAt: now + 5 })
    const list = dueSchedules({ version: 1, schedules: [later, due] }, now)
    expect(list.map((s) => s.id)).toEqual([due.id])
  })
  test("matchEvent filters by event, where, cooldown", () => {
    const now = 50_000
    const ev = sched({
      trigger: { type: "event", event: "file.edited", where: { sessionID: "ses_x" }, cooldownMs: 10_000 },
    })
    expect(matchEvent(ev, { type: "file.edited", properties: { sessionID: "ses_x", extra: 1 } }, now)).toBe(true)
    expect(matchEvent(ev, { type: "file.edited", properties: { sessionID: "ses_y" } }, now)).toBe(false)
    expect(matchEvent(ev, { type: "session.idle", properties: { sessionID: "ses_x" } }, now)).toBe(false)
    const cooled = { ...ev, lastEventAt: now - 5_000 }
    expect(matchEvent(cooled, { type: "file.edited", properties: { sessionID: "ses_x" } }, now)).toBe(false)
    expect(matchEvent({ ...ev, enabled: false }, { type: "file.edited", properties: { sessionID: "ses_x" } }, now)).toBe(
      false,
    )
  })
})

describe("persistance et verrou", () => {
  test("store roundtrip, quarantine, runs journal", async () => {
    const dir = await tmp()
    try {
      expect((await loadStore(dir)).schedules.length).toBe(0)
      const store = await loadStore(dir)
      const created = createSchedule(store, { prompt: "ping", every: "1h" }, 1000)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      await saveStore(dir, store)
      const again = await loadStore(dir)
      expect(again.schedules.length).toBe(1)
      expect(again.schedules[0].prompt).toBe("ping")
      expect(again.schedules[0].nextAt).toBe(1000 + 3_600_000)
      await appendRun(dir, { ts: 10, id: created.schedule.id, name: "x", status: "ok" })
      await appendRun(dir, { ts: 20, id: "sch_other", name: "y", status: "error" })
      await appendRun(dir, { ts: 30, id: created.schedule.id, name: "x", status: "error", detail: "boom" })
      const runs = await tailRuns(dir, created.schedule.id, 5)
      expect(runs.map((r) => r.ts)).toEqual([30, 10])
      await writeFile(path.join(dir, "schedules.json"), "{not json", "utf8")
      expect((await loadStore(dir)).schedules.length).toBe(0)
      const files = await readdir(dir)
      expect(files.some((f) => f.includes(".corrupt-"))).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  test("lock: acquire / heartbeat / takeover / release", async () => {
    const dir = await tmp()
    try {
      const me = { pid: process.pid, startedAt: 1000, host: "h" }
      expect(await acquireLock(dir, me, 1000, () => false)).toBe("owner")
      expect(await acquireLock(dir, me, 2000, () => false)).toBe("owner")
      const other = { pid: 999999, startedAt: 2000, host: "h" }
      expect(await acquireLock(dir, other, 3000, () => true)).toBe("observer")
      expect(await acquireLock(dir, other, 2000 + DEFAULTS.staleLockMs + 1, () => true)).toBe("owner")
      expect(await refreshLock(dir, me)).toBe(false)
      const nowAlive = { pid: 999999, startedAt: Date.now(), host: "h" }
      expect(await refreshLock(dir, nowAlive)).toBe(true)
      await releaseLock(dir, me.pid)
      expect(await readLock(dir)).not.toBeNull()
      await releaseLock(dir, nowAlive.pid)
      expect(await readLock(dir)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  test("ownerDecision is pure and conservative", () => {
    expect(ownerDecision(null, 1, 0, () => true)).toBe("owner")
    const lock = { pid: 2, startedAt: 0, host: "h" }
    expect(ownerDecision(lock, 2, 10, () => true)).toBe("owner")
    expect(ownerDecision(lock, 3, 10, () => true)).toBe("observer")
    expect(ownerDecision(lock, 3, 10, () => false)).toBe("owner")
    expect(ownerDecision(lock, 3, DEFAULTS.staleLockMs + 1, () => true)).toBe("owner")
  })
})

describe("réveil", () => {
  test("wake creates a session when none is set and sends the prompt", async () => {
    const calls: any[] = []
    const client = {
      session: {
        create: async (opts: any) => {
          calls.push(["create", opts])
          return { data: { id: "ses_new" } }
        },
        prompt: async (opts: any) => {
          calls.push(["prompt", opts])
          return { data: {} }
        },
      },
    }
    const s = sched({ trigger: { type: "once", at: 0 }, prompt: "ping", agent: "build", model: "prov/model" })
    const res = await wake(client as any, s)
    expect(res.sessionID).toBe("ses_new")
    expect(calls[0][0]).toBe("create")
    expect(calls[1][0]).toBe("prompt")
    expect(calls[1][1].path.id).toBe("ses_new")
    expect(calls[1][1].body.parts[0].text).toBe("ping")
    expect(calls[1][1].body.agent).toBe("build")
    expect(calls[1][1].body.model).toEqual({ providerID: "prov", modelID: "model" })
  })
  test("wake reuses an existing session", async () => {
    const calls: any[] = []
    const client = {
      session: {
        create: async () => ({ data: { id: "ses_new" } }),
        prompt: async (opts: any) => {
          calls.push(opts)
          return { data: {} }
        },
      },
    }
    const res = await wake(client as any, sched({ trigger: { type: "once", at: 0 }, sessionID: "ses_keep" }))
    expect(res.sessionID).toBe("ses_keep")
    expect(calls.length).toBe(1)
  })
  test("wake surfaces API errors", async () => {
    const failing = {
      session: {
        create: async () => ({ data: { id: "x" } }),
        prompt: async () => ({ error: { message: "boom" } }),
      },
    }
    await expect(wake(failing as any, sched({ trigger: { type: "once", at: 0 }, sessionID: "ses_keep" }))).rejects.toThrow(
      "boom",
    )
    const broken = {
      session: {
        create: async () => ({ error: { message: "nope" } }),
        prompt: async () => ({}),
      },
    }
    await expect(wake(broken as any, sched({ trigger: { type: "once", at: 0 } }))).rejects.toThrow("nope")
  })
  test("buildWakeBody maps sessionless defaults", () => {
    expect(buildWakeBody(sched({ trigger: { type: "once", at: 0 }, prompt: "p" }))).toEqual({
      parts: [{ type: "text", text: "p" }],
    })
  })
})

describe("création et options", () => {
  test("createSchedule validates input", () => {
    const store: StoreShape = { version: 1, schedules: [] }
    expect(createSchedule(store, { prompt: "" }).ok).toBe(false)
    expect(createSchedule(store, { prompt: "x" }).ok).toBe(false)
    expect(createSchedule(store, { prompt: "x", every: "1h", cron: "0 9 * * *" }).ok).toBe(false)
    expect(createSchedule(store, { prompt: "x", every: "bogus" }).ok).toBe(false)
    expect(createSchedule(store, { prompt: "x", after: "+1m", maxRuns: 0 }).ok).toBe(false)
    expect(createSchedule(store, { prompt: "x", after: "+1m", expiresIn: "nope" }).ok).toBe(false)
    expect(store.schedules.length).toBe(0)
    const ok = createSchedule(store, { prompt: "hello world", after: "+1m", maxRuns: 2 }, 1000)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.schedule.name).toBe("hello world")
    expect(ok.schedule.nextAt).toBe(1000 + 60_000)
    expect(store.schedules.length).toBe(1)
    expect(findSchedule(store.schedules, ok.schedule.id.slice(0, 8)).ok).toBe(true)
    expect(findSchedule(store.schedules, "nope").ok).toBe(false)
  })
  test("formats and options", () => {
    const s = sched({ trigger: { type: "interval", everyMs: 7_200_000 } })
    const line = formatSchedule(s, Date.now())
    expect(line).toContain(s.id)
    expect(line).toContain("every 2h")
    expect(formatList({ version: 1, schedules: [] }, Date.now())).toBe("No schedules.")
    const opts = normalizeOptions(undefined)
    expect(opts.enabled).toBe(true)
    expect(opts.tickSeconds).toBe(DEFAULTS.tickSeconds)
    expect(opts.maxSchedules).toBe(100)
    const clamped = normalizeOptions({ tickSeconds: 0, maxSchedules: 99999, enabled: false, storeDir: "  " })
    expect(clamped.tickSeconds).toBe(1)
    expect(clamped.maxSchedules).toBe(1000)
    expect(clamped.enabled).toBe(false)
    expect(clamped.storeDir.length).toBeGreaterThan(0)
  })
})
