import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import type { KeyEvent, RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal } from "solid-js"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "Goal definition",
} as const

/**
 * Le contrat de tâche n'est plus **montré** ici : la barre latérale ne porte qu'un bouton,
 * avec son **statut** (`DOD(2) OOS(1)`) — un compte, jamais le contenu, qui vit dans le
 * panneau d'édition. Un seul endroit à lire, un seul endroit à écrire.
 *
 * L'ouverture se fait sur le **relâchement** du clic, jamais sur l'appui : le dialogue est un
 * voile plein écran qui se ferme sur un `mouseup` hors de son cadre (`ui/dialog.tsx`), donc un
 * appui qui l'ouvre reçoit aussitôt le relâchement du même clic et le referme — le panneau
 * apparaissait et disparaissait d'un coup. C'est le dernier événement du clic qui l'ouvre.
 */
export function TaskContractSection(props: {
  color: RGBA | string
  muted: RGBA | string
  hoverBackground?: RGBA | string
  dod: number
  outOfScope: number
  onEdit?: () => void
}) {
  const renderer = useRenderer()
  const [hovered, setHovered] = createSignal(false)
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
      backgroundColor={hovered() ? props.hoverBackground : undefined}
      onMouseUp={() => open()}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onKeyDown={onKey}
    >
      <text fg={props.color}>
        <b>{TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}</b>
      </text>
      <text fg={props.muted}>{`DOD(${props.dod}) OOS(${props.outOfScope})`}</text>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const session = createMemo(() => props.api.state.session.get(props.session_id) as any)
  // Le statut ne lit que des **comptes** : les éléments vides ne comptent pas, comme dans
  // l'éditeur, et un contrat ignoré (`skipped`) n'affiche rien de plus qu'un contrat absent.
  const count = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item) => typeof item === "string" && item.trim().length > 0).length
      : 0
  const goalState = createMemo(() => {
    const state = session()?.goalState
    if (!state || state.status === "skipped") return undefined
    return state
  })
  const dod = createMemo(() => count(goalState()?.dod))
  const outOfScope = createMemo(() => count(goalState()?.outOfScope))

  return (
    <box>
      <TaskContractSection
        color={theme().text}
        muted={theme().textMuted}
        hoverBackground={theme().backgroundMenu}
        dod={dod()}
        outOfScope={outOfScope()}
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
