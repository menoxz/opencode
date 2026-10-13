import { createSignal, For, onCleanup, Show } from "solid-js"
import {
  answersComplete,
  boundLines,
  copyableOutput,
  copyableText,
  customValue,
  diffLabel,
  fileDiff,
  formatCount,
  formatDuration,
  isSelected,
  OUTPUT_PREVIEW_LINES,
  patchLabel,
  permissionActions,
  proseKind,
  stepSummary,
  toolDetail,
  toolOutputLines,
  toolStatusLabel,
  toolTitle,
  type PermissionReply,
  type PermissionRequest,
  type QuestionAnswers,
  type QuestionRequest,
  type StepView,
  type ToolState,
} from "./view-model"
import { writeClipboard } from "./clipboard"
import { formatChars, injectionLabel, share, sourceLabel, type Injections } from "./injections"
import { ChevronIcon, FolderIcon, PluginIcon, SessionIcon, ToolIcon, toolHint } from "./icons"
import { relativeTime } from "./time"

export const REPLY_LABEL: Record<PermissionReply, string> = {
  once: "Allow once",
  always: "Always allow",
  reject: "Reject",
}

/**
 * Copier — la seule action de **lecture** du fil (§3.9 : « copier une commande, un chemin, un bloc »).
 *
 * Deux règles la gouvernent, et la seconde compte autant que la première :
 *
 * 1. §3.8 — rien ne s'annonce au repos. Le bouton se révèle **au survol de l'élément qui porte
 *    l'information**, jamais dans une colonne à côté, où il prendrait la place du texte qu'on vient
 *    lire. Dans le détail d'un outil il est visible d'emblée : le panneau **est** déjà le dépli.
 * 2. **L'échec se dit.** Un bouton « copier » qui ne copie pas en silence est pire que pas de bouton :
 *    il fait croire que c'est fait. `writeClipboard` rend donc un booléen, et l'échec s'affiche.
 */
export function CopyButton(props: { text: string; label?: string }) {
  const [state, setState] = createSignal<"idle" | "done" | "failed">("idle")
  let timer: ReturnType<typeof setTimeout> | undefined
  const copy = async () => {
    const ok = await writeClipboard(props.text)
    setState(ok ? "done" : "failed")
    clearTimeout(timer)
    timer = setTimeout(() => setState("idle"), 1500)
  }
  onCleanup(() => clearTimeout(timer))
  return (
    <button
      class="copy"
      classList={{ done: state() === "done", failed: state() === "failed" }}
      title={props.label ?? "Copy"}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
    >
      {state() === "done" ? "copied" : state() === "failed" ? "failed" : "copy"}
    </button>
  )
}

/* =============================================================================
   Composants de l'écran.

   Chaque composant correspond à une zone, jamais à une fonctionnalité : la
   conversation absorbe la variété d'un agent généraliste, donc il n'y a pas de
   composant « par capacité ». Règle de doute : on enlève.
   ============================================================================= */

/* =============================================================================
   Partie 2 du rail — les plugins.

   Un plugin ajouté = **un bouton portant son nom**. Ce n'est pas un catalogue : l'utilisateur ne
   parcourt pas ses plugins, il en déclenche un. Et si aucun plugin n'est chargé, la section
   **n'existe pas** — pas de titre orphelin, pas de « 0 », pas de repli décoratif.

   Une section « menus » listant les 210 commandes du serveur a existé ici ; elle a été retirée.
   Elle n'existait que parce que la route existait : un skill ne se consulte pas, il s'injecte.
   ============================================================================= */

export function PluginButton(props: { label: string; hint: string; onRun?: () => void }) {
  return (
    <button class="plugin-row" title={props.hint} onClick={() => props.onRun?.()}>
      <span class="plugin-icon">
        <PluginIcon size={13} />
      </span>
      <span class="plugin-label">{props.label}</span>
    </button>
  )
}

/**
 * « voir plus » / « voir moins » — un dossier de 19 sessions ne charge plus la liste.
 *
 * Le bouton n'existe que s'il a un effet : à zéro session cachée, `splitSessions` rend `hidden = 0`
 * et le composant n'est pas monté. Un « voir plus » qui ne déplie rien est un mensonge d'affordance.
 */
export function ShowMore(props: { hidden: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button class="show-more" onClick={() => props.onToggle()}>
      <ChevronIcon size={11} open={props.expanded} />
      <span>{props.expanded ? "show less" : `show more · ${props.hidden}`}</span>
    </button>
  )
}

