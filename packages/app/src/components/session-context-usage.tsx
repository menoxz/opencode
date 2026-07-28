import { Match, Show, Switch, createMemo, createSignal } from "solid-js"
import { Tooltip, type TooltipProps } from "@opencode-ai/ui/tooltip"
import { ProgressCircle } from "@opencode-ai/ui/progress-circle"
import { Button } from "@opencode-ai/ui/button"

import { useFile } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"

interface SessionContextUsageProps {
  variant?: "button" | "indicator"
  placement?: TooltipProps["placement"]
}

function openSessionContext(args: {
  view: ReturnType<ReturnType<typeof useLayout>["view"]>
  layout: ReturnType<typeof useLayout>
  tabs: ReturnType<ReturnType<typeof useLayout>["tabs"]>
}) {
  if (!args.view.reviewPanel.opened()) args.view.reviewPanel.open()
  if (args.layout.fileTree.opened() && args.layout.fileTree.tab() !== "all") args.layout.fileTree.setTab("all")
  void args.tabs.open("context")
  args.tabs.setActive("context")
}

export function SessionContextUsage(props: SessionContextUsageProps) {
  const sync = useSync()
  const file = useFile()
  const layout = useLayout()
  const language = useLanguage()
  const providers = useProviders()
  const { params, tabs, view } = useSessionLayout()

  const variant = createMemo(() => props.variant ?? "button")
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  })
  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))

  const usd = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        style: "currency",
        currency: "USD",
      }),
  )

  const metrics = createMemo(() => getSessionContextMetrics(messages(), [...providers.all().values()]))
  const context = createMemo(() => metrics().context)
  const cost = createMemo(() => {
    return usd().format(metrics().totalCost)
  })

  function formatK(n: number | undefined): string {
    if (n === undefined || n <= 0) return ""
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`
    return String(n)
  }

  const tokenSpeed = createMemo(() => {
    const msgs = messages()
    const last = msgs.findLast(
      (m): m is typeof m & { role: "assistant"; tokens: { output: number }; time: { created: number; completed?: number } } =>
        m.role === "assistant" && !!(m as any).tokens && (m as any).tokens.output > 0,
    )
    if (!last) return undefined
    const created = last.time?.created
    const completed = (last.time as { completed?: number } | undefined)?.completed
    if (!created || !completed) return undefined
    const elapsed = (completed - created) / 1000
    if (elapsed <= 0) return undefined
    const speed = last.tokens.output / elapsed
    if (!Number.isFinite(speed) || speed <= 0) return undefined
    return speed >= 10 ? Math.round(speed).toLocaleString() : speed.toFixed(1)
  })

  const compactLabel = createMemo(() => {
    const ctx = context()
    if (!ctx) return ""
    const tokens = `${formatK(ctx.total)}/${formatK(ctx.limit)}${ctx.usage !== null && ctx.usage !== undefined ? ` (${ctx.usage}%)` : ""}`
    const parts = [tokens, tokenSpeed() ? `${tokenSpeed()} tok/s` : undefined]
    return parts.filter(Boolean).join(" . ")
  })

  const openContext = () => {
    if (!params.id) return

    if (tabState.activeTab() === "context") {
      tabs().close("context")
      return
    }
    openSessionContext({
      view: view(),
      layout,
      tabs: tabs(),
    })
  }

  const circle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle size={16} strokeWidth={2} percentage={context()?.usage ?? 0} />
    </div>
  )

  const tooltipValue = () => (
    <div>
      <Show when={context()}>
        {(ctx) => (
          <>
            <div class="flex items-center gap-2">
              <span class="text-text-invert-strong">{ctx().total.toLocaleString(language.intl())}</span>
              <span class="text-text-invert-base">{language.t("context.usage.tokens")}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-text-invert-strong">{ctx().usage ?? 0}%</span>
              <span class="text-text-invert-base">{language.t("context.usage.usage")}</span>
            </div>
            <Show when={compactLabel()}>
              <div class="flex items-center gap-2">
                <span class="text-text-invert-strong">{compactLabel()}</span>
              </div>
            </Show>
          </>
        )}
      </Show>
      <div class="flex items-center gap-2">
        <span class="text-text-invert-strong">{cost()}</span>
        <span class="text-text-invert-base">{language.t("context.usage.cost")}</span>
      </div>
    </div>
  )

  return (
    <Show when={params.id}>
      <Tooltip value={tooltipValue()} placement={props.placement ?? "top"}>
        <Switch>
          <Match when={variant() === "indicator"}>{circle()}</Match>
          <Match when={true}>
            <Button
              type="button"
              variant="ghost"
              class="size-6"
              onClick={openContext}
              aria-label={language.t("context.usage.view")}
            >
              {circle()}
            </Button>
          </Match>
        </Switch>
      </Tooltip>
    </Show>
  )
}
