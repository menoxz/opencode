import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { decode64 } from "@/utils/base64"
import { SettingsList } from "./settings-list"

type Skill = {
  name: string
  description?: string
  location: string
  content: string
}

export const SettingsSkills: Component = () => {
  const language = useLanguage()
  const params = useParams()
  const globalSdk = useServerSDK()

  const dir = createMemo(() => decode64(params.dir))
  const [expanded, setExpanded] = createSignal<string | null>(null)

  const [skills] = createResource(
    () => dir(),
    (directory) =>
      globalSdk.client.app
        .skills({ directory: directory || undefined })
        .then((res) => res.data ?? [])
        .catch(() => [] as Skill[]),
    { initialValue: [] as Skill[] },
  )

  const sorted = createMemo(() => [...skills.latest].sort((a, b) => a.name.localeCompare(b.name)))

  const toggle = (name: string) => setExpanded((current) => (current === name ? null : name))

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.skills.title")}</h2>
          <p class="text-12-regular text-text-weak">{language.t("settings.skills.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-1 max-w-[720px]">
        <SettingsList>
          <Show
            when={sorted().length > 0}
            fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.skills.empty")}</div>}
          >
            <For each={sorted()}>
              {(skill) => (
                <div class="flex flex-col gap-1.5 py-3 border-b border-border-weak-base last:border-none">
                  <button
                    type="button"
                    class="flex items-start justify-between gap-3 bg-transparent border-none p-0 text-left cursor-pointer"
                    onClick={() => toggle(skill.name)}
                  >
                    <div class="flex flex-col min-w-0 gap-0.5">
                      <span class="text-14-medium text-text-strong truncate">{skill.name}</span>
                      <Show when={skill.description}>
                        <span class="text-12-regular text-text-weak">{skill.description}</span>
                      </Show>
                      <span class="text-11-regular text-text-weaker truncate">{skill.location}</span>
                    </div>
                    <Icon
                      name={expanded() === skill.name ? "chevron-down" : "chevron-right"}
                      class="shrink-0 text-icon-weak-base mt-1"
                    />
                  </button>
                  <Show when={expanded() === skill.name}>
                    <pre class="text-11-regular text-text-weak whitespace-pre-wrap break-words bg-surface-inset-base rounded-md p-3 max-h-[320px] overflow-y-auto">
                      {skill.content}
                    </pre>
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
