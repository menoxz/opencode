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

export const REPLY_LABEL: Record<PermissionReply, string> = {
  once: "Autoriser une fois",
  always: "Toujours autoriser",
  reject: "Refuser",
}

/**
 * Rendu d'un appel d'outil. Composant purement présentationnel : il ne connaît ni le client SDK
 * ni les signaux de l'application, ce qui le rend testable sans serveur ni DOM complet.
 */
export function ToolCall(props: {
  tool: string
  state: ToolState
  open: boolean
  onToggle: () => void
}) {
  return (
    <div class={`tool ${props.state.status}`}>
      <button class="toolhead" onClick={() => props.onToggle()}>
        <span class="toolname">{props.tool}</span>
        <span class={`badge ${props.state.status}`}>{toolStatusLabel(props.state)}</span>
        <Show when={toolTitle(props.state)}>{(title) => <span class="tooltitle">{title()}</span>}</Show>
        <span class="chevron">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <div class="tooldetail">
          <Show when={toolDetail(props.state).input}>{(input) => <pre class="io">{input()}</pre>}</Show>
          <Show when={toolDetail(props.state).output}>{(output) => <pre class="io out">{output()}</pre>}</Show>
          <Show when={toolDetail(props.state).error}>{(error) => <pre class="io err">{error()}</pre>}</Show>
        </div>
      </Show>
    </div>
  )
}

/**
 * Panneau d'accord/refus. Les boutons proposés viennent de `permissionActions` : le bouton
 * « toujours » n'apparaît que si le serveur a fourni des motifs — une décision, pas une mise en
 * page, donc testée dans `view-model`.
 */
export function PermissionPanel(props: {
  request: PermissionRequest
  onReply: (reply: PermissionReply) => void
}) {
  return (
    <div class="permission">
      <div class="ptitle">
        Permission demandée : <strong>{props.request.permission}</strong>
      </div>
      <Show when={props.request.patterns.length > 0}>
        <ul class="patterns">
          <For each={props.request.patterns}>{(pattern) => <li>{pattern}</li>}</For>
        </ul>
      </Show>
      <div class="pactions">
        <For each={permissionActions(props.request)}>
          {(action) => (
            <button class={action === "reject" ? "danger" : "primary"} onClick={() => props.onReply(action)}>
              {REPLY_LABEL[action]}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
