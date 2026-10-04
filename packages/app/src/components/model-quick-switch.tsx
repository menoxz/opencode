import { Show } from "solid-js"
import { useLocal } from "@/context/local"
import { useLanguage } from "@/context/language"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ModelSelectorPopover } from "@/components/dialog-select-model"

type ModelState = ReturnType<typeof useLocal>["model"]

/**
 * Compact "current model" button that opens the existing `ModelSelectorPopover`
 * (from `./dialog-select-model`, which exports `DialogSelectModel` for the
 * full dialog and `ModelSelectorPopover` for this lighter inline trigger).
 * Mirrors the trigger markup already used inline in `prompt-input.tsx`, but
 * extracted as a standalone component with no dependency on prompt-input's
 * internal focus/style plumbing, so it can be dropped into the StatusBar or
 * any other toolbar as-is.
 */
export function ModelQuickSwitch(props: { model?: ModelState; class?: string }) {
  const local = useLocal()
  const model = props.model ?? local.model
  const language = useLanguage()

  return (
    <Tooltip placement="top" value={language.t("command.model.choose")}>
      <ModelSelectorPopover
        model={model}
        triggerAs={Button}
        triggerProps={{
          variant: "ghost",
          size: "normal",
          class: `min-w-0 max-w-[220px] justify-start gap-1.5 text-12-regular text-text-weak group ${props.class ?? ""}`,
          "data-action": "model-quick-switch",
        }}
      >
        <Show when={model.current()?.provider?.id}>
          <ProviderIcon
            id={model.current()?.provider?.id ?? ""}
            class="size-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-150"
          />
        </Show>
        <span class="truncate">{model.current()?.name ?? language.t("dialog.model.select.title")}</span>
        <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
      </ModelSelectorPopover>
    </Tooltip>
  )
}
