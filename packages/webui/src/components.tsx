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
import type { StatusLine, StatusTone } from "./status"

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

/**
 * Panneau « Statut » — surface n°5 de la charte : santé du serveur, modèle, agents, serveurs MCP.
 * Présentationnel : les lignes et leurs tonalités sont décidées par `status.ts`, testé à part.
 */
export function StatusPanel(props: {
  lines: StatusLine[]
  rows: Array<{ name: string; label: string; tone: StatusTone; error?: string }>
}) {
  return (
    <div class="status">
      <ul class="statuslines">
        <For each={props.lines}>
          {(line) => (
            <li class={`statusline ${line.tone}`}>
              <span class="slabel">{line.label}</span>
              <span class="svalue">{line.value}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.rows.length > 0}>
        <h3>Serveurs MCP</h3>
        <ul class="mcprows">
          <For each={props.rows}>
            {(row) => (
              <li>
                <span class="mname">{row.name}</span>
                <span class={`badge ${row.tone}`}>{row.label}</span>
                <Show when={row.error}>{(error) => <span class="merror">{error()}</span>}</Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
