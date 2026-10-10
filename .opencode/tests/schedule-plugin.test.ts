// Integration tests for the schedule plugin factory (spec: specs/schedule-plugin.md).
// The SDK client is stubbed: no server needed.
// Run from .opencode:
//   cd .opencode && bun test tests/schedule.test.ts tests/schedule-plugin.test.ts
import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import schedulePlugin from "../plugin/schedule.ts"

type Call = { kind: string; opts: any }

function stubClient(behavior: { promptError?: boolean } = {}) {
  const calls: Call[] = []
  const client = {
    session: {
      create: async (opts: any) => {
        calls.push({ kind: "create", opts })
        return { data: { id: "ses_new" } }
      },
      prompt: async (opts: any) => {
        calls.push({ kind: "prompt", opts })
        if (behavior.promptError) return { error: { message: "boom" } }
        return { data: {} }
      },
    },
  }
  return { client, calls }
}

function pluginInput(client: any, dir: string) {
  return {
    client,
    project: {},
    directory: dir,
    worktree: dir,
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://127.0.0.1:0"),
    $: undefined,
  } as any
}

function ctx(sessionID: string, dir: string) {
  return {
    sessionID,
    messageID: "msg_test",
    agent: "build",
    directory: dir,
    worktree: dir,
    abort: new AbortController().signal,
    metadata() {},
    ask: async () => {},
  } as any
}

async function tmp(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "schedule-plugin-"))
}

function firstId(output: string): string {
  return output.match(/sch_[a-z0-9]+/)?.[0] ?? ""
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return predicate()
}

async function waitForRun(file: string, id: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const text = await readFile(file, "utf8")
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const parsed = JSON.parse(line)
          if (parsed?.id === id) return parsed
        } catch {}
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

describe("plugin schedule (intégration)", () => {
  test("disabled: no tool, no event hook", async () => {
    const dir = await tmp()
    try {
      const hooks = await schedulePlugin(pluginInput(stubClient().client, dir), { enabled: false, storeDir: dir })
      expect(hooks.tool).toBeUndefined()
      expect(hooks.event).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("create / list / run / history / pause / resume / delete through the tool", async () => {
    const dir = await tmp()
    try {
      const { client, calls } = stubClient()
      const hooks: any = await schedulePlugin(pluginInput(client, dir), {
        storeDir: dir,
        tickSeconds: 3600,
        enabled: true,
      })
      expect(typeof hooks.tool.schedule.execute).toBe("function")
      const c = ctx("ses_ctx", dir)

      const created = await hooks.tool.schedule.execute({ action: "create", prompt: "ping later", every: "1h" }, c)
      const id = firstId(created.output)
      expect(id.length).toBeGreaterThan(4)

      const list = await hooks.tool.schedule.execute({ action: "list" }, c)
      expect(list.output).toContain("ping later")

      const run = await hooks.tool.schedule.execute({ action: "run", id }, c)
      expect(run.output).toContain("fired ok")
      const prompt = calls.find((x) => x.kind === "prompt")
      expect(prompt?.opts.path.id).toBe("ses_ctx")
      expect(prompt?.opts.body.parts[0].text).toBe("ping later")

      const history = await hooks.tool.schedule.execute({ action: "history", id }, c)
      expect(history.output).toContain("ok")

      const paused = await hooks.tool.schedule.execute({ action: "pause", id }, c)
      expect(paused.output).toContain("[paused]")
      const resumed = await hooks.tool.schedule.execute({ action: "resume", id }, c)
      expect(resumed.output).not.toContain("[paused]")

      const badTrigger = await hooks.tool.schedule.execute({ action: "create", prompt: "x" }, c)
      expect(badTrigger.output).toContain("error")

      const deleted = await hooks.tool.schedule.execute({ action: "delete", id }, c)
      expect(deleted.output).toContain("deleted")
      const missing = await hooks.tool.schedule.execute({ action: "get", id }, c)
      expect(missing.output.toLowerCase()).toContain("not found")

      await schedulePlugin(pluginInput(client, dir), { enabled: false, storeDir: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("wake error is journaled and surfaced", async () => {
    const dir = await tmp()
    try {
      const { client } = stubClient({ promptError: true })
      const hooks: any = await schedulePlugin(pluginInput(client, dir), { storeDir: dir, tickSeconds: 3600 })
      const c = ctx("ses_err", dir)
      const created = await hooks.tool.schedule.execute({ action: "create", prompt: "boom soon", every: "1h" }, c)
      const id = firstId(created.output)
      const run = await hooks.tool.schedule.execute({ action: "run", id }, c)
      expect(run.output).toContain("fired error")
      expect(run.output).toContain("boom")
      const history = await hooks.tool.schedule.execute({ action: "history", id }, c)
      expect(history.output).toContain("error")
      await schedulePlugin(pluginInput(client, dir), { enabled: false, storeDir: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("event trigger on session.created ignores the plugin's own sessions", async () => {
    const dir = await tmp()
    try {
      const { client, calls } = stubClient()
      const hooks: any = await schedulePlugin(pluginInput(client, dir), { storeDir: dir, tickSeconds: 3600 })
      const c = ctx("ses_ctx", dir)
      const created = await hooks.tool.schedule.execute(
        { action: "create", prompt: "react to new sessions", on: "session.created", freshSession: true },
        c,
      )
      expect(created.output).toContain("sch_")
      // An external session must wake the schedule.
      await hooks.event({ event: { type: "session.created", properties: { sessionID: "ses_ext" } } })
      expect(await waitFor(() => calls.some((x) => x.kind === "prompt"))).toBe(true)
      const promptsAfterExternal = calls.filter((x) => x.kind === "prompt").length
      // The session the plugin just created for that wake must NOT re-trigger it.
      await hooks.event({ event: { type: "session.created", properties: { sessionID: "ses_new" } } })
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(calls.filter((x) => x.kind === "prompt").length).toBe(promptsAfterExternal)
      await schedulePlugin(pluginInput(client, dir), { enabled: false, storeDir: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("a tick-driven wake is journaled and consumes the run", async () => {
    const dir = await tmp()
    try {
      const { client, calls } = stubClient()
      const hooks: any = await schedulePlugin(pluginInput(client, dir), { storeDir: dir, tickSeconds: 1 })
      const c = ctx("ses_ctx", dir)
      const created = await hooks.tool.schedule.execute(
        { action: "create", prompt: "tick me", after: "+1s", sessionID: "ses_ctx" },
        c,
      )
      const id = firstId(created.output)
      expect(id.length).toBeGreaterThan(4)
      const entry = await waitForRun(path.join(dir, "runs.jsonl"), id, 6000)
      expect(entry).not.toBeNull()
      expect((entry as any).status).toBe("ok")
      expect(calls.some((x) => x.kind === "prompt")).toBe(true)
      await schedulePlugin(pluginInput(client, dir), { enabled: false, storeDir: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
