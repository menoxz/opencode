import { type Component, For, Show, createMemo, createResource } from "solid-js"
import { useParams } from "@solidjs/router"
import { Tag } from "@opencode-ai/ui/tag"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { SettingsList } from "./settings-list"
import type { McpStatus } from "@opencode-ai/sdk/v2/client"

const STATUS_COLOR: Record<string, string> = {
  connected: "#22c55e",
  failed: "#ef4444",
  disabled: "#6b7280",
  needs_auth: "#f97316",
  needs_client_registration: "#ef4444",
}

type SecretLabelKey = "settings.mcp.envCount" | "settings.mcp.headerCount"

type Row = {
  name: string
  status: string
  error?: string
  kind: "local" | "remote" | "unknown"
  detail?: string
  secretLabel?: SecretLabelKey
  secretCount?: number
}

export const SettingsMcp: Component = () => {
  const language = useLanguage()
  const params = useParams()
  const globalSdk = useServerSDK()
  const serverSync = useServerSync()

  const dir = createMemo(() => decode64(params.dir))

  const [status] = createResource(
    () => dir(),
    (directory) =>
      globalSdk.client.mcp
        .status({ directory: directory || undefined })
        .then((res) => res.data ?? {})
        .catch(() => ({}) as Record<string, McpStatus>),
    { initialValue: {} as Record<string, McpStatus> },
  )

  const rows = createMemo<Row[]>(() => {
    const configured = serverSync.data.config.mcp ?? {}
    const statusMap = status.latest
    const names = new Set([...Object.keys(statusMap), ...Object.keys(configured)])

    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const entry = configured[name]
        const state = statusMap[name]

        const isLocal = !!entry && "type" in entry && entry.type === "local"
        const isRemote = !!entry && "type" in entry && entry.type === "remote"

        return {
          name,
          status: state?.status ?? "disabled",
          error: state && "error" in state ? state.error : undefined,
          kind: isLocal ? "local" : isRemote ? "remote" : "unknown",
          detail: isLocal ? entry.command.join(" ") : isRemote ? entry.url : undefined,
          secretLabel: isLocal ? "settings.mcp.envCount" : isRemote ? "settings.mcp.headerCount" : undefined,
          secretCount: isLocal
            ? Object.keys(entry.environment ?? {}).length
            : isRemote
              ? Object.keys(entry.headers ?? {}).length
              : undefined,
        } satisfies Row
      })
  })

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.mcp.title")}</h2>
          <p class="text-12-regular text-text-weak">{language.t("settings.mcp.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-1 max-w-[720px]">
        <SettingsList>
          <Show
            when={rows().length > 0}
            fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.mcp.empty")}</div>}
          >
            <For each={rows()}>
              {(row) => (
                <div class="flex flex-col gap-1 py-3 border-b border-border-weak-base last:border-none">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="shrink-0 rounded-full"
                      style={{
                        width: "8px",
                        height: "8px",
                        "background-color": STATUS_COLOR[row.status] ?? "#6b7280",
                      }}
                    />
                    <span class="text-14-medium text-text-strong truncate">{row.name}</span>
                    <Tag>{row.kind}</Tag>
                    <span class="text-12-regular text-text-weak">{row.status}</span>
                  </div>
                  <Show when={row.detail}>
                    <span class="text-11-regular text-text-weaker truncate pl-4">{row.detail}</span>
                  </Show>
                  <Show when={row.secretLabel && row.secretCount}>
                    <span class="text-11-regular text-text-weaker pl-4">
                      {language.t(row.secretLabel ?? "settings.mcp.envCount", { count: row.secretCount ?? 0 })}
                    </span>
                  </Show>
                  <Show when={row.error}>
                    <span class="text-11-regular pl-4" style={{ color: "var(--text-danger)" }}>
                      {row.error}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </SettingsList>
      </div>
    </div>
  )
}
