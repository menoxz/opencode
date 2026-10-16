import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { TextAttributes, type KeyEvent, type RGBA } from "@opentui/core"
import { createSignal } from "solid-js"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "Goal definition",
  editIcon: "✎",
} as const

/**
 * Le contrat de tâche n'est plus **montré** dans la barre latérale : celle-ci ne porte qu'un
 * bouton. Son contenu (objectif, DoD, hors périmètre) vit dans le panneau d'édition que le
 * bouton ouvre — un seul endroit à lire, un seul endroit à écrire, et un clic suffit.
 */
export function TaskContractSection(props: { color: RGBA | string; onEdit?: () => void }) {
  const [focused, setFocused] = createSignal(false)
  const open = () => props.onEdit?.()
  const onKey = (event: KeyEvent) => {
    if (!["return", "enter", "space"].includes(event.name)) return
    event.preventDefault()
    event.stopPropagation()
    open()
  }

  return (
    <box
      id="task-contract-edit"
      flexDirection="row"
      gap={1}
      focusable
      onMouseDown={(event) => {
        event.target?.focus()
        open()
      }}
      onMouseOver={() => setFocused(true)}
      onMouseOut={() => setFocused(false)}
      onKeyDown={onKey}
      on:focused={() => setFocused(true)}
      on:blurred={() => setFocused(false)}
    >
      <text fg={props.color} attributes={focused() ? TextAttributes.UNDERLINE : undefined}>
        <b>{`${TASK_CONTRACT_SIDEBAR_COPY.editIcon} ${TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}`}</b>
      </text>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current

  return (
    <box>
      <TaskContractSection
        color={theme().text}
        onEdit={() => props.api.keymap.dispatchCommand("session.goal.edit")}
      />
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 150,
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
