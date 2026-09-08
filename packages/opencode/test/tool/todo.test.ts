import { afterEach, describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { Skill } from "@/skill"
import { Session } from "@/session/session"
import { Todo } from "@/session/todo"
import { MessageID } from "@/session/schema"
import { TodoWriteTool } from "@/tool/todo"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { InstanceState } from "@/effect/instance-state"
import { renderTodoSnapshot, substantiveTodoText, todoDelta, todoRevision } from "@/tool/todo-output"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)

const it = testEffect(Layer.mergeAll(Agent.defaultLayer, Skill.defaultLayer, Todo.defaultLayer, Session.defaultLayer, Truncate.defaultLayer))
const item = (content: string, status = "pending", priority = "medium") => ({ content, status, priority })
const seed = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ title: "Todo output test" })
  const info = yield* TodoWriteTool
  const tool = yield* info.init()
  const asks: string[] = []
  const ctx: Tool.Context = {
    sessionID: session.id,
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: (request) => Effect.sync(() => { asks.push(request.permission) }),
  }
  return { tool, info, ctx, asks, todo: yield* Todo.Service }
})

describe("todowrite real service / SQLite", () => {
  it.instance("first save, full UI, delta/removal, no-op, closure alias and completed wrapper preservation", () => Effect.gen(function* () {
    const { tool, ctx, todo, asks } = yield* seed
    const first = yield* tool.execute({ todos: [item("Run bun test --timeout 30000"), item("Obsolete", "cancelled")] }, ctx)
    expect(first.metadata.todos).toHaveLength(4)
    expect(first.output).toContain("[RESEARCH]")
    expect(first.output).toContain("[CLOSE]")
    expect(first.metadata.todoOutput.summary).toEqual({ total: 4, pending: 3, in_progress: 0, completed: 0, cancelled: 1, other: 0 })
    expect(yield* todo.get(ctx.sessionID)).toEqual(first.metadata.todos)
    expect(first.metadata.todoOutput.ids).toEqual(["t0", "t1", "t2", "t3"])
    const done = yield* tool.execute({ todos: first.metadata.todos.map((t) => ({ ...t, status: "completed" })) }, ctx)
    expect(done.title).toBe("0 active todos")
    expect(done.output).not.toContain("Run bun test")
    const omitted = yield* tool.execute({ todos: [item("Run bun test --timeout 30000", "completed")] }, ctx)
    expect(omitted.metadata.todos).toHaveLength(3)
    expect(omitted.metadata.todos.every((t) => t.status === "completed")).toBe(true)
    expect(omitted.metadata.todoOutput.removed).toEqual(["t3"])
    const same = yield* tool.execute({ todos: omitted.metadata.todos }, ctx)
    expect(same.output).toBe(`Todos unchanged. r=${omitted.metadata.todoOutput.revision}`)
    expect(same.metadata.todoOutput.unchanged).toBe(3)
    const alias = yield* tool.execute({ todos: [item(" [research] done", "completed"), item("  [cLoSuRe] done", "completed")] }, ctx)
    expect(alias.metadata.todos).toHaveLength(2)
    expect(alias.output).not.toContain("[CLOSE]")
    expect(asks.every((permission) => permission === "todowrite")).toBe(true)
  }))

  it.instance("targeted fields, read recovery, stale/invalid IDs and modes are atomic", () => Effect.gen(function* () {
    const { tool, ctx, todo } = yield* seed
    const first = yield* tool.execute({ todos: [item("Task A"), item("Task A")] }, ctx)
    const revision = first.metadata.todoOutput.revision
    const next = yield* tool.execute({ revision, updates: [{ id: "t2", status: "in_progress", priority: "high", content: "Task B" }] }, ctx)
    expect(next.metadata.todos[1]).toEqual(item("Task A"))
    expect(next.metadata.todos[2]).toEqual(item("Task B", "in_progress", "high"))
    expect(next.metadata.todoOutput.revision).not.toBe(revision)
    const current = next.metadata.todoOutput.revision
    const invalid = [
      { revision, updates: [{ id: "t1", status: "completed" as const }] },
      { updates: [{ id: "t1", status: "completed" as const }] },
      { revision: current, updates: [{ id: "t1", status: "completed" as const }, { id: "t99", status: "completed" as const }] },
      { revision: current, updates: [{ id: "t1", status: "completed" as const }, { id: "t1", priority: "low" as const }] },
      { revision: current, updates: [{ id: "t1" }] },
      { revision: current, updates: [{ id: "t0", content: "Lost wrapper" }] },
      { revision: current, updates: [{ id: "t0", status: "cancelled" as const }] },
      {}, { todos: [], updates: [] }, { action: "read" as const, todos: [] },
      { todos: [], revision: current },
    ]
    for (const args of invalid) {
      const result = yield* Effect.exit(tool.execute(args, ctx))
      expect(Exit.isFailure(result)).toBe(true)
      expect(yield* todo.get(ctx.sessionID)).toEqual(next.metadata.todos)
    }
    const read = yield* tool.execute({ action: "read" }, ctx)
    expect(read.metadata.todoOrder.scope).toBe(next.metadata.todoOrder.scope)
    expect(read.metadata.todoOrder.sequence).toBeGreaterThan(next.metadata.todoOrder.sequence)
    expect(read.metadata.todoOutput.revision).toBe(current)
    expect(renderTodoSnapshot(next.metadata)).toBe(read.output)
    expect(yield* todo.get(ctx.sessionID)).toEqual(next.metadata.todos)
    const last = yield* tool.execute({ revision: current, updates: [{ id: "t1", status: "completed" }] }, ctx)
    expect(last.metadata.todoOrder.sequence).toBeGreaterThan(read.metadata.todoOrder.sequence)
    expect(last.metadata.todos[1].status).toBe("completed")
  }))

  it.instance("concurrent same-revision writes across per-turn init handles allow exactly one winner", () => Effect.gen(function* () {
    const { tool, info, ctx, todo } = yield* seed
    const first = yield* tool.execute({ todos: [item("Atomic task")] }, ctx)
    const second = yield* info.init()
    const earlierRead = yield* second.execute({ action: "read" }, ctx)
    expect(earlierRead.metadata.todoOrder.scope).toBe(first.metadata.todoOrder.scope)
    expect(earlierRead.metadata.todoOrder.sequence).toBeGreaterThan(first.metadata.todoOrder.sequence)
    const args = { revision: first.metadata.todoOutput.revision, updates: [{ id: "t1", status: "completed" as const }] }
    const results = yield* Effect.all([tool.execute(args, ctx).pipe(Effect.exit), second.execute(args, ctx).pipe(Effect.exit)], { concurrency: "unbounded" })
    expect(results.filter(Exit.isSuccess)).toHaveLength(1)
    const failures = results.filter(Exit.isFailure)
    expect(failures).toHaveLength(1)
    expect(Cause.pretty(failures[0].cause)).toContain("Stale or missing todo revision")
    expect((yield* todo.get(ctx.sessionID))[1].status).toBe("completed")
  }))

  it.instance("permission denial prevents writes; suggestions respect available skills and skip non-content changes", () => Effect.gen(function* () {
    const directory = yield* InstanceState.directory
    for (const name of ["todo-skill-one", "todo-skill-two", "todo-skill-three", "todo-skill-four", "todo-skill-denied"]) {
      yield* Effect.promise(() => Bun.write(`${directory}/.opencode/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: todo skill test typescript security\n---\nUse for todo skill testing.\n`))
    }
    const { tool, ctx, todo } = yield* seed
    const denied = yield* Effect.exit(tool.execute({ todos: [item("test typescript security")] }, { ...ctx, ask: () => Effect.die(new Error("denied")) }))
    expect(Exit.isFailure(denied)).toBe(true)
    expect(yield* todo.get(ctx.sessionID)).toEqual([])
    const first = yield* tool.execute({ todos: [item("test typescript security")] }, ctx)
    const names = [...first.output.matchAll(/skill\(([^)]+)\)/g)].map((m) => m[1])
    const available = yield* (yield* Skill.Service).available(yield* (yield* Agent.Service).get(ctx.agent))
    expect(names.length).toBe(3)
    expect(names).not.toContain("todo-skill-denied")
    expect(names.every((name) => available.some((skill) => skill.name === name))).toBe(true)
    const next = yield* tool.execute({ todos: first.metadata.todos.map((t) => ({ ...t, priority: "high", status: "in_progress" })) }, ctx)
    expect(next.output).not.toContain("Skills:")
  }), { config: { permission: { skill: { "*": "allow", "todo-skill-denied": "deny" } } } })

  it.instance("legacy stored lists stay positional on targeted updates and long commands stay verbatim", () => Effect.gen(function* () {
    const { tool, ctx, todo } = yield* seed
    yield* todo.update({ sessionID: ctx.sessionID, todos: [item("Legacy task")] })
    const read = yield* tool.execute({ action: "read" }, ctx)
    const command = "bun test " + "--verbatim-arg ".repeat(4000)
    const result = yield* tool.execute({ revision: read.metadata.todoOutput.revision, updates: [{ id: "t0", content: command }] }, ctx)
    expect(result.metadata.todos).toEqual([item(command)])
    expect(result.output).toContain(command)
    expect(result.metadata.truncated).toBe(false)
    expect(yield* todo.get(ctx.sessionID)).toEqual(result.metadata.todos)
  }))

  it.instance("measure full legacy versus compact and targeted input/output bytes", () => Effect.gen(function* () {
    const { tool, ctx } = yield* seed
    const todos = Array.from({ length: 20 }, (_, i) => item(`Verify scenario ${i}: bun test test/tool/scenario-${i}.test.ts --timeout 30000`))
    const first = yield* tool.execute({ todos }, ctx)
    const updated = first.metadata.todos.map((t, i) => i === 1 ? { ...t, status: "completed" } : t)
    const input = { revision: first.metadata.todoOutput.revision, updates: [{ id: "t1", status: "completed" as const }] }
    const result = yield* tool.execute(input, ctx)
    const legacySuggestions = "\n── Skill Suggestions ──\n  • api-testing — load with skill(\"api-testing\")\n──────────────────────\n⚠️  Auto-suggestion may miss relevant skills — verify the list and browse skills/ if needed."
    const bytes = (s: string) => Buffer.byteLength(s)
    const oldOutput = bytes(JSON.stringify(updated, null, 2) + legacySuggestions)
    const newOutput = bytes(result.output)
    const oldInput = bytes(JSON.stringify({ todos: updated }))
    const newInput = bytes(JSON.stringify(input))
    console.log("TODO_BYTES", JSON.stringify({ oldInput, oldOutput, newInput, newOutput, oldTotal: oldInput + oldOutput, newTotal: newInput + newOutput }))
    expect(newInput + newOutput).toBeLessThan((oldInput + oldOutput) / 4)
  }))
})

