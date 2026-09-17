import path from "path"
import type { Todo } from "./todo"
import type { InstanceContext } from "@/project/instance-context"
import { Global } from "@opencode-ai/core/global"

export const TODO_PROJECTION_LIMIT = 8

export function pathFor(sessionID: string, instance: InstanceContext) {
  const base = instance.project.vcs
    ? path.join(instance.worktree, ".opencode", "plans")
    : path.join(Global.Path.data, "plans")
  return path.join(base, `${sessionID}.md`)
}

export function projectTodos(todos: readonly Todo.Info[], limit = TODO_PROJECTION_LIMIT) {
  if (todos.length <= limit) return { todos: [...todos], indexes: todos.map((_, index) => index), omitted: 0 }
  const active = todos.findIndex((todo) => todo.status === "in_progress")
  const focus =
    active < 0
      ? Math.max(
          0,
          todos.findIndex((todo) => todo.status === "pending"),
        )
      : active
  const selected = new Set([0, todos.length - 1])
  for (let index = Math.max(0, focus - 2); index <= Math.min(todos.length - 1, focus + 3); index++) selected.add(index)
  for (let index = 0; selected.size < limit && index < todos.length; index++) selected.add(index)
  const indexes = [...selected].sort((a, b) => a - b).slice(0, limit)
  return { todos: indexes.map((index) => todos[index]), indexes, omitted: todos.length - indexes.length }
}

export function render(input: { sessionID: string; planPath: string; todos: readonly Todo.Info[] }) {
  return [
    "# Session work plan",
    "",
    `- Session: ${input.sessionID}`,
    `- Stable reference: opencode://session/${input.sessionID}/plan`,
    `- Updated: ${new Date().toISOString()}`,
    "",
    "## Execution phases",
    "",
    ...input.todos.map(
      (todo, index) =>
        `- [${todo.status === "completed" ? "x" : " "}] P${index + 1} · ${todo.status} · ${todo.priority} — ${todo.content}`,
    ),
    "",
    "This file is the complete persistent plan. Keep one todo per phase and expand only the active phase with detailed substeps.",
  ].join("\n")
}

export function reference(input: { sessionID: string; planPath: string; todos: readonly Todo.Info[] }) {
  const active = input.todos.find((todo) => todo.status === "in_progress")
  const count = (status: string) => input.todos.filter((todo) => todo.status === status).length
  return [
    `<work_plan source="AGENTS.md" ref="opencode://session/${input.sessionID}/plan">`,
    `Persistent plan: ${path.normalize(input.planPath)}`,
    `Progress: ${count("completed")} completed, ${count("in_progress")} active, ${count("pending")} pending, ${count("cancelled")} cancelled.`,
    active ? `Active phase: ${active.content}` : "Active phase: none.",
    "Read the referenced file when full detail is needed; do not inject its full content every turn.",
    "</work_plan>",
  ].join("\n")
}

export * as SessionWorkPlan from "./work-plan"
