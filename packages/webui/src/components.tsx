import { For, Show } from "solid-js"
import {
  permissionActions,
  toolDetail,
  toolStatusLabel,
  toolTitle,
  type PermissionReply,
  type PermissionRequest,
  type ToolState,
} from "./view-model"
import { relativeTime } from "./time"

export const REPLY_LABEL: Record<PermissionReply, string> = {
  once: "Autoriser une fois",
  always: "Toujours autoriser",
  reject: "Refuser",
}

/* =============================================================================
   Composants de l'écran.

   Chaque composant correspond à une zone, jamais à une fonctionnalité : la
   conversation absorbe la variété d'un agent généraliste, donc il n'y a pas de
   composant « par capacité ». Règle de doute : on enlève.
   ============================================================================= */

/** Ligne de session : titre et temps relatif. Aucun ornement d'état. */
export function SessionRow(props: {
  title: string
  time: number | undefined
  now: number
  active: boolean
  onSelect: () => void
  children?: unknown
}) {
  return (
    <div class="row" classList={{ active: props.active }} onClick={() => props.onSelect()}>
      <span class="row-title">{props.title}</span>
      <span class="row-time">{relativeTime(props.time, props.now)}</span>
      {props.children as never}
    </div>
  )
}

/** Un tour de conversation. Le rôle porte la classe : `user` ou `agent`. */
export function Turn(props: { role: string; children?: unknown }) {
  return <div class={`turn ${props.role === "user" ? "user" : "agent"}`}>{props.children as never}</div>
}

/** Pièce jointe : vignette si image, nom, taille, retrait optionnel. */
export function FileChip(props: { label: string; thumb?: string; size?: string; onRemove?: () => void }) {
  return (
    <span class="chip">
      <Show when={props.thumb}>{(src) => <img src={src()} alt={props.label} />}</Show>
      <span class="chip-name">{props.label}</span>
      <Show when={props.size}>{(size) => <span class="chip-size">{size()}</span>}</Show>
      <Show when={props.onRemove}>
        <button class="chip-x" type="button" title="Retirer" onClick={() => props.onRemove?.()}>
          ✕
        </button>
      </Show>
    </span>
  )
}

/**
 * Action de l'agent : une ligne, pas une carte. Le détail s'ouvre sur place, à la demande.
 * L'état n'est écrit que s'il n'est pas « terminé » — un succès se tait.
 */
export function ToolLine(props: { tool: string; state: ToolState; open: boolean; onToggle: () => void }) {
  const detail = () => toolDetail(props.state)
  return (
    <div class="tool" classList={{ failed: props.state.status === "error", open: props.open }}>
      <button class="tool-line" onClick={() => props.onToggle()}>
        <span class="tool-name">{props.tool}</span>
        <Show when={toolTitle(props.state)}>{(title) => <span class="tool-title">{title()}</span>}</Show>
        <Show when={props.state.status !== "completed"}>
          <span class="tool-state">{toolStatusLabel(props.state)}</span>
        </Show>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <div class="tool-detail">
          <Show when={detail().input}>{(input) => <pre>{input()}</pre>}</Show>
          <Show when={detail().output}>{(output) => <pre class="out">{output()}</pre>}</Show>
          <Show when={detail().error}>{(error) => <pre class="err">{error()}</pre>}</Show>
        </div>
      </Show>
    </div>
  )
}

/**
 * Demande d'accord : le seul moment où l'interface hausse la voix. Les boutons viennent de
 * `permissionActions` — « toujours » n'apparaît que si le serveur a fourni des motifs, ce qui
 * est une décision, testée dans `view-model`.
 */
export function PermissionSheet(props: { request: PermissionRequest; onReply: (reply: PermissionReply) => void }) {
  return (
    <div class="permission">
      <div class="permission-title">
        L'agent demande à utiliser <strong>{props.request.permission}</strong>
      </div>
      <Show when={props.request.patterns.length > 0}>
        <ul class="permission-patterns">
          <For each={props.request.patterns}>{(pattern) => <li>{pattern}</li>}</For>
        </ul>
      </Show>
      <div class="permission-actions">
        <For each={permissionActions(props.request)}>
          {(action) => (
            <button class={action === "reject" ? "ghost bordered" : "primary"} onClick={() => props.onReply(action)}>
              {REPLY_LABEL[action]}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
