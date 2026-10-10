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

/**
 * The decision model picker.
 *
 * One model answers every decision the harness asks a model to make — the Jev
 * hooks (skills, tools, guard, relevance, intake, review, next action,
 * compaction, route, plan, complexity, untrusted) and the harness scoring passes
 * (skill selection, memory extraction, episodic synthesis, reflection). This
 * dialog is the only place that choice is made, so no feature has its own model
 * setting any more.
 *
 * The list is exactly `provider.list`: whatever the harness knows is selectable,
 * and nothing else is. Persisted through the global config API so the running
 * instance invalidates its cached config and the choice takes effect mid-session
 * (the same path the vision-model dialog uses).
 */

/** The slice of the config this dialog reads and writes. */
type DecisionModelConfig = { jev?: { decision_model?: string } }

export function DialogDecisionModel() {
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()
  const showExtra = createMemo(() => connected())

  const currentDecisionModel = createMemo(() => {
    return (sync.data.config as DecisionModelConfig | undefined)?.jev?.decision_model
  })

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0

    const providerOptions = pipe(
      sync.data.provider,
      sortBy((provider) => provider.id !== "opencode", (provider) => provider.name),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
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
      return [...fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj)]
    }

    return [...providerOptions, ...popularProviders]
  })

  async function onSelect(providerID: string, modelID: string) {
    try {
      const result = await sdk.client.global.config.update({
        config: {
          jev: {
            decision_model: `${providerID}/${modelID}`,
          },
        } as never,
      })
      if (result.error) {
        toast.show({ message: `Failed to save decision model: ${JSON.stringify(result.error)}`, variant: "error" })
        return
      }
      toast.show({ message: `Decision model set to ${providerID}/${modelID}`, variant: "success" })
    } catch (error) {
      toast.show({ message: `Failed to save decision model: ${error}`, variant: "error" })
    }
    dialog.clear()
  }

  return (
    <DialogSelect<string>
      options={options()}
      actions={[
        {
          command: "decision.model.dialog.provider",
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title="Select decision model"
      current={currentDecisionModel()}
    />
  )
}