/* =============================================================================
   Partie B du rail — les workspaces.

   Un workspace est un dossier ajouté ; il contient ses sessions, repliées ou dépliées à souhait.
   Le nom affiché est le chemin **relatif** (`packages/opencode`) ; le chemin absolu reste en
   infobulle, pour ne pas prendre la ligne.
   ============================================================================= */

/** En-tête de workspace : ce qui sépare deux lieux de travail. */
export function WorkspaceGroup(props: {
  label: string
  hint: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button class="workspace" title={props.hint} onClick={() => props.onToggle()}>
      <ChevronIcon size={12} open={props.open} />
      <span class="workspace-icon">
        <FolderIcon size={14} />
      </span>
      <span class="workspace-label">{props.label}</span>
      <span class="workspace-count">{props.count}</span>
    </button>
  )
}

/**
 * Ligne de session : le **libellé d'abord**. Au repos, la ligne ne porte que son nom et son temps ;
 * les actions (renommer, supprimer) se posent **par-dessus** le nom au survol, donc sans consommer
 * de place — c'est ce qui rendait le titre illisible quand elles tenaient une colonne de la grille.
 * L'infobulle porte le nom complet **et** l'activité de la session, puisque le titre peut être
 * tronqué.
 */
export function SessionRow(props: {
  title: string
  /** Infobulle : nom complet + activité (agent, modèle, jetons, coût, fichiers). */
  hint: string
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
      <span class="row-icon">
        <SessionIcon size={13} />
      </span>
      <span class="row-main">
        <span class="row-title" title={props.hint}>
          {props.title}
        </span>
        {props.children as never}
      </span>
      <span class="row-time">{relativeTime(props.time, props.now)}</span>
      <button
        class="row-more"
        title={props.open ? "Hide details" : "Show details"}
        onClick={(event) => {
          event.stopPropagation()
          props.onToggle()
        }}
      >
        <ChevronIcon size={11} open={props.open} />
      </button>
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
  const title = () => (bySources() ? "loaded instructions" : "injected context")
  const meta = () => {
    if (bySources()) {
      const count = props.injections.sources.length
      return `${count} file${count > 1 ? "s" : ""}`
    }
    const count = props.injections.sections.length
    return `${count} section${count > 1 ? "s" : ""} · ${formatChars(total())} chars`
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
                      <span class="inj-trunc" title="The server truncated this section">
                        truncated
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
        <button class="chip-x" type="button" title="Remove" onClick={() => props.onRemove?.()}>
          ✕
        </button>
      </Show>
    </span>
  )
}

/**
 * Action de l'agent : une ligne, pas une carte — 29 % du flux mesuré, donc elle ne peut pas prendre
 * trois lignes.
 *
 * La ligne porte ce qui décide : l'outil, puis son **titre** (`state.title`, présent 2 242 fois dans
 * le relevé et jamais lu avant), et — quand il y en a un — le ±lignes d'une écriture, lu dans
 * `state.metadata.filediff` (mesuré : `{file, patch, additions, deletions}`), car `PatchPart` ne
 * porte que `hash` et `files[]` : les ±lignes n'y sont pas.
 *
 * Le volume d'une sortie n'apparaît **que s'il y a quelque chose à révéler** : il accompagne le
 * « show N more lines », il ne vit jamais seul sur la ligne (§3.8 — ce qui est rare ne s'annonce pas).
 */
export function ToolLine(props: { tool: string; state: ToolState; open: boolean; onToggle: () => void }) {
  const [reveal, setReveal] = createSignal(false)
  const detail = () => toolDetail(props.state)
  const diff = () => fileDiff(props.state)
  const output = () => boundLines(detail().output ?? "", OUTPUT_PREVIEW_LINES)
  const bounded = () => output().hidden > 0
  return (
    <div class="tool" classList={{ failed: props.state.status === "error", open: props.open }}>
      <button class="tool-line" title={toolHint(props.tool)} onClick={() => props.onToggle()}>
        <ToolIcon tool={props.tool} />
        <span class="tool-name">{props.tool}</span>
        <Show when={toolTitle(props.state)}>{(title) => <span class="tool-title">{title()}</span>}</Show>
        <Show when={diff()}>{(value) => <span class="tool-diff">{diffLabel(value().additions, value().deletions)}</span>}</Show>
        <Show when={bounded()}>
          <span class="tool-size">{formatCount(toolOutputLines(props.state))} lines</span>
        </Show>
        <Show when={props.state.status !== "completed"}>
          <span class="tool-state">{toolStatusLabel(props.state)}</span>
        </Show>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <div class="tool-detail">
          <Show when={detail().input}>
            {(input) => (
              <>
                <pre>{input()}</pre>
                <Show when={copyableText(props.tool, props.state)}>
                  {(text) => <CopyButton text={text()} label="Copy command" />}
                </Show>
              </>
            )}
          </Show>
          <Show when={detail().output}>
            {(text) => (
              <>
                <pre class="out">{reveal() ? text() : output().head}</pre>
                <div class="tool-tools">
                  <Show when={bounded()}>
                    <button class="tool-reveal" onClick={() => setReveal((current) => !current)}>
                      {reveal() ? "show less" : `show ${output().hidden} more lines`}
                    </button>
                  </Show>
                  {/* On copie la sortie **complète**, jamais l'aperçu borné : copier 12 lignes sur 412
                      donnerait un résultat tronqué qui a l'air complet — le pire des cas. */}
                  <Show when={copyableOutput(props.state)}>
                    {(full) => <CopyButton text={full()} label="Copy output" />}
                  </Show>
                </div>
              </>
            )}
          </Show>
          <Show when={detail().error}>{(error) => <pre class="err">{error()}</pre>}</Show>
        </div>
      </Show>
    </div>
  )
}

/**
 * Réflexion de l'agent. Secondaire par nature : repliée, dans la même grammaire que les actions, et
 * nommée « thinking » — jamais rendue par son nom de type (`reasoning` n'est pas un mot d'écran).
 *
 * Elle donne sa **durée**, pas son volume : `reasoning.time` est présent 1 511 fois sur 1 511, donc la
 * mesure existe ; le nombre de mots, lui, ne dit rien de ce qui s'est passé.
 */
export function Reasoning(props: { text: string; durationMs?: number; open: boolean; onToggle: () => void }) {
  return (
    <div class="reasoning">
      <button class="reasoning-line" onClick={() => props.onToggle()}>
        <span>thinking</span>
        <Show when={formatDuration(props.durationMs)}>{(value) => <span class="reasoning-time">{value()}</span>}</Show>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <p class="reasoning-text">{props.text}</p>
      </Show>
    </div>
  )
}

/**
 * La prose de l'agent — la seule chose écrite **pour être lue**, donc au corps le plus grand, et en
 * texte nu : la dissymétrie avec le prompt de l'utilisateur dit qui a parlé.
 *
 * Deux textes ne sont pas de la prose et ne se présentent donc pas comme une réponse : `synthetic`
 * (injecté par le serveur — 73 occurrences mesurées) et `ignored` (jamais envoyé au modèle — 70). Les
 * afficher tels quels ferait passer un texte machine, ou un texte écarté, pour ce que l'agent a dit.
 */
export function Prose(props: { text: string; synthetic?: boolean; ignored?: boolean }) {
  const kind = () => proseKind(props)
  return (
    <div class="prose" classList={{ tagged: Boolean(kind()) }}>
      <Show when={kind()}>
        {(value) => <span class="prose-tag">{value() === "synthetic" ? "injected" : "not sent"}</span>}
      </Show>
      <p class="part text">{props.text}</p>
    </div>
  )
}

/** Nombre de fichiers d'un patch montrés avant le « +N more ». */
const PATCH_PREVIEW_FILES = 8

/** Un chemin long se lit par sa fin : `web-ui/CIBLE.md`, pas `C:\jeanluc\…\…\…`. */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length <= 3 ? path : parts.slice(-3).join("/")
}

