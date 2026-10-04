import { createMemo, createSignal, Show, onMount, onCleanup } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"

interface FilePreviewProps {
  path: string
  sessionID?: string
}

export function FilePreview(props: FilePreviewProps) {
  const sdk = useSDK()
  const [content, setContent] = createSignal("")
  const [originalContent, setOriginalContent] = createSignal("")
  const [editing, setEditing] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [language, setLanguage] = createSignal("")

  const hasChanges = createMemo(() => content() !== originalContent())

  onMount(async () => {
    try {
      const data = await sdk.client.file.read({ path: props.path })
      const text = data.data?.content || ""
      setContent(text)
      setOriginalContent(text)
      const ext = props.path.split(".").pop()?.toLowerCase()
      setLanguage(langForExt(ext))
    } catch {
      // file read failed — content stays empty, component shows blank editor
    }
    setLoading(false)
  })

  const handleSave = async () => {
    if (!hasChanges()) return
    setSaving(true)
    try {
      const data = await sdk.client.file.write({ path: props.path, content: content() })
      const text = data.data?.content ?? content()
      setContent(text)
      setOriginalContent(text)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: "Failed to save file", description: message })
    }
    setSaving(false)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault()
      void handleSave()
    }
    if (e.key === "Escape" && editing()) {
      setContent(originalContent())
      setEditing(false)
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown))
  })

  if (loading()) {
    return <div class="flex items-center justify-center h-full text-14-regular text-text-weak">Loading...</div>
  }

  return (
    <div class="flex flex-col h-full bg-background-base">
      {/* Toolbar */}
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-border-weaker-base bg-background-stronger">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-13-medium text-text-strong truncate max-w-60">{props.path}</span>
          <span class="text-11-regular text-text-weaker px-1.5 py-0.5 rounded bg-background-base">{language()}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <Show when={hasChanges()}>
            <span class="w-2 h-2 rounded-full bg-danger" title="Unsaved changes" />
          </Show>
          <Show when={!editing()}>
            <button
              class="px-2 py-1 rounded text-12-medium bg-accent text-white hover:opacity-90"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          </Show>
          <Show when={editing()}>
            <button
              class="px-2 py-1 rounded text-12-medium bg-background-base text-text-strong border border-border-weaker-base hover:bg-overlay-hover"
              onClick={() => { setContent(originalContent()); setEditing(false) }}
            >
              Cancel
            </button>
            <button
              class="px-2 py-1 rounded text-12-medium bg-accent text-white hover:opacity-90 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving()}
            >
              {saving() ? "Saving..." : "Save"}
            </button>
          </Show>
        </div>
      </div>

      {/* Editor */}
      <div class="flex-1 overflow-auto">
        <textarea
          class="w-full h-full p-4 font-mono text-13-regular text-text-strong bg-background-base resize-none outline-none border-none"
          style={{ "line-height": "1.5", "tab-size": 2 }}
          value={content()}
          onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
          readonly={!editing()}
          spellcheck={false}
        />
      </div>

      {/* Status bar */}
      <div class="flex items-center justify-between px-3 py-1 border-t border-border-weaker-base bg-background-stronger text-11-regular text-text-weaker">
        <span>{language().toUpperCase()}</span>
        <span>
          {content().split("\n").length} lines | {(new TextEncoder().encode(content()).length / 1024).toFixed(1)} KB
        </span>
        <Show when={hasChanges()}>
          <span class="text-warning">Unsaved</span>
        </Show>
      </div>
    </div>
  )
}

function langForExt(ext: string | undefined): string {
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sql: "sql",
    sh: "shell",
    ps1: "powershell",
    bat: "batch",
    dockerfile: "dockerfile",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
  }
  return map[ext || ""] || ext || "text"
}
