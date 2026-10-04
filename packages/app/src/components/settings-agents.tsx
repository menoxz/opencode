import { type Component, For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { Accordion } from "@opencode-ai/ui/accordion"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Select } from "@opencode-ai/ui/select"
import { Switch } from "@opencode-ai/ui/switch"
import { Tag } from "@opencode-ai/ui/tag"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { SettingsList } from "./settings-list"
import type { Agent, AgentConfig, PermissionRuleConfig } from "@opencode-ai/sdk/v2/client"

const PERMISSION_KEYS = [
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "bash",
  "task",
  "external_directory",
  "todowrite",
  "question",
  "webfetch",
  "websearch",
  "repo_clone",
  "repo_overview",
  "lsp",
  "doom_loop",
  "skill",
] as const

const PERMISSION_ACTIONS = ["ask", "allow", "deny"] as const

const PERMISSION_ACTION_LABEL_KEY = {
  ask: "settings.agents.permission.action.ask",
  allow: "settings.agents.permission.action.allow",
  deny: "settings.agents.permission.action.deny",
} as const

type AgentDraft = {
  model: string
  variant: string
  temperature: string
  topP: string
  maxSteps: string
  color: string
  prompt: string
  disable: boolean
  hidden: boolean
  tools: Record<string, boolean>
  permission: Record<string, PermissionRuleConfig>
}

function isPermissionObject(value: unknown): value is Record<string, PermissionRuleConfig> {
  return typeof value === "object" && value !== null
}

function draftFor(agent: Agent, override: AgentConfig | undefined): AgentDraft {
  const permissionOverride = override?.permission
  const permission = isPermissionObject(permissionOverride) ? permissionOverride : {}

  return {
    model: override?.model ?? (agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : ""),
    variant: override?.variant ?? agent.variant ?? "",
    temperature:
      override?.temperature !== undefined
        ? String(override.temperature)
        : agent.temperature !== undefined
          ? String(agent.temperature)
          : "",
    topP:
      override?.top_p !== undefined
        ? String(override.top_p)
        : agent.topP !== undefined
          ? String(agent.topP)
          : "",
    maxSteps:
      override?.maxSteps !== undefined
        ? String(override.maxSteps)
        : agent.steps !== undefined
          ? String(agent.steps)
          : "",
    color: override?.color ?? agent.color ?? "",
    prompt: override?.prompt ?? agent.prompt ?? "",
    disable: override?.disable ?? false,
    hidden: override?.hidden ?? agent.hidden ?? false,
    tools: { ...override?.tools },
    permission: { ...permission },
  }
}

function parseOptionalNumber(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const value = raw.trim()
  if (!value) return { ok: true, value: undefined }
  const n = Number(value)
  if (Number.isNaN(n)) return { ok: false }
  return { ok: true, value: n }
}

