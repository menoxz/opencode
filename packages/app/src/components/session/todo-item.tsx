import type { Todo } from "@opencode-ai/sdk/v2"

interface TodoItemProps {
  status: Todo["status"]
  content: Todo["content"]
}

export function TodoItem(props: TodoItemProps) {
  const statusIcon = () => {
    if (props.status === "completed") return "✓"
    if (props.status === "in_progress") return "•"
    return " "
  }

  const statusColor = () => {
    if (props.status === "in_progress") return "var(--syntax-warning)"
    return "var(--text-weak)"
  }

  const textColor = () => {
    if (props.status === "in_progress") return "var(--syntax-warning)"
    return "var(--text-weak)"
  }

  return (
    <div class="flex flex-row gap-1">
      <span
        class="text-12-regular shrink-0"
        style={{ color: statusColor() }}
      >
        [{statusIcon()}]
      </span>
      <span
        class="text-12-regular whitespace-pre-wrap break-words min-w-0"
        style={{ color: textColor() }}
      >
        {props.content}
      </span>
    </div>
  )
}
