import { createMemo, createSignal, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Message, Part, AssistantMessage } from "@opencode-ai/sdk/v2/client"

type ExportFormat = "markdown" | "json" | "text"

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "markdown", label: "Markdown" },
  { id: "json", label: "JSON" },
  { id: "text", label: "Text" },
]

function formatTokens(value: number | undefined): string {
  if (value == null) return "—"
  return value.toLocaleString()
}

function formatCost(value: number | undefined): string {
  if (value == null) return "—"
  return `$${value.toFixed(6)}`
}

function buildExportContent(
  messages: Message[],
  parts: Record<string, Part[] | undefined>,
  format: ExportFormat,
): string {
  if (format === "json") {
    const data = messages.map((msg) => ({
      role: msg.role,
      id: msg.id,
      time: msg.time,
      ...(msg.role === "assistant"
        ? {
            modelID: (msg as AssistantMessage).modelID,
            providerID: (msg as AssistantMessage).providerID,
            cost: (msg as AssistantMessage).cost,
            tokens: (msg as AssistantMessage).tokens,
          }
        : {}),
      content: (parts[msg.id] ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n"),
    }))
    return JSON.stringify(data, null, 2)
  }

  const lines: string[] = []

  for (const msg of messages) {
    const role = msg.role.toUpperCase()
    const textParts = (parts[msg.id] ?? []).filter((p) => p.type === "text") as { text: string }[]
    const text = textParts.map((p) => p.text).join("\n")

    if (format === "markdown") {
      lines.push(`### ${role} — ${msg.id}`, "")
      if (text) lines.push(text, "")
      if (msg.role === "assistant") {
        const a = msg as AssistantMessage
        const meta = [`Model: ${a.providerID}/${a.modelID}`, `Cost: $${a.cost.toFixed(6)}`]
        lines.push(`> ${meta.join(" · ")}`, "")
      }
    } else {
      // plain text
      lines.push(`[${role}] ${msg.id}`)
      if (text) lines.push(text)
      lines.push("")
    }
  }

  return lines.join("\n")
}

const emptyMessages: Message[] = []

export interface DialogExportOptionsProps {
  sessionID: string
}

export function DialogExportOptions(props: DialogExportOptionsProps) {
  const sync = useSync()
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()

  const [format, setFormat] = createSignal<ExportFormat>("markdown")
  const [copied, setCopied] = createSignal(false)

  const info = createMemo(() => sync.session.get(props.sessionID))

  const messages = createMemo(() => {
    return (sync.data.message[props.sessionID] ?? emptyMessages) as Message[]
  })

  const getParts = (id: string) => (sync.data.part[id] ?? []) as Part[]

  const cost = createMemo(() => {
    const msgs = messages()
    return msgs.reduce((sum, msg) => sum + (msg.role === "assistant" ? (msg as AssistantMessage).cost : 0), 0)
  })

  const tokenStats = createMemo(() => {
    const msgs = messages()
    let input = 0
    let output = 0
    let reasoning = 0
    for (const msg of msgs) {
      if (msg.role === "assistant") {
        const a = msg as AssistantMessage
        input += a.tokens.input
        output += a.tokens.output
        reasoning += a.tokens.reasoning
      }
    }
    return { input, output, reasoning, total: input + output + reasoning }
  })

  const sessionModel = createMemo(() => {
    const s = info()
    if (!s?.model) return null
    return s.model
  })

  const exportContent = createMemo(() => {
    return buildExportContent(messages(), sync.data.part as Record<string, Part[] | undefined>, format())
  })

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportContent())
      setCopied(true)
      showToast({ title: language.t("common.copiedToClipboard") ?? "Copied to clipboard" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast({ title: language.t("common.requestFailed") ?? "Failed to copy" })
    }
  }

  const handleDownload = async () => {
    const ext = format() === "json" ? "json" : format() === "markdown" ? "md" : "txt"
    const filename = `session-${props.sessionID.slice(0, 8)}.${ext}`
    const content = exportContent()

    // Prefer native save dialog if available (desktop)
    if (platform.saveFilePickerDialog) {
      try {
        const path = await platform.saveFilePickerDialog({ defaultPath: filename })
        if (!path) return
        // Write via fetch to a blob URL or use the server-side save
        // On Tauri, we send the content as a download
        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        showToast({ title: "Downloaded" })
      } catch {
        showToast({ title: language.t("common.requestFailed") ?? "Download failed" })
      }
    } else {
      // Fallback: browser download
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <Dialog title={language.t("dialog.exportOptions.title") ?? "Export Session"} size="normal">
      <div class="flex flex-col gap-4">
        {/* Metrics summary */}
        <div class="grid grid-cols-2 gap-3 p-3 rounded-md bg-surface-base border border-border-base">
          <div class="flex flex-col gap-1">
            <span class="text-11-regular text-text-weak">
              {language.t("context.stats.totalCost") ?? "Total Cost"}
            </span>
            <span class="text-13-medium text-text-strong">{formatCost(cost())}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-11-regular text-text-weak">
              {language.t("context.stats.totalTokens") ?? "Total Tokens"}
            </span>
            <span class="text-13-medium text-text-strong">{formatTokens(tokenStats().total)}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-11-regular text-text-weak">
              {language.t("context.stats.inputTokens") ?? "Input Tokens"}
            </span>
            <span class="text-13-medium text-text-strong">{formatTokens(tokenStats().input)}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-11-regular text-text-weak">
              {language.t("context.stats.outputTokens") ?? "Output Tokens"}
            </span>
            <span class="text-13-medium text-text-strong">{formatTokens(tokenStats().output)}</span>
          </div>
          <Show when={tokenStats().reasoning > 0}>
            <div class="flex flex-col gap-1">
              <span class="text-11-regular text-text-weak">
                {language.t("context.stats.reasoningTokens") ?? "Reasoning Tokens"}
              </span>
              <span class="text-13-medium text-text-strong">{formatTokens(tokenStats().reasoning)}</span>
            </div>
          </Show>
          <Show when={sessionModel()}>
            {(m) => (
              <div class="flex flex-col gap-1 col-span-2">
                <span class="text-11-regular text-text-weak">
                  {language.t("context.stats.model") ?? "Model"}
                </span>
                <span class="text-13-medium text-text-strong">
                  {m().providerID}/{m().id}
                  <Show when={m().variant}>
                    {" "}
                    <span class="text-text-weaker">({m().variant})</span>
                  </Show>
                </span>
              </div>
            )}
          </Show>
        </div>

        {/* Format selector */}
        <div class="flex flex-col gap-2">
          <span class="text-12-regular text-text-weak">
            {language.t("dialog.exportOptions.format") ?? "Export Format"}
          </span>
          <div class="flex gap-2">
            <For each={FORMATS}>
              {(fmt) => (
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium transition-colors"
                  classList={{
                    "bg-primary-base text-white": format() === fmt.id,
                    "bg-surface-base border border-border-base text-text-strong hover:bg-surface-hover":
                      format() !== fmt.id,
                  }}
                  onClick={() => setFormat(fmt.id)}
                >
                  <Show when={format() === fmt.id}>
                    <Icon name="check-small" size="small" />
                  </Show>
                  {fmt.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Action buttons */}
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-border-base">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium bg-surface-base border border-border-base text-text-strong hover:bg-surface-hover transition-colors"
            onClick={handleCopy}
          >
            <Icon name={copied() ? "check-small" : "copy"} size="small" />
            {copied()
              ? language.t("common.copied") ?? "Copied!"
              : language.t("common.copy") ?? "Copy"}
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium bg-surface-base border border-border-base text-text-strong hover:bg-surface-hover transition-colors"
            onClick={handleDownload}
          >
            <Icon name="download" size="small" />
            {language.t("common.download") ?? "Download"}
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium bg-surface-base border border-border-base text-text-strong hover:bg-surface-hover transition-colors"
            onClick={() => dialog.close()}
          >
            <Icon name="close" size="small" />
            {language.t("common.close") ?? "Close"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
