import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import type { KeyEvent, RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/solid"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "Goal definition",
} as const

/**
 * Le contrat de tâche n'est plus **montré** ici : la barre latérale ne porte qu'un bouton.
 * Son contenu (objectif, DoD, hors périmètre) vit dans le panneau d'édition que le bouton
 * ouvre — un seul endroit à lire, un seul endroit à écrire.
 *
 * L'ouverture se fait sur le **relâchement** du clic, jamais sur l'appui : le dialogue est un
 * voile plein écran qui se ferme sur un `mouseup` hors de son cadre (`ui/dialog.tsx`), donc un
 * appui qui l'ouvre reçoit aussitôt le relâchement du même clic et le referme — le panneau
 * apparaissait et disparaissait d'un coup. C'est le dernier événement du clic qui l'ouvre.
 */
export function TaskContractSection(props: { color: RGBA | string; onEdit?: () => void }) {
  const renderer = useRenderer()
  const open = () => props.onEdit?.()
  const onKey = (event: KeyEvent) => {
    if (!["return", "enter", "space"].includes(event.name)) return
    event.preventDefault()
    event.stopPropagation()
    open()
  }

  return (
    <box id="task-contract-edit" flexDirection="row" gap={1} focusable onMouseUp={() => open()} onKeyDown={onKey}>
      <text fg={props.color}>
        <b>{TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}</b>
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
