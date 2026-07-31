import { createMemo, createSignal } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useToast } from "@tui/ui/toast"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "../context/sdk"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"

export function DialogVisionModel() {
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()
  const showExtra = createMemo(() => connected())

  const currentVisionModel = createMemo(() => {
    return sync.data.config.attachment?.image?.vision_model
  })

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0

    const providerOptions = pipe(
      sync.data.provider,
      filter((p) => p.id !== "opencode" && p.name !== "opencode"),
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => info.capabilities?.input?.image),
          map(([model, info]) => ({
            value: `${provider.id}/${model}`,
            title: info.name ?? model,
            category: provider.name,
            disabled: false,
            footer: info.cost?.input === 0 ? "Free" : undefined,
            onSelect() {
              onSelect(provider.id, model)
            },
          })),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
      ]
    }

    return [...providerOptions, ...popularProviders]
  })

  async function onSelect(providerID: string, modelID: string) {
    try {
      // Go through the global config API so the running instance invalidates
      // its cached config and the new vision model takes effect mid-session
      // (mirrors how DialogModel persists the global default).
      const result = await sdk.client.global.config.update({
        config: {
          attachment: {
            image: {
              vision_model: `${providerID}/${modelID}`,
            },
          },
        },
      })
      if (result.error) {
        toast.show({ message: `Failed to save vision model: ${JSON.stringify(result.error)}`, variant: "error" })
        return
      }
      toast.show({ message: `Vision model set to ${providerID}/${modelID}`, variant: "success" })
    } catch (error) {
      toast.show({ message: `Failed to save vision model: ${error}`, variant: "error" })
    }
    dialog.clear()
  }

  return (
    <DialogSelect<string>
      options={options()}
      actions={[
        {
          command: "vision.model.dialog.provider",
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title="Select vision model"
      current={currentVisionModel()}
    />
  )
}
