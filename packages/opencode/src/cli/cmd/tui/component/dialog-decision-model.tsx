import { createMemo, createSignal, onMount } from "solid-js"
import { reconcile } from "solid-js/store"
import { useSync } from "@tui/context/sync"
import { useToast } from "@tui/ui/toast"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { useSDK } from "../context/sdk"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import {
  chatPatch,
  currentDecisionModelValue,
  systemOnePatch,
  systemOneValue,
  SYSTEM_ONE_PREFIX,
  type Host,
  type JevSettings,
} from "./decision-model"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"

/**
 * The decision model picker.
 *
 * One model answers every decision the harness asks a model to make — the Jev hooks (skills,
 * tools, guard, relevance, intake, review, next action, compaction, route, plan, complexity,
 * untrusted) and the harness scoring passes (skill selection, memory extraction, episodic
 * synthesis, reflection) — and this dialog is the only place that choice is made.
 *
 * It offers both transports the fork supports, because they are not interchangeable:
 *
 *   - the **System One** models of the configured Jev host, first (`GET /global/jev/models`).
 *     `openjev-latest` and friends are decision models, not chat models, so `provider.list` can
 *     never show them — this section is the only way to pick one;
 *   - the harness **chat models** (`provider.list`, as before), which replace the System One
 *     transport entirely and therefore ask for confirmation when a Jev host is live.
 *
 * Persisted through the global config API so the running instance invalidates its cached config
 * and the choice takes effect mid-session. A `jev`-only patch is hot-reloaded in place; it no
 * longer disposes every instance, which used to abort the turn in flight and empty the TUI's
 * session list.
 */

/** The slice of the config this dialog reads and writes. */
type DecisionModelConfig = { jev?: JevSettings }

/** What `GET /global/jev/models` answers. */
type JevModel = { id: string; name: string; description?: string }
type JevModels = {
  provider: string
  base_url: string
  endpoint: string
  default_model: string
  authenticated: boolean
  source: "host" | "preset"
  models: JevModel[]
  error?: string
}

export function DialogDecisionModel() {
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [query, setQuery] = createSignal("")
  const [host, setHost] = createSignal<JevModels | undefined>()

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const settings = createMemo(() => (sync.data.config as DecisionModelConfig | undefined)?.jev)
  const jHost = createMemo<Host | undefined>(() => {
    const target = host()
    return target ? { provider: target.provider, default_model: target.default_model } : undefined
  })
  const current = createMemo(() => currentDecisionModelValue(settings(), jHost()))

  onMount(() => {
    // Best effort: the picker stays usable with the chat models alone when the host is not
    // reachable, and the System One section says why instead of silently missing.
    void sdk
      .fetch(new URL("/global/jev/models", sdk.url))
      .then((response) => (response.ok ? (response.json() as Promise<JevModels>) : undefined))
      .catch(() => undefined)
      .then((result) => setHost(result))
  })

  /**
   * Writes a patch and refreshes the store from the answer.
   *
   * Only the `jev` slice is reconciled: the response carries the *global* config, while the
   * store holds the instance's merged view, and replacing it wholesale would drop project-level
   * settings from the TUI's own copy.
   */
  async function write(patch: { jev: Record<string, unknown> }, message: string) {
    try {
      const result = await sdk.client.global.config.update({ config: patch as never })
      if (result.error) {
        toast.show({ message: `Failed to save decision model: ${JSON.stringify(result.error)}`, variant: "error" })
        return
      }
      const jev = result.data?.jev
      if (jev) sync.set("config", "jev", reconcile(jev))
      toast.show({ message, variant: "success" })
    } catch (error) {
      toast.show({ message: `Failed to save decision model: ${error}`, variant: "error" })
    }
    dialog.clear()
  }

  /** Picks a model on the Jev host: the wire transport answers with its own decision model. */
  async function selectSystemOne(target: Host, model: string) {
    const patch = systemOnePatch(settings(), target, model)
    if (!patch) {
      toast.show({ message: `Decision model already JEV ${model}`, variant: "success" })
      dialog.clear()
      return
    }
    await write(patch, `Decision model: JEV ${model} (${target.provider} System One)`)
  }

  /**
   * Picks a harness chat model.
   *
   * It replaces the System One transport for every Jev hook, so when a Jev host is live the
   * choice is confirmed rather than applied silently — the failure mode that hid a dead Jev
   * endpoint for weeks, and that made this dialog look like the only way to "use OpenJev".
   */
  async function selectChat(value: string) {
    const target = host()
    if (target?.authenticated && settings()?.decision_model !== value) {
      const ok = await DialogConfirm.show(
        dialog,
        "Replace the JEV decision model?",
        `A chat model will answer Jev's questions instead of the ${target.provider} System One endpoint (${target.base_url}). `
          + `Jev's host and its key will no longer be used. Pick a model under "Jev decision models" to keep JEV.`,
        "Use the chat model",
      )
      if (!ok) return
    }
    const patch = chatPatch(settings(), value)
    if (!patch) {
      toast.show({ message: `Decision model already ${value}`, variant: "success" })
      dialog.clear()
      return
    }
    await write(patch, `Decision model set to ${value}`)
  }

  const systemOptions = createMemo(() => {
    const target = host()
    if (!target) return []
    const category = `Jev decision models (${target.provider}, System One)`
    // A selectable notice, not a disabled row: the picker drops disabled options, and a silent
    // Jev (no key, host down) is exactly what the user must not have to guess.
    const notice = target.error
      ? [
          {
            value: `${SYSTEM_ONE_PREFIX}notice`,
            title: `Jev (System One): ${target.error}`,
            description: target.authenticated
              ? "Showing the documented models of this preset; the host did not list its own."
              : `The key is read from the environment of the process running opencodev2.`,
            category,
            onSelect() {
              toast.show({ message: target.error!, variant: "error" })
            },
          },
        ]
      : []
    return [
      ...notice,
      ...target.models.map((model) => ({
        value: systemOneValue(target.provider, model.id),
        title: model.name,
        description: model.description ?? `Answers on ${target.endpoint}`,
        category,
        footer: model.id === target.default_model ? "default" : undefined,
        onSelect() {
          void selectSystemOne({ provider: target.provider, default_model: target.default_model }, model.id)
        },
      })),
    ]
  })

  const options = createMemo(() => {
    const needle = query().trim()

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
              void selectChat(`${provider.id}/${model}`)
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
        ...fuzzysort
          .go(needle, [...systemOptions(), ...providerOptions], { keys: ["title", "category"] })
          .map((x) => x.obj),
      ]
    }

    return [...systemOptions(), ...providerOptions, ...popularProviders]
  })

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
      title={host() ? "Select decision model (JEV System One first)" : "Select decision model"}
      current={current()}
    />
  )
}