/**
 * Un patch est un **contenu** : les fichiers changés (400 occurrences mesurées). Une ligne, la liste
 * se dépliant à la demande, bornée elle aussi — un patch de 40 fichiers ne déverse pas 40 chemins.
 */
export function PatchLine(props: { files: string[]; open: boolean; onToggle: () => void }) {
  const [reveal, setReveal] = createSignal(false)
  const shown = () => (reveal() ? props.files : props.files.slice(0, PATCH_PREVIEW_FILES))
  const hidden = () => Math.max(0, props.files.length - PATCH_PREVIEW_FILES)
  return (
    <div class="patch" classList={{ open: props.open }}>
      <button class="tool-line" onClick={() => props.onToggle()}>
        <span class="tool-name">patch</span>
        <span class="tool-title">{patchLabel(props)}</span>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <Show when={props.open}>
        <ul class="patch-files">
          <For each={shown()}>
            {(file) => (
              <li title={file}>
                <span class="patch-path">{shortPath(file)}</span>
                <CopyButton text={file} label="Copy path" />
              </li>
            )}
          </For>
          <Show when={hidden() > 0}>
            <li>
              <button class="tool-reveal" onClick={() => setReveal((current) => !current)}>
                {reveal() ? "show less" : `show ${hidden()} more files`}
              </button>
            </li>
          </Show>
        </ul>
      </Show>
    </div>
  )
}

