import { createHash } from "node:crypto"

export type TodoItem = { content: string; status: string; priority: string }
export type TodoSummary = ReturnType<typeof summarizeTodos>
export type TodoChange = Partial<TodoItem> & { id: string }
export type TodoOutput = {
  version: 1
  summary: TodoSummary
  revision: string
  ids: string[]
  changed: TodoChange[]
  removed: string[]
  unchanged: number
  noOp: boolean
}

export function todoRevision(todos: readonly TodoItem[]) {
  return createHash("sha256").update(JSON.stringify(todos.map((t) => [t.content, t.status, t.priority]))).digest("hex")
}

export function mandatoryKind(content: string) {
  const marker = /^\s*\[(RESEARCH|CLOSE|CLOSURE)\]/i.exec(content)?.[1]?.toUpperCase()
  return marker === "RESEARCH" ? "research" : marker ? "close" : undefined
}

/** Status/priority changes, reorder and wrappers never query the skill catalogue. */
export function substantiveTodoText(before: readonly TodoItem[], after: readonly TodoItem[]) {
  const existing = new Set(before.map((t) => t.content))
  return [...new Set(after.filter((t) =>
    !mandatoryKind(t.content) && !existing.has(t.content) && (t.status === "pending" || t.status === "in_progress"),
  ).map((t) => t.content))].join("\n")
}

export function summarizeTodos(todos: readonly TodoItem[]) {
  return {
    total: todos.length,
    pending: todos.filter((t) => t.status === "pending").length,
    in_progress: todos.filter((t) => t.status === "in_progress").length,
    completed: todos.filter((t) => t.status === "completed").length,
    cancelled: todos.filter((t) => t.status === "cancelled").length,
    other: todos.filter((t) => !["pending", "in_progress", "completed", "cancelled"].includes(t.status)).length,
  }
}

export function todoDelta(before: readonly TodoItem[], after: readonly TodoItem[]): TodoOutput {
  const changed = after.flatMap((t, i) => {
    const old = before[i]
    const fields = {
      ...(!old || old.content !== t.content ? { content: t.content } : {}),
      ...(!old || old.status !== t.status ? { status: t.status } : {}),
      ...(!old || old.priority !== t.priority ? { priority: t.priority } : {}),
    }
    return Object.keys(fields).length ? [{ id: `t${i}`, ...fields }] : []
  })
  const removed = before.flatMap((_, i) => i >= after.length ? [`t${i}`] : [])
  return {
    version: 1,
    summary: summarizeTodos(after),
    revision: todoRevision(after),
    ids: after.map((_, i) => `t${i}`),
    changed,
    removed,
    unchanged: after.length - changed.length,
    noOp: changed.length === 0 && removed.length === 0,
  }
}

export function renderTodoDelta(output: TodoOutput) {
  if (output.noOp) return `Todos unchanged. r=${output.revision}`
  return JSON.stringify({
    summary: output.summary,
    revision: output.revision,
    changed: output.changed,
    ...(output.removed.length ? { removed: output.removed } : {}),
  })
}

/** Replay the latest FULL UI snapshot, never a historical delta. No service imports. */
export function renderTodoSnapshot(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || !("todos" in metadata) || !Array.isArray(metadata.todos)) return undefined
  const todos: TodoItem[] = []
  for (const item of metadata.todos) {
    if (!item || typeof item !== "object" || typeof item.content !== "string" || typeof item.status !== "string" || typeof item.priority !== "string") return undefined
    todos.push({ content: item.content, status: item.status, priority: item.priority })
  }
  return JSON.stringify({
    summary: summarizeTodos(todos),
    revision: todoRevision(todos),
    todos: todos.map((t, i) => ({ id: `t${i}`, ...t })),
  })
}

export function todoSnapshotOrder(metadata: unknown): { scope: string; sequence: number } | undefined {
  if (!metadata || typeof metadata !== "object" || !("todoOrder" in metadata)) return
  const order = metadata.todoOrder
  if (!order || typeof order !== "object" || !("scope" in order) || !("sequence" in order)) return
  if (typeof order.scope !== "string" || typeof order.sequence !== "number" || !Number.isSafeInteger(order.sequence) || order.sequence < 1) return
  return { scope: order.scope, sequence: order.sequence }
}
