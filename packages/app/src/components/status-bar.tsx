import { createMemo, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ThinkingModeSelector } from "@/components/thinking-mode-selector"
import { ModelQuickSwitch } from "@/components/model-quick-switch"

export function StatusBar() {
  const sync = useSync()
  const { params } = useSessionLayout()

  const currentSession = createMemo(() => sync.data.session.find((s) => s.id === params.id))

  const agentName = createMemo(() => currentSession()?.agent ?? "—")

  const mcpCount = createMemo(() => {
    const servers = sync.data.mcp ?? {}
    return Object.values(servers).filter((s) => s.status === "connected").length
  })

  const lspCount = createMemo(() => {
    const servers = sync.data.lsp ?? []
    return servers.filter((s) => s.status === "connected").length
  })

  return (
    <div class="flex items-center justify-between h-6 px-3 bg-background-stronger border-t border-border-weaker-base text-12-regular text-text-weak">
      <div class="flex items-center gap-3">
        <span>Agent: {agentName()}</span>
        <ModelQuickSwitch />
        <ThinkingModeSelector />
      </div>
      <div class="flex items-center gap-3">
        <span>MCP: {mcpCount()} connected</span>
        <Show when={lspCount() > 0}>
          <span>LSP: {lspCount()}</span>
        </Show>
        <span>1:1</span>
      </div>
    </div>
  )
}