/**
 * Une borne du récit : une compaction (coupe franche — ce qui suit ne s'appuie plus sur ce qui
 * précède) ou la relance d'une tentative échouée. Les cacher ferait mentir le fil sur ce qui s'est
 * passé ; les rendre comme du contenu les ferait passer pour ce que l'agent a dit.
 */
export function Boundary(props: { label: string }) {
  return (
    <div class="boundary">
      <span>{props.label}</span>
    </div>
  )
}

/**
 * Une étape — l'unité de lecture.
 *
 * Sa ligne d'en-tête porte **son prix** : coût, jetons, durée, nombre d'actions. `cost` et `tokens`
 * sont là 1 440 fois dans le relevé et ne s'affichaient jamais ; « combien a coûté ce travail » est
 * une question de lecteur, pas de comptable.
 *
 * Le repli porte sur le **travail** (outils, raisonnement, patches), jamais sur la prose : ce qu'on
 * vérifie se replie, ce qu'on lit reste. `step-start` n'est jamais rendu — 1 447 occurrences, aucun
 * contenu propre.
 */
export function StepBlock(props: { step: StepView; open: boolean; onToggle: () => void; children?: unknown }) {
  return (
    <div class="step" classList={{ open: props.open }}>
      <button class="step-head" onClick={() => props.onToggle()}>
        <span class="step-summary">{stepSummary(props.step)}</span>
        <span class="tool-chev">{props.open ? "▾" : "▸"}</span>
      </button>
      <div class="step-body">{props.children as never}</div>
    </div>
  )
}

export function PermissionSheet(props: { request: PermissionRequest; onReply: (reply: PermissionReply) => void }) {
  return (
    <div class="permission">
      <div class="permission-title">
        The agent asks to use <strong>{props.request.permission}</strong>
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

/**
 * La question de l'agent — le **seul** contrôle du fil.
 *
 * §3.1 : le fil est en lecture seule, sauf ici, et l'exception est motivée — l'agent est **bloqué**
 * sur sa question, et ne pas répondre arrête la conversation. Ce n'est donc pas une commodité : sans
 * ce contrôle, une session qui pose une question n'a plus aucun moyen d'en sortir depuis l'écran.
 *
 * Les options sont des **boutons**, pas le `Picker` cherchable : une question propose deux à cinq
 * choix de un à cinq mots, tous lisibles d'un coup. Le `Picker` existe pour les listes longues
 * (696 modèles) ; ici il ajouterait un clic et cacherait ce qui tient déjà à l'écran.
 *
 * La réponse est **positionnelle** (`string[][]`, un tableau de libellés par question) : l'ordre des
 * blocs suit donc exactement l'ordre des questions reçues, et rien ne les réordonne à l'affichage.
 */
export function QuestionSheet(props: {
  request: QuestionRequest
  answers: QuestionAnswers
  onToggle: (index: number, label: string, multiple: boolean) => void
  onCustom: (index: number, value: string) => void
  onSubmit: () => void
  onReject: () => void
}) {
  const complete = () => answersComplete(props.request, props.answers)
  return (
    <div class="question">
      <For each={props.request.questions}>
        {(item, index) => (
          <div class="question-item">
            <div class="question-head">{item.header}</div>
            <p class="question-text">{item.question}</p>
            <Show when={item.options.length > 0}>
              <div class="question-options">
                <For each={item.options}>
                  {(option) => (
                    <button
                      class="question-option"
                      classList={{ picked: isSelected(props.answers, index(), option.label) }}
                      title={option.description}
                      onClick={() => props.onToggle(index(), option.label, Boolean(item.multiple))}
                    >
                      <span class="question-label">{option.label}</span>
                      <span class="question-hint">{option.description}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            {/* `custom` vaut `true` par défaut côté serveur : on n'affiche le champ que s'il l'interdit pas. */}
            <Show when={item.custom !== false}>
              <input
                class="question-custom"
                type="text"
                placeholder="Or type an answer…"
                value={customValue(item, props.answers, index())}
                onInput={(event) => props.onCustom(index(), event.currentTarget.value)}
              />
            </Show>
          </div>
        )}
      </For>
      <div class="question-actions">
        <button class="primary" disabled={!complete()} onClick={() => props.onSubmit()}>
          Answer
        </button>
        <button class="ghost bordered" onClick={() => props.onReject()}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
