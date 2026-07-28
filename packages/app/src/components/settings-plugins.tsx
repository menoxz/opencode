import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { SettingsList } from "./settings-list"

type PluginEntry = string | [string, Record<string, unknown>]

function pluginName(entry: PluginEntry) {
  return Array.isArray(entry) ? entry[0] : entry
}

function pluginOptions(entry: PluginEntry) {
  return Array.isArray(entry) ? entry[1] : undefined
}

export const SettingsPlugins: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()

  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const entries = createMemo<PluginEntry[]>(() => serverSync.data.config.plugin ?? [])

  const persist = (next: PluginEntry[]) => {
    setBusy(true)
    return serverSync
      .updateConfig({ plugin: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.plugins.toast.saved.title"),
          description: language.t("settings.plugins.toast.saved.description"),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => setBusy(false))
  }

  const add = () => {
    const value = draft().trim()
    if (!value) return
    if (entries().some((entry) => pluginName(entry) === value)) {
      showToast({ title: language.t("settings.plugins.toast.duplicate.title") })
      return
    }
    void persist([...entries(), value]).then(() => setDraft(""))
  }

  const remove = (name: string) => {
    void persist(entries().filter((entry) => pluginName(entry) !== name))
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.plugins.title")}</h2>
          <p class="text-12-regular text-text-weak">{language.t("settings.plugins.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-4 max-w-[720px]">
        <div class="flex items-end gap-2">
          <TextField
            label={language.t("settings.plugins.add.label")}
            hideLabel
            placeholder={language.t("settings.plugins.add.placeholder")}
            value={draft()}
            onChange={setDraft}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === "Enter") add()
            }}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            disabled={busy()}
            class="flex-1"
          />
          <Button size="small" variant="secondary" icon="plus-small" disabled={busy() || !draft().trim()} onClick={add}>
            {language.t("common.add")}
          </Button>
        </div>

        <SettingsList>
          <Show
            when={entries().length > 0}
            fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.plugins.empty")}</div>}
          >
            <For each={entries()}>
              {(entry) => (
                <div class="flex items-center justify-between gap-3 py-3 border-b border-border-weak-base last:border-none">
                  <div class="flex flex-col min-w-0 gap-0.5">
                    <span class="text-14-medium text-text-strong truncate">{pluginName(entry)}</span>
                    <Show when={pluginOptions(entry)}>
                      {(options) => (
                        <span class="text-11-regular text-text-weaker truncate">{JSON.stringify(options())}</span>
                      )}
                    </Show>
                  </div>
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    disabled={busy()}
                    aria-label={language.t("common.remove")}
                    onClick={() => remove(pluginName(entry))}
                  />
                </div>
              )}
            </For>
          </Show>
        </SettingsList>
      </div>
    </div>
  )
}
