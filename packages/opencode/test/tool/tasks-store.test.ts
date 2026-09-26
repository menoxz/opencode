import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { TasksStore } from "@/tool/tasks-store"

const scratch = () => fs.mkdtemp(path.join(os.tmpdir(), "tasks-store-"))

describe("tasks-store.merge", () => {
  test("config wins over workspace, which wins over the store", () => {
    const merged = TasksStore.merge({
      config: { dev: { command: "from-config" } },
      workspace: { dev: { command: "from-workspace" }, test: { command: "ws-test" } },
      store: { dev: { command: "from-store" }, test: { command: "store-test" }, solo: { command: "store-solo" } },
    })
    expect(merged.get("dev")).toEqual({ name: "dev", task: { command: "from-config" }, source: "config" })
    expect(merged.get("test")?.source).toBe("workspace")
    expect(merged.get("solo")?.source).toBe("store")
  })

  test("no sources yield an empty registry", () => {
    expect(TasksStore.merge({}).size).toBe(0)
  })
})

describe("tasks-store persistence", () => {
  test("a missing store reads as empty and round-trips", async () => {
    const dir = await scratch()
    expect(await TasksStore.readStore(dir)).toEqual({})
    const task = { command: "bun typecheck", description: "types", timeout: 120_000 }
    await TasksStore.writeStore(dir, { check: task })
    expect(await TasksStore.readStore(dir)).toEqual({ check: task })
  })

  test("a malformed store is treated as empty rather than fatal", async () => {
    const dir = await scratch()
    await fs.mkdir(path.dirname(TasksStore.storePath(dir)), { recursive: true })
    await fs.writeFile(TasksStore.storePath(dir), "{ not json", "utf8")
    expect(await TasksStore.readStore(dir)).toEqual({})
  })

  test("the store lives under .opencode/tasks.json", () => {
    const dir = path.join(os.tmpdir(), "root")
    expect(TasksStore.storePath(dir)).toBe(path.join(dir, ".opencode", "tasks.json"))
  })
})

describe("tasks-store.logPath", () => {
  test("a task name can never escape the log directory", () => {
    const dir = path.join(os.tmpdir(), "root")
    const logs = path.join(dir, ".opencode", "tasks-logs")
    for (const name of ["dev", "../../evil", "a/b\\c", "..\\..\\win"])
      expect(path.dirname(TasksStore.logPath(dir, name))).toBe(logs)
  })
})

describe("tasks-store run registry", () => {
  test("background runs are tracked per directory and can be cleared", () => {
    const run = { pid: 1234, name: "server", command: "bun dev", startedAt: 1, logFile: "x.log" }
    TasksStore.recordRun("dir-a", run)
    expect(TasksStore.getRun("dir-a", "server")).toEqual(run)
    expect(TasksStore.listRuns("dir-a").length).toBe(1)
    expect(TasksStore.getRun("dir-b", "server")).toBeUndefined()
    TasksStore.clearRun("dir-a", "server")
    expect(TasksStore.listRuns("dir-a").length).toBe(0)
  })

  test("isAlive recognises this process and rejects an unused pid", () => {
    expect(TasksStore.isAlive(process.pid)).toBe(true)
    expect(TasksStore.isAlive(0)).toBe(false)
  })
})