export const SettingsAgents: Component = () => {
  const language = useLanguage()
  const params = useParams()
  const globalSdk = useServerSDK()
  const serverSync = useServerSync()

  const dir = createMemo(() => decode64(params.dir))

  const [agentsRes, { refetch: refetchAgents }] = createResource(
    () => dir(),
    (directory) =>
      globalSdk.client.app
        .agents({ directory: directory || undefined })
        .then((res) => res.data ?? [])
        .catch(() => [] as Agent[]),
    { initialValue: [] as Agent[] },
  )

  const [toolIdsRes] = createResource(
    () => dir(),
    (directory) =>
      globalSdk.client.tool
        .ids({ directory: directory || undefined })
        .then((res) => res.data ?? [])
        .catch(() => [] as string[]),
    { initialValue: [] as string[] },
  )

  const sortedAgents = createMemo(() => [...agentsRes.latest].sort((a, b) => a.name.localeCompare(b.name)))

  const [drafts, setDrafts] = createStore<Record<string, AgentDraft>>({})
  const [busy, setBusy] = createSignal(false)
  const [openItems, setOpenItems] = createSignal<string[]>([])

  createEffect(() => {
    for (const agent of sortedAgents()) {
      if (drafts[agent.name]) continue
      setDrafts(agent.name, draftFor(agent, serverSync.data.config.agent?.[agent.name]))
    }
  })

  const defaultAgentOptions = createMemo(() => sortedAgents().map((agent) => ({ value: agent.name, label: agent.name })))

  const setDefaultAgent = (name: string) => {
    void serverSync.updateConfig({ default_agent: name }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    })
  }

  const save = (agent: Agent) => {
    const draft = drafts[agent.name]
    if (!draft) return

    if (draft.model.trim() && !draft.model.includes("/")) {
      showToast({ title: language.t("settings.agents.toast.invalidModel") })
      return
    }

    const temperature = parseOptionalNumber(draft.temperature)
    const topP = parseOptionalNumber(draft.topP)
    const maxSteps = parseOptionalNumber(draft.maxSteps)

    if (!temperature.ok || !topP.ok || !maxSteps.ok) {
      showToast({ title: language.t("settings.agents.toast.invalidNumber") })
      return
    }

    const nextEntry: AgentConfig = { ...serverSync.data.config.agent?.[agent.name] }

    const model = draft.model.trim()
    if (model) nextEntry.model = model
    else delete nextEntry.model

    const variant = draft.variant.trim()
    if (variant) nextEntry.variant = variant
    else delete nextEntry.variant

    const color = draft.color.trim()
    if (color) nextEntry.color = color
    else delete nextEntry.color

    const prompt = draft.prompt.trim()
    if (prompt) nextEntry.prompt = prompt
    else delete nextEntry.prompt

    if (temperature.value !== undefined) nextEntry.temperature = temperature.value
    else delete nextEntry.temperature

    if (topP.value !== undefined) nextEntry.top_p = topP.value
    else delete nextEntry.top_p

    if (maxSteps.value !== undefined) nextEntry.maxSteps = maxSteps.value
    else delete nextEntry.maxSteps

    nextEntry.disable = draft.disable
    nextEntry.hidden = draft.hidden

    if (Object.keys(draft.tools).length > 0) nextEntry.tools = { ...draft.tools }
    else delete nextEntry.tools

    if (Object.keys(draft.permission).length > 0) nextEntry.permission = { ...draft.permission }
    else delete nextEntry.permission

    const nextAgentConfig = { ...serverSync.data.config.agent, [agent.name]: nextEntry }

    setBusy(true)
    void serverSync
      .updateConfig({ agent: nextAgentConfig })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.agents.toast.saved.title", { name: agent.name }),
        })
        return refetchAgents()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => setBusy(false))
  }

  const AgentRow: Component<{ agent: Agent }> = (props) => {
    const draft = createMemo(() => drafts[props.agent.name])

    const modeLabel = createMemo(() => {
      if (props.agent.mode === "primary") return language.t("settings.agents.mode.primary")
      if (props.agent.mode === "subagent") return language.t("settings.agents.mode.subagent")
      return language.t("settings.agents.mode.all")
    })

    const remainingTools = createMemo(() => {
      const used = new Set(Object.keys(draft()?.tools ?? {}))
      return toolIdsRes.latest.filter((id) => !used.has(id)).map((id) => ({ value: id, label: id }))
    })

    const remainingPermissionKeys = createMemo(() => {
      const used = new Set(Object.keys(draft()?.permission ?? {}))
      return PERMISSION_KEYS.filter((key) => !used.has(key)).map((key) => ({ value: key, label: key }))
    })

    const permissionShorthand = createMemo(() => {
      const override = serverSync.data.config.agent?.[props.agent.name]?.permission
      return typeof override === "string" ? override : undefined
    })

    return (
      <Accordion.Item value={props.agent.name}>
        <Accordion.Header>
          <Accordion.Trigger>
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span
                class="shrink-0 rounded-full"
                style={{ width: "8px", height: "8px", "background-color": props.agent.color || "var(--text-weak)" }}
              />
              <span class="text-14-medium text-text-strong truncate">{props.agent.name}</span>
              <Tag>{modeLabel()}</Tag>
              <Show when={props.agent.native}>
                <Tag>{language.t("settings.agents.native")}</Tag>
              </Show>
              <Show when={props.agent.description}>
                <span class="text-12-regular text-text-weak truncate">{props.agent.description}</span>
              </Show>
            </div>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <Show when={draft()}>
            {(current) => (
              <div class="flex flex-col gap-4 py-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField
                    label={language.t("settings.agents.field.model.label")}
                    placeholder={language.t("settings.agents.field.model.placeholder")}
                    value={current().model}
                    onChange={(value) => setDrafts(props.agent.name, "model", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                  <TextField
                    label={language.t("settings.agents.field.variant.label")}
                    value={current().variant}
                    onChange={(value) => setDrafts(props.agent.name, "variant", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                  <TextField
                    label={language.t("settings.agents.field.temperature.label")}
                    value={current().temperature}
                    onChange={(value) => setDrafts(props.agent.name, "temperature", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                  <TextField
                    label={language.t("settings.agents.field.topP.label")}
                    value={current().topP}
                    onChange={(value) => setDrafts(props.agent.name, "topP", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                  <TextField
                    label={language.t("settings.agents.field.maxSteps.label")}
                    value={current().maxSteps}
                    onChange={(value) => setDrafts(props.agent.name, "maxSteps", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                  <TextField
                    label={language.t("settings.agents.field.color.label")}
                    placeholder={language.t("settings.agents.field.color.placeholder")}
                    value={current().color}
                    onChange={(value) => setDrafts(props.agent.name, "color", value)}
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                  />
                </div>

                <TextField
                  label={language.t("settings.agents.field.prompt.label")}
                  multiline
                  value={current().prompt}
                  onChange={(value) => setDrafts(props.agent.name, "prompt", value)}
                  spellcheck={false}
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  class="min-h-[96px]"
                />

                <div class="flex flex-wrap gap-6">
                  <div class="flex items-center gap-2">
                    <Switch
                      checked={current().disable}
                      onChange={(checked) => setDrafts(props.agent.name, "disable", checked)}
                    />
                    <div class="flex flex-col">
                      <span class="text-13-medium text-text-strong">{language.t("settings.agents.field.disable.title")}</span>
                      <span class="text-11-regular text-text-weak">
                        {language.t("settings.agents.field.disable.description")}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <Switch
                      checked={current().hidden}
                      onChange={(checked) => setDrafts(props.agent.name, "hidden", checked)}
                    />
                    <div class="flex flex-col">
                      <span class="text-13-medium text-text-strong">{language.t("settings.agents.field.hidden.title")}</span>
                      <span class="text-11-regular text-text-weak">
                        {language.t("settings.agents.field.hidden.description")}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col gap-2">
                  <span class="text-13-medium text-text-strong">{language.t("settings.agents.section.tools")}</span>
                  <Show when={remainingTools().length > 0}>
                    <Select
                      options={remainingTools()}
                      current={undefined}
                      value={(o) => o.value}
                      label={(o) => o.label}
                      placeholder={language.t("settings.agents.tools.add.placeholder")}
                      onSelect={(option) => option && setDrafts(props.agent.name, "tools", option.value, true)}
                      variant="secondary"
                      size="small"
                      triggerVariant="settings"
                    />
                  </Show>
                  <Show
                    when={Object.keys(current().tools).length > 0}
                    fallback={<span class="text-11-regular text-text-weak">{language.t("settings.agents.tools.empty")}</span>}
                  >
                    <div class="flex flex-col gap-1">
                      <For each={Object.entries(current().tools)}>
                        {([id, enabled]) => (
                          <div class="flex items-center justify-between gap-2 py-1">
                            <span class="text-12-regular text-text-strong truncate">{id}</span>
                            <div class="flex items-center gap-2">
                              <Select
                                options={[
                                  { value: "true", label: language.t("settings.agents.tools.enabled") },
                                  { value: "false", label: language.t("settings.agents.tools.disabled") },
                                ]}
                                current={{
                                  value: enabled ? "true" : "false",
                                  label: enabled
                                    ? language.t("settings.agents.tools.enabled")
                                    : language.t("settings.agents.tools.disabled"),
                                }}
                                value={(o) => o.value}
                                label={(o) => o.label}
                                onSelect={(option) =>
                                  option && setDrafts(props.agent.name, "tools", id, option.value === "true")
                                }
                                variant="secondary"
                                size="small"
                                triggerVariant="settings"
                              />
                              <IconButton
                                icon="trash"
                                variant="ghost"
                                aria-label={language.t("common.remove")}
                                onClick={() =>
                                  setDrafts(
                                    props.agent.name,
                                    "tools",
                                    produce((tools: Record<string, boolean>) => {
                                      delete tools[id]
                                    }),
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                <div class="flex flex-col gap-2">
                  <span class="text-13-medium text-text-strong">{language.t("settings.agents.section.permission")}</span>
                  <span class="text-11-regular text-text-weak">{language.t("settings.agents.permission.description")}</span>
                  <Show when={permissionShorthand()}>
                    {(shorthand) => (
                      <div class="flex items-center justify-between gap-2 py-1">
                        <span class="text-12-regular text-text-weak">
                          {language.t("settings.agents.permission.complexRule")}: {shorthand()}
                        </span>
                        <Button size="small" variant="secondary" onClick={() => setDrafts(props.agent.name, "permission", {})}>
                          {language.t("common.remove")}
                        </Button>
                      </div>
                    )}
                  </Show>
                  <Show when={remainingPermissionKeys().length > 0}>
                    <Select
                      options={remainingPermissionKeys()}
                      current={undefined}
                      value={(o) => o.value}
                      label={(o) => o.label}
                      placeholder={language.t("settings.agents.permission.add.placeholder")}
                      onSelect={(option) => option && setDrafts(props.agent.name, "permission", option.value, "ask")}
                      variant="secondary"
                      size="small"
                      triggerVariant="settings"
                    />
                  </Show>
                  <Show
                    when={Object.keys(current().permission).length > 0}
                    fallback={
                      <span class="text-11-regular text-text-weak">{language.t("settings.agents.permission.empty")}</span>
                    }
                  >
                    <div class="flex flex-col gap-1">
                      <For each={Object.entries(current().permission)}>
                        {([key, value]) => (
                          <div class="flex items-center justify-between gap-2 py-1">
                            <span class="text-12-regular text-text-strong truncate">{key}</span>
                            <div class="flex items-center gap-2">
                              <Show
                                when={typeof value === "string" ? value : undefined}
                                fallback={
                                  <span class="text-11-regular text-text-weaker truncate max-w-[200px]">
                                    {JSON.stringify(value)}
                                  </span>
                                }
                              >
                                {(action) => (
                                  <Select
                                    options={PERMISSION_ACTIONS.map((option) => ({
                                      value: option,
                                      label: language.t(PERMISSION_ACTION_LABEL_KEY[option]),
                                    }))}
                                    current={{
                                      value: action(),
                                      label: language.t(PERMISSION_ACTION_LABEL_KEY[action()]),
                                    }}
                                    value={(o) => o.value}
                                    label={(o) => o.label}
                                    onSelect={(option) =>
                                      option && setDrafts(props.agent.name, "permission", key, option.value)
                                    }
                                    variant="secondary"
                                    size="small"
                                    triggerVariant="settings"
                                  />
                                )}
                              </Show>
                              <IconButton
                                icon="trash"
                                variant="ghost"
                                aria-label={language.t("common.remove")}
                                onClick={() =>
                                  setDrafts(
                                    props.agent.name,
                                    "permission",
                                    produce((permission: Record<string, PermissionRuleConfig>) => {
                                      delete permission[key]
                                    }),
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                <div class="flex justify-end">
                  <Button size="small" variant="primary" disabled={busy()} onClick={() => save(props.agent)}>
                    {busy() ? language.t("common.saving") : language.t("common.save")}
                  </Button>
                </div>
              </div>
            )}
          </Show>
        </Accordion.Content>
      </Accordion.Item>
    )
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.agents.title")}</h2>
          <p class="text-12-regular text-text-weak">{language.t("settings.agents.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-4 max-w-[720px]">
        <SettingsList>
          <div class="flex flex-wrap items-center gap-4 py-3 sm:flex-nowrap">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-14-medium text-text-strong">{language.t("settings.agents.defaultAgent.title")}</span>
              <span class="text-12-regular text-text-weak">{language.t("settings.agents.defaultAgent.description")}</span>
            </div>
            <Select
              options={defaultAgentOptions()}
              current={defaultAgentOptions().find((o) => o.value === serverSync.data.config.default_agent)}
              value={(o) => o.value}
              label={(o) => o.label}
              onSelect={(option) => option && setDefaultAgent(option.value)}
              variant="secondary"
              size="small"
              triggerVariant="settings"
            />
          </div>
        </SettingsList>

        <Show
          when={sortedAgents().length > 0}
          fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.agents.empty")}</div>}
        >
          <Accordion multiple value={openItems()} onChange={setOpenItems} class="flex flex-col gap-2">
            <For each={sortedAgents()}>{(agent) => <AgentRow agent={agent} />}</For>
          </Accordion>
        </Show>
      </div>
    </div>
  )
}
