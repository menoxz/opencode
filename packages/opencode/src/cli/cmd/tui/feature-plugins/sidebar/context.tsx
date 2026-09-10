import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, createResource, createSignal, onCleanup } from "solid-js"
import {
  costTree,
  lastCompletedAssistant,
  loadCostSnapshot,
  loadedUsage,
  updateCostRows,
  type CostSession,
} from "./context-metrics"
import { ContextUsage } from "./context-usage"

const id = "internal:sidebar-context"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const usage = createMemo(() => loadedUsage(props.session_id, msg(), props.api.state.part))
  const last = createMemo(() => usage().last?.message ?? lastCompletedAssistant(msg(), Date.now()))
  const [updates, setUpdates] = createSignal<CostSession[]>([])
  const [deleted, setDeleted] = createSignal<string[]>([])
  for (const type of ["session.created", "session.updated", "session.deleted"] as const) {
    const off = props.api.event.on(type, (event) => {
      const row = event.properties.info
      setUpdates((rows) => updateCostRows(rows, row, type === "session.deleted"))
      setDeleted((ids) =>
        [...ids.filter((id) => id !== row.id), ...(type === "session.deleted" ? [row.id] : [])].slice(-200),
      )
    })
    onCleanup(off)
  }
  const [snapshot] = createResource(
    () => props.session_id,
    () => loadCostSnapshot(() => props.api.client.session.list({ limit: 200 }, { signal: AbortSignal.timeout(5000) })),
  )
  const tree = createMemo(() =>
    costTree(
      props.session_id,
      [...(snapshot.loading ? [] : (snapshot()?.sessions ?? [])), ...updates()]
        .filter((row) => !deleted().includes(row.id))
        .map((row) => props.api.state.session.get(row.id) ?? row),
      session()?.cost,
    ),
  )
  const model = createMemo(() => {
    const message = last()
    if (!message) return
    return props.api.state.provider.find((item) => item.id === message.providerID)?.models[message.modelID]
  })

  return (
    <ContextUsage
      message={last()}
      parts={last() ? props.api.state.part(last()!.id) : undefined}
      limit={model()?.limit.context}
      cost={session()?.cost}
      history={usage()}
      tree={tree()}
      treeStatus={snapshot.loading ? "loading" : (snapshot()?.status ?? "error")}
      color={theme().text}
      muted={theme().textMuted}
    />
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