test("pure replay, exact revision, deltas, substantive lookup gate and verbatim long content", () => {
  const before = [item("[RESEARCH] test"), item("Backlog command"), item("[CLOSURE] test")]
  expect(substantiveTodoText(before, before.map((t) => ({ ...t, status: "in_progress", priority: "high" })))).toBe("")
  expect(substantiveTodoText(before, [...before].reverse())).toBe("")
  expect(substantiveTodoText(before, [...before, item("New command"), item("[CLOSE] new")])).toBe("New command")
  expect(substantiveTodoText([], [item("Already done", "completed"), item("Cancelled", "cancelled")])).toBe("")
  expect(todoRevision(before)).not.toBe(todoRevision([...before].reverse()))
  expect(todoRevision(before)).not.toBe(todoRevision(before.map((t) => ({ ...t, priority: "high" }))))
  expect(todoRevision(before)).toBe(todoRevision(before.map((t) => ({ priority: t.priority, status: t.status, content: t.content }))))
  expect(renderTodoSnapshot({ todos: before })).toContain("Backlog command")
  expect(renderTodoSnapshot({ todos: [] })).toContain('"todos":[]')
  expect(renderTodoSnapshot({ todos: [{ status: "pending" }] })).toBeUndefined()
  expect(renderTodoSnapshot(undefined)).toBeUndefined()
  const command = "bun test " + "--verbatim-arg ".repeat(1000)
  expect(todoDelta([], [item(command)]).changed[0].content).toBe(command)
})
