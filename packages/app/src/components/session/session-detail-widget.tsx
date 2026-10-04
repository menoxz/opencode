import { Show, createMemo } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useProviders } from "@/hooks/use-providers"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { getSessionContextMetrics } from "./session-context-metrics"
import { generationTokensPerSecond } from "@opencode-ai/core/util/token-speed"
import { GoalTab } from "./goal-tab"
import { TodoTab } from "./todo-tab"
import { MCPTab } from "./mcp-tab"
import { LSPTab } from "./lsp-tab"

/**
 * Vertical "TUI-style" session detail widget:
 *
 *   Context
 *   488 849 tokens
 *   49% used
 *   55 tok/s
 *   $75.43 spent
 *
 *   ▶ TASK CONTRACT
 *   ▶ MCP (8 active)
 *   LSP
 *     • pyright  ...
 *   ▶ Todo
 *
 *   /path/to/project
 *   OpenCode 1.18.87
 *
 * Composes the existing goal/mcp/lsp/todo tab components (kept usable
 * standalone in the legacy tab bar) rather than reimplementing them, per
 * docs/plans/desktop-gui-modules-plan.md (Module 1).
 */
export function SessionDetailWidget(props: { class?: string }) {
  const sync = useSync()
  const sdk = useSDK()
  const platform = usePlatform()
  const language = useLanguage()
  const providers = useProviders()
  const dialog = useDialog()
  const { params } = useSessionLayout()

  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const metrics = createMemo(() => getSessionContextMetrics(messages(), [...providers.all().values()]))
  const context = createMemo(() => metrics().context)

  const usd = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        style: "currency",
        currency: "USD",
      }),
  )
  const cost = createMemo(() => usd().format(metrics().totalCost))

  const tokenSpeed = createMemo(() => {
    const ctx = context()
    if (!ctx) return undefined
    const value = generationTokensPerSecond({
      parts: sync.data.part[ctx.message.id],
      output: ctx.message.tokens.output,
      reasoning: ctx.message.tokens.reasoning,
    })
    if (value === undefined) return undefined
    return value >= 10 ? Math.round(value).toLocaleString(language.intl()) : value.toFixed(1)
  })

  const openGoalEdit = () => {
    void import("@/components/dialog-goal-edit").then((x) => {
      dialog.show(() => <x.DialogGoalEdit />)
    })
  }

  return (
    <div
      data-component="session-detail-widget"
      class="h-full flex flex-col overflow-hidden min-w-0"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      {/* Context block: always visible */}
      <div class="shrink-0 px-3 py-3 border-b border-border-weaker-base flex flex-col gap-1">
        <span class="text-12-regular text-text-strong font-semibold">Context</span>
        <Show
          when={context()}
          fallback={<span class="text-12-regular text-text-weak">No active session</span>}
        >
          {(ctx) => (
            <div class="flex flex-col gap-0.5">
              <span class="text-12-regular text-text-strong">
                {ctx().total.toLocaleString(language.intl())} tokens
              </span>
              <Show when={ctx().usage !== null && ctx().usage !== undefined}>
                <span class="text-12-regular text-text-weak">{ctx().usage}% used</span>
              </Show>
              <Show when={tokenSpeed()}>
                {(speed) => <span class="text-12-regular text-text-weak">{speed()} tok/s</span>}
              </Show>
              <span class="text-12-regular text-text-weak">{cost()} spent</span>
            </div>
          )}
        </Show>
      </div>

      {/* Collapsible sections */}
      <div class="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        <GoalTab onEdit={openGoalEdit} />
        <MCPTab />
        <LSPTab collapsible={false} />
        <TodoTab />
      </div>

      {/* Footer: project path + opencode version */}
      <div class="shrink-0 px-3 py-2 border-t border-border-weaker-base flex flex-col gap-0.5 min-w-0">
        <span class="text-11-regular text-text-weak truncate" title={sdk.directory}>
          {sdk.directory}
        </span>
        <span class="text-11-regular text-text-weaker">OpenCode {platform.version ?? "—"}</span>
      </div>
    </div>
  )
}
