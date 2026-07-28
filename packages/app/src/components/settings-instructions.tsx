import { type Component, For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { useParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { SettingsList } from "./settings-list"
import type { JSX } from "solid-js"

interface RowProps {
  title: string
  description: string
  children: JSX.Element
}

const Row: Component<RowProps> = (props) => {
  return (
    <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-14-medium text-text-strong">{props.title}</span>
        <span class="text-12-regular text-text-weak">{props.description}</span>
      </div>
      <div class="flex w-full justify-end sm:w-auto sm:shrink-0">{props.children}</div>
    </div>
  )
}

export const SettingsInstructions: Component = () => {
  const language = useLanguage()
  const params = useParams()
  const globalSdk = useServerSDK()
  const serverSync = useServerSync()

  const dir = createMemo(() => decode64(params.dir))

  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const paths = createMemo(() => serverSync.data.config.instructions ?? [])
  const injection = createMemo(() => serverSync.data.config.instruction_injection ?? {})

  const [agentsMd] = createResource(
    () => dir(),
    (directory) => {
      if (!directory) return Promise.resolve(undefined)
      return globalSdk.client.file
        .read({ path: "AGENTS.md", directory })
        .then((res) => res.data)
        .catch(() => undefined)
    },
  )

  const [agentsMdDraft, setAgentsMdDraft] = createSignal<string | null>(null)
  const [savingAgentsMd, setSavingAgentsMd] = createSignal(false)

  createEffect(() => {
    if (agentsMdDraft() !== null) return
    if (agentsMd.loading) return
    setAgentsMdDraft(agentsMd()?.content ?? "")
  })

  const saveAgentsMd = () => {
    const directory = dir()
    if (!directory) return
    const content = agentsMdDraft()
    if (content === null) return

    setSavingAgentsMd(true)
    void globalSdk.client.file
      .write({ path: "AGENTS.md", directory, content })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.instructions.toast.agentsMdSaved.title"),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => setSavingAgentsMd(false))
  }

  const persistPaths = (next: string[]) => {
    setBusy(true)
    return serverSync
      .updateConfig({ instructions: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.instructions.toast.saved.title"),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => setBusy(false))
  }

  const addPath = () => {
    const value = draft().trim()
    if (!value) return
    if (paths().includes(value)) {
      showToast({ title: language.t("settings.plugins.toast.duplicate.title") })
      return
    }
    void persistPaths([...paths(), value]).then(() => setDraft(""))
  }

  const removePath = (value: string) => {
    void persistPaths(paths().filter((item) => item !== value))
  }

  const setInjection = (key: "agents" | "skills" | "synthetic", value: string) => {
    void serverSync.updateConfig({ instruction_injection: { ...injection(), [key]: value } }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    })
  }

  const agentsOptions = [
    { value: "full", label: language.t("settings.instructions.injection.option.full") },
    { value: "summary", label: language.t("settings.instructions.injection.option.summary") },
    { value: "off", label: language.t("settings.instructions.injection.option.off") },
  ]
  const skillsOptions = [
    { value: "full", label: language.t("settings.instructions.injection.option.full") },
    { value: "summary", label: language.t("settings.instructions.injection.option.summary") },
    { value: "caveman", label: language.t("settings.instructions.injection.option.caveman") },
  ]
  const syntheticOptions = [
    { value: "normal", label: language.t("settings.instructions.injection.option.normal") },
    { value: "compact", label: language.t("settings.instructions.injection.option.compact") },
    { value: "caveman", label: language.t("settings.instructions.injection.option.caveman") },
  ]

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.instructions.title")}</h2>
          <p class="text-12-regular text-text-weak">{language.t("settings.instructions.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.instructions.section.paths")}</h3>
          <div class="flex items-end gap-2 pb-2">
            <TextField
              label={language.t("settings.instructions.add.label")}
              hideLabel
              placeholder={language.t("settings.instructions.add.placeholder")}
              value={draft()}
              onChange={setDraft}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Enter") addPath()
              }}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              disabled={busy()}
              class="flex-1"
            />
            <Button
              size="small"
              variant="secondary"
              icon="plus-small"
              disabled={busy() || !draft().trim()}
              onClick={addPath}
            >
              {language.t("common.add")}
            </Button>
          </div>
          <SettingsList>
            <Show
              when={paths().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">{language.t("settings.instructions.empty")}</div>
              }
            >
              <For each={paths()}>
                {(item) => (
                  <div class="flex items-center justify-between gap-3 py-3 border-b border-border-weak-base last:border-none">
                    <span class="text-13-regular text-text-strong truncate">{item}</span>
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      disabled={busy()}
                      aria-label={language.t("common.remove")}
                      onClick={() => removePath(item)}
                    />
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.instructions.section.injection")}</h3>
          <SettingsList>
            <Row
              title={language.t("settings.instructions.injection.agents.title")}
              description={language.t("settings.instructions.injection.agents.description")}
            >
              <Select
                options={agentsOptions}
                current={agentsOptions.find((o) => o.value === (injection().agents ?? "full"))}
                value={(o) => o.value}
                label={(o) => o.label}
                onSelect={(option) => option && setInjection("agents", option.value)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
              />
            </Row>
            <Row
              title={language.t("settings.instructions.injection.skills.title")}
              description={language.t("settings.instructions.injection.skills.description")}
            >
              <Select
                options={skillsOptions}
                current={skillsOptions.find((o) => o.value === (injection().skills ?? "full"))}
                value={(o) => o.value}
                label={(o) => o.label}
                onSelect={(option) => option && setInjection("skills", option.value)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
              />
            </Row>
            <Row
              title={language.t("settings.instructions.injection.synthetic.title")}
              description={language.t("settings.instructions.injection.synthetic.description")}
            >
              <Select
                options={syntheticOptions}
                current={syntheticOptions.find((o) => o.value === (injection().synthetic ?? "normal"))}
                value={(o) => o.value}
                label={(o) => o.label}
                onSelect={(option) => option && setInjection("synthetic", option.value)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
              />
            </Row>
          </SettingsList>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-14-medium text-text-strong">{language.t("settings.instructions.section.editor")}</h3>
            <Button
              size="small"
              variant="primary"
              disabled={savingAgentsMd() || agentsMdDraft() === null || !dir()}
              onClick={saveAgentsMd}
            >
              {savingAgentsMd() ? language.t("common.saving") : language.t("common.save")}
            </Button>
          </div>
          <p class="text-12-regular text-text-weak pb-1">{language.t("settings.instructions.editor.note")}</p>
          <TextField
            label={language.t("settings.instructions.section.editor")}
            hideLabel
            multiline
            value={agentsMdDraft() ?? ""}
            onChange={setAgentsMdDraft}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            disabled={agentsMdDraft() === null}
            class="min-h-[320px] font-mono"
          />
        </div>
      </div>
    </div>
  )
}
