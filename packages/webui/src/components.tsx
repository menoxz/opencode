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
import { relativeTime } from "./time"

export const REPLY_LABEL: Record<PermissionReply, string> = {
  once: "Autoriser une fois",
  always: "Toujours autoriser",
  reject: "Refuser",
}

/* =============================================================================
   Composants de structure — repris de DSH (`dsh-identite-visuelle.html`,
   `dsh-sidebar-proposition.html`). Chaque composant correspond à une classe du
   balisage de référence, pour que le rendu suive la même grammaire.
   ============================================================================= */

/**
 * Marque « nœud de liaison » : le motif signature de DSH est un graphe — deux montants reliés par
 * un flux. Reproduit ici avec les mêmes couleurs de marque, appliquées au nom opencodev2.
 */
export function LogoMark(props: { size?: number }) {
  const size = () => props.size ?? 22
  return (
    <svg class="logo" width={size()} height={size()} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="lgMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4d7cfe" />
          <stop offset=".55" stop-color="#6a5cff" />
          <stop offset="1" stop-color="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#lgMark)" />
      <path d="M16 14v20M32 14v20" stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none" />
      <path
        d="M16 24h5.5l2.5-4 3 8 2.5-4H32"
        stroke="#fff"
        stroke-width="2.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** Barre de titre : feux, marque, version, puis pastille d'environnement à droite. */
export function TitleBar(props: {
  version: string
  context?: string
  envLabel: string
  envTone: "ok" | "warn" | "error"
  children?: unknown
}) {
  return (
    <header class="titlebar">
      <div class="traffic">
        <i />
        <i />
        <i />
      </div>
      <div class="title">
        <LogoMark size={18} />
        <span class="prod">opencodev2</span>
        <span class="ver">{props.version}</span>
        <Show when={props.context}>
          <span class="sep">—</span>
          <span class="ctx">{props.context}</span>
        </Show>
      </div>
      <div class="spacer" />
      {props.children as never}
      <div class={`env ${props.envTone}`}>
        <span class="pulse" />
        {props.envLabel}
      </div>
    </header>
  )
}

/** Bloc de marque : marque + signature courte. */
export function Brand(props: { name: string; tagline: string }) {
  return (
    <div class="brand">
      <LogoMark size={34} />
      <div class="brand-name">
        {props.name}
        <small>{props.tagline}</small>
      </div>
    </div>
  )
}

/** En-tête de section : libellé capitalisé suivi d'un filet qui court jusqu'au bord. */
export function SectionLabel(props: { label: string; trailing?: string }) {
  return (
    <div class="sectionLabel">
      {props.label}
      <Show when={props.trailing}>{(value) => <span class="count">{value()}</span>}</Show>
    </div>
  )
}

/** Ligne de workspace : chevron, écusson dossier, nom, compteur. */
export function FolderRow(props: { name: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <div class="folderRow" classList={{ open: props.open }} onClick={() => props.onToggle()}>
      <span class="chev">▶</span>
      <span class="crest">
        <svg viewBox="0 0 24 24">
          <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
        </svg>
      </span>
      <span class="fname">{props.name}</span>
      <span class="count">{props.count}</span>
    </div>
  )
}

/** Ligne de session : pastille d'état, titre, temps relatif. */
export function SessionRow(props: {
  title: string
  time: number | undefined
  now: number
  active: boolean
  running: boolean
  onSelect: () => void
  children?: unknown
}) {
  return (
    <div class="sessionRow" classList={{ active: props.active }} onClick={() => props.onSelect()}>
      <span class="dot" classList={{ run: props.running }} />
      <span class="stitle">{props.title}</span>
      <span class="time">{relativeTime(props.time, props.now)}</span>
      {props.children as never}
    </div>
  )
}

/** Carte modèle : LED d'état, nom du modèle, sous-ligne d'informations. */
export function ModelCard(props: { model: string; sub: string; tone: "ok" | "off" }) {
  return (
    <div class="modelCard">
      <div class="mc-top">
        <span class={`led ${props.tone}`} />
        {props.model}
      </div>
      <div class="mc-sub">{props.sub}</div>
    </div>
  )
}

/** Bulle de conversation : avatar + bulle, rôle porté par la classe. */
export function ChatMessage(props: { role: string; avatar: string; children?: unknown }) {
  const kind = () => (props.role === "user" ? "user" : "agent")
  return (
    <div class={`chatMsg ${kind()}`}>
      <div class="avatar">{props.avatar}</div>
      <div class="bubble">{props.children as never}</div>
    </div>
  )
}

/** Barre d'état : éléments à gauche, éléments à droite. */
export function StatusBar(props: {
  left: Array<{ label: string; tone?: StatusTone }>
  right: Array<{ label: string; tone?: StatusTone }>
}) {
  return (
    <div class="statusbar">
      <For each={props.left}>
        {(item) => (
          <span class="s-item">
            <Show when={item.tone}>
              {(tone) => <span class={`dot ${tone()}`} />}
            </Show>
            {item.label}
          </span>
        )}
      </For>
      <div class="s-right">
        <For each={props.right}>{(item) => <span class="s-item">{item.label}</span>}</For>
      </div>
    </div>
  )
}

/* =============================================================================
   Composants métier — rendu d'un appel d'outil, permission, statut
   ============================================================================= */

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
