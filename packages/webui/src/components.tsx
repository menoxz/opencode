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
import { formatChars, injectionLabel, share, sourceLabel, type Injections } from "./injections"
import { agentSummary, mcpTone, modeLabel, type AgentRow, type McpProblem } from "./config"
import { ToolIcon, toolHint } from "./icons"
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

/**
 * En-tête de dossier : ce qui sépare deux lieux de travail. Le nom affiché est le chemin **relatif**
 * (`packages/opencode`) ; le chemin absolu reste en infobulle, pour ne pas prendre la ligne.
 */
export function DirectoryGroup(props: {
  label: string
  hint: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button class="group" title={props.hint} onClick={() => props.onToggle()}>
      <span class="group-chev">{props.open ? "▾" : "▸"}</span>
      <span class="group-label">{props.label}</span>
      <span class="group-count">{props.count}</span>
    </button>
  )
}

/**
 * Ligne de session : titre et temps au repos ; dépliée, elle dit qui a travaillé, avec quoi, ce que
 * ça a consommé et ce que ça a changé. C'est la seule surface qui donne ces chiffres, donc elle les
 * donne à la demande plutôt que de les imposer à la lecture.
 */
export function SessionRow(props: {
  title: string
  time: number | undefined
  now: number
  active: boolean
  open: boolean
  details: Array<{ label: string; value: string }>
  onSelect: () => void
  onToggle: () => void
  children?: unknown
}) {
  return (
    <div class="row" classList={{ active: props.active }} onClick={() => props.onSelect()}>
      <span class="row-title">{props.title}</span>
      <span class="row-time">{relativeTime(props.time, props.now)}</span>
      <button
        class="row-more"
        title={props.open ? "Moins d'informations" : "Plus d'informations"}
        onClick={(event) => {
          event.stopPropagation()
          props.onToggle()
        }}
      >
        {props.open ? "▾" : "▸"}
      </button>
      {props.children as never}
      <Show when={props.open}>
        <dl class="row-detail">
          <For each={props.details}>
            {(line) => (
              <>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </>
            )}
          </For>
        </dl>
      </Show>
    </div>
  )
}

/** Un tour de conversation. Le rôle porte la classe : `user` ou `agent`. */
export function Turn(props: { role: string; children?: unknown }) {
  return <div class={`turn ${props.role === "user" ? "user" : "agent"}`}>{props.children as never}</div>
}

/**
 * Le prompt de l'utilisateur.
 *
 * C'est le seul texte de l'écran qu'il a écrit lui-même : il doit se reconnaître au premier
 * regard, donc une surface à lui, dans la largeur de lecture, et son texte conservé tel quel —
 * espaces et retours à la ligne compris (un prompt est souvent structuré).
 */
export function UserPrompt(props: { text: string }) {
  return <p class="prompt">{props.text}</p>
}

/**
 * Ce que le serveur a injecté dans le contexte **avant** le prompt.
 *
 * Il le joint en texte brut ; on le rend comme une structure : une ligne par section, son volume,
 * et la part qu'elle prend. Replié par défaut — c'est une information de confiance, pas de
 * lecture. Déplié, il répond à « qu'est-ce qui consomme ma fenêtre ? », question qu'aucune autre
 * surface ne traite et qu'aucune estimation ne peut remplacer.
 */
export function ContextInjections(props: { injections: Injections; open: boolean; onToggle: () => void }) {
  const total = () => props.injections.sections.reduce((sum, section) => sum + section.chars, 0)
  const bySources = () => props.injections.kind === "sources"
  // Deux formes coexistent côté serveur : des volumes par section, ou la liste des fichiers chargés.
  // Le titre le dit, plutôt que d'annoncer « sections » sur une liste de chemins.
  const title = () => (bySources() ? "instructions chargées" : "contexte injecté")
  const meta = () => {
    if (bySources()) {
      const count = props.injections.sources.length
      return `${count} fichier${count > 1 ? "s" : ""}`
    }
    const count = props.injections.sections.length
    return `${count} section${count > 1 ? "s" : ""} · ${formatChars(total())} car.`
  }
  return (
    <div class="injections">
      <button class="injections-head" onClick={() => props.onToggle()}>
        <span class="injections-title">{title()}</span>
        <span class="injections-meta">{meta()}</span>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <Show
          when={!bySources()}
          fallback={
            <ul class="injections-list sources">
              <For each={props.injections.sources}>
                {(path) => (
                  <li>
                    <span class="inj-path" title={path}>
                      {sourceLabel(path)}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          }
        >
          <ul class="injections-list">
            <For each={props.injections.sections}>
              {(section) => (
                <li>
                  <span class="inj-label" title={section.label}>
                    {injectionLabel(section)}
                    <Show when={section.detail}>
                      {(detail) => <span class="inj-detail">{detail()}</span>}
                    </Show>
                  </span>
                  <span class="inj-bar">
                    <span style={{ width: `${Math.round(share(section.chars, total()) * 100)}%` }} />
                  </span>
                  <span class="inj-size">
                    {formatChars(section.chars)}
                    <Show when={section.truncated}>
                      <span class="inj-trunc" title="Le serveur a tronqué cette section">
                        tronqué
                      </span>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  )
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
      <button class="tool-line" title={toolHint(props.tool)} onClick={() => props.onToggle()}>
        <ToolIcon tool={props.tool} />
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
 * Réflexion de l'agent. Secondaire par nature : repliée, dans la même grammaire que les actions, et
 * nommée en français — jamais rendue par son nom de type (`reasoning` n'est pas un mot d'écran).
 */
export function Reasoning(props: { text: string; open: boolean; onToggle: () => void }) {
  return (
    <div class="reasoning">
      <button class="reasoning-line" onClick={() => props.onToggle()}>
        <span>réflexion</span>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <p class="reasoning-text">{props.text}</p>
      </Show>
    </div>
  )
}

/**
 * Panneau de configuration — une **feuille** posée sur la conversation, pas une sixième zone.
 *
 * Elle s'ouvre à la demande et se referme, ce qui la dispense d'être discrète : c'est la règle
 * inverse du fil, où rien ne doit s'afficher. Elle **consulte** seulement — aucun point d'écriture
 * n'a été relevé côté serveur, donc aucune bascule n'est proposée, et un interrupteur inerte
 * serait un mensonge.
 */
export function ConfigSheet(props: {
  lines: Array<{ label: string; value: string }>
  agents: AgentRow[]
  counts: { primary: number; subagent: number }
  mcpTotal: number
  mcpConnected: number
  mcpProblems: McpProblem[]
  onClose: () => void
}) {
  return (
    <>
      <div class="sheet-scrim" onClick={() => props.onClose()} />
      <aside class="sheet" role="dialog" aria-label="Configuration">
        <header class="sheet-head">
          <span class="sheet-title">configuration</span>
          <button class="ghost" title="Fermer (Échap)" onClick={() => props.onClose()}>
            ✕
          </button>
        </header>
        <div class="sheet-body">
          <section class="sheet-section">
            <h2>général</h2>
            <dl class="sheet-lines">
              <For each={props.lines}>
                {(line) => (
                  <>
                    <dt>{line.label}</dt>
                    <dd title={line.value}>{line.value}</dd>
                  </>
                )}
              </For>
            </dl>
          </section>

          <section class="sheet-section">
            <h2>agents</h2>
            <p class="sheet-note">{agentSummary(props.counts)}</p>
            <ul class="sheet-agents">
              <For each={props.agents}>
                {(agent) => (
                  <li>
                    <span class="sa-name">{agent.name}</span>
                    <span class="sa-mode">{modeLabel(agent.mode)}</span>
                    <Show when={agent.description}>
                      {(description) => (
                        <span class="sa-desc" title={agent.full ?? description()}>
                          {description()}
                        </span>
                      )}
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>

          <section class="sheet-section">
            <h2>serveurs mcp</h2>
            {/* Ce qui est sain ne s'annonce pas : six connectés tiennent en une phrase, et seuls
                les serveurs en défaut méritent une ligne à eux. */}
            <p class="sheet-note">
              {props.mcpConnected} sur {props.mcpTotal} connectés
            </p>
            <Show when={props.mcpProblems.length > 0}>
              <ul class="sheet-mcp">
                <For each={props.mcpProblems}>
                  {(problem) => (
                    <li>
                      <span class={`mcp-state ${mcpTone(problem.status)}`}>{problem.status}</span>
                      <span class="mcp-name">{problem.name}</span>
                      <Show when={problem.error}>{(error) => <span class="mcp-error">{error()}</span>}</Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </div>
      </aside>
    </>
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
