import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import {
  answersComplete,
  boundLines,
  cacheHitRate,
  contextFill,
  copyableOutput,
  copyableText,
  customValue,
  diffLabel,
  fileBadge,
  fileDiff,
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatRate,
  isSelected,
  OUTPUT_PREVIEW_LINES,
  patchLabel,
  patchLines,
  permissionActions,
  proseKind,
  stepSummary,
  tokensPerSecond,
  toolDetail,
  trajectory,
  type TurnView,
  toolOutputLines,
  toolStatusLabel,
  toolTitle,
  type DocumentRef,
  type MediaKind,
  type PermissionReply,
  type PermissionRequest,
  type QuestionAnswers,
  type QuestionRequest,
  type SessionStats,
  type StepView,
  type ToolState,
} from "./view-model"
import { markdownSpans, parseMarkdown, safeHref, type MdBlock, type MdInline } from "./markdown"
import { addItem, draftFrom, removeItem, setItem, todoProgress, type ContractDraft, type ContractView, type TodoView } from "./plan"
import { writeClipboard } from "./clipboard"
import { formatChars, injectionLabel, share, sourceLabel, type Injections } from "./injections"
import { CheckIcon, ChevronIcon, CopyIcon, CrossIcon, FolderIcon, PlusIcon, ThinkIcon, ToolIcon, toolHint } from "./icons"
import { toolIcon } from "./tool-icons"
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

   Elle n'a **plus** de lignes. Mesuré le 2026-10-14 : chaque ligne portait une icône générique
   identique pour tous les plugins, donc rien d'autre que son nom — et son `onRun` n'était jamais
   fourni, donc elle n'ouvrait rien. Une liste de noms sans action n'est pas un accès, c'est du bruit.

   La règle qui la remplace : **seuls les plugins qui ont un panneau se montrent au rail**. Aucun
   n'en a aujourd'hui — leurs options s'écrivent dans la configuration — donc le rail n'affiche
   qu'**une** entrée, qui ouvre la section `Plugins` des réglages, là où ils s'ajoutent et se
   retirent. La règle du fichier tient : un plugin est un bouton d'accès, pas un catalogue.
   ============================================================================= */

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
      <span>{props.expanded ? "show less" : `show ${props.hidden} more sessions`}</span>
    </button>
  )
}

/* =============================================================================
   Partie B du rail — les workspaces.

   Un workspace est un dossier ajouté ; il contient ses sessions, repliées ou dépliées à souhait.
   Le nom affiché est le chemin **relatif** (`packages/opencode`) ; le chemin absolu reste en
   infobulle, pour ne pas prendre la ligne.
   ============================================================================= */

/**
 * Ligne de workspace : le dossier, son nom — et **le geste qui compte**, ouvrir une session ici.
 *
 * Ce qui a été **retiré**, et pourquoi (mesuré le 2026-10-15) :
 *   - la **coche** du dossier courant : elle doublait un contraste qui suffit, sur une ligne que
 *     l'œil parcourt pour trouver un nom ;
 *   - le **compteur de sessions** : personne ne cherche « combien j'en ai créées » — le nombre
 *     occupait la place du nom ;
 *   - le **chevron** de pli : l'indentation des sessions sous le dossier dit déjà l'état.
 *
 * Le bouton de session, lui, **gagne** au contraire : icône à l'échelle de la colonne (16 px) et
 * visible **en permanence**, parce que c'est l'action qu'on vient chercher sur cette ligne.
 */
export function WorkspaceGroup(props: {
  label: string
  hint: string
  /** Est-ce le workspace où l'on travaille ? Il porte alors un contraste plus haut. */
  current?: boolean
  onToggle: () => void
  /** Ouvrir une session **dans ce dossier** — le geste qui vit sur la ligne du dossier. */
  onNew: () => void
}) {
  return (
    <div class="workspace" classList={{ current: Boolean(props.current) }}>
      <button class="workspace-main" title={props.hint} onClick={() => props.onToggle()}>
        <span class="workspace-icon">
          <FolderIcon size={16} />
        </span>
        <span class="workspace-label">{props.label}</span>
      </button>
      <button
        class="icon-btn workspace-new"
        title="New session in this folder"
        aria-label="New session in this folder"
        onClick={() => props.onNew()}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  )
}

/**
 * Ligne de session : le **nom**, puis son heure. Rien d'autre.
 *
 * Ce qui a été **retiré**, et pourquoi (mesuré le 2026-10-15) :
 *   - l'**icône de session** : identique sur toutes les lignes, elle ne distinguait rien — et elle
 *     coûtait de la largeur au nom, la seule information de la ligne ;
 *   - la **flèche de survol** et le détail repliable : la flèche occupait une colonne de la grille,
 *     ce qui repoussait l'heure à **39 px du bord** ; et le détail qu'elle révélait est déjà dans
 *     l'infobulle et dans la page Logs ;
 *   - l'**indentation** revient à 12 px : elle dit l'appartenance sans manger le nom, qui ne
 *     disposait plus que de 156 px sur 280.
 *
 * L'infobulle reste : elle porte le nom complet, l'agent, le modèle, les jetons et le coût — un
 * endroit pour ce qui n'a pas à tenir à l'écran.
 */
export function SessionRow(props: {
  title: string
  /** Infobulle : nom complet + activité (agent, modèle, jetons, coût, fichiers). */
  hint: string
  time: number | undefined
  now: number
  active: boolean
  onSelect: () => void
  children?: unknown
}) {
  return (
    <div class="row" classList={{ active: props.active }} onClick={() => props.onSelect()}>
      <span class="row-main">
        <span class="row-title" title={props.hint}>
          {props.title}
        </span>
        {props.children as never}
      </span>
      <span class="row-time">{relativeTime(props.time, props.now)}</span>
    </div>
  )
}

/** Un tour de conversation. Le rôle porte la classe : `user` ou `agent`. */
export function Turn(props: { role: string; children?: unknown }) {
  return <div class={`turn ${props.role === "user" ? "user" : "agent"}`}>{props.children as never}</div>
}

/**
 * Le geste « copier » réduit à son icône, pour les endroits où un mot serait du bruit.
 *
 * Il remplace le dessin **à l'intérieur** de la même boîte : copier → fait → échoué, trois formes,
 * jamais un quatrième état. L'échec prend la couleur d'alerte **et** une croix — une couleur seule
 * ne se lit pas (même règle que `CopyButton`, dont l'échec s'écrit).
 */
export function CopyIconButton(props: { text: string; label: string }) {
  const [state, setState] = createSignal<"idle" | "done" | "failed">("idle")
  let timer: ReturnType<typeof setTimeout> | undefined
  const copy = async () => {
    const ok = await writeClipboard(props.text)
    setState(ok ? "done" : "failed")
    clearTimeout(timer)
    timer = setTimeout(() => setState("idle"), 1500)
  }
  onCleanup(() => clearTimeout(timer))
  const title = () => (state() === "done" ? "Copied" : state() === "failed" ? "Copy failed" : props.label)
  return (
    <button
      class="copy-icon"
      classList={{ done: state() === "done", failed: state() === "failed" }}
      title={title()}
      aria-label={title()}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
    >
      {state() === "done" ? <CheckIcon /> : state() === "failed" ? <CrossIcon /> : <CopyIcon />}
    </button>
  )
}

/**
 * Le prompt de l'utilisateur.
 *
 * C'est le seul texte de l'écran qu'il a écrit lui-même : il doit se reconnaître au premier regard,
 * donc une surface à lui, dans la largeur de lecture.
 *
 * Il passe par le **même** moteur markdown que la prose de l'agent : un prompt s'écrit en markdown,
 * et le montrer en texte brut obligeait à lire des `**` et des `#`. Les sauts durs (`  ` ou `\` en fin
 * de ligne) gardent ses retours — sans quoi le rendre en markdown aurait **retiré** une chose que le
 * fil affichait avant.
 *
 * L'action vit **sous** la carte, pas dessus : posée en surimpression, elle mordait le texte et
 * obligeait à réserver une place qui n'est pas la sienne. Sous la carte, elle ne prend rien à la
 * lecture et se trouve là où le regard finit de lire le prompt.
 */
export function UserPrompt(props: { text: string }) {
  return (
    <div class="prompt-block">
      <div class="prompt">
        <Markdown text={props.text} />
      </div>
      <div class="prompt-foot">
        {/* On copie la **source**, jamais le texte rendu : recopier l'affichage perdrait la mise en
            forme que l'utilisateur a saisie. */}
        <CopyIconButton text={props.text} label="Copy prompt" />
      </div>
    </div>
  )
}

/**
 * Ce que le serveur a injecté dans le contexte **avant** le prompt.
 *
 * Il le joint en texte brut ; on le rend comme une structure : une ligne par section, son volume,
 * et la part qu'elle prend. Replié par défaut — c'est une information de confiance, pas de
 * lecture. Déplié, il répond à « qu'est-ce qui consomme ma fenêtre ? », question qu'aucune autre
 * surface ne traite et qu'aucune estimation ne peut remplacer.
 */
export function ContextInjections(props: {
  injections: Injections
  open: boolean
  onToggle: () => void
  /**
   * Le contenu d'un fichier d'instructions, quand il est **lisible d'ici**.
   *
   * La lecture est tentée au dépli, jamais avant : ces fichiers pèsent des milliers d'octets et la
   * plupart du temps on ne regarde que leur nom. `undefined` n'est pas une erreur — c'est le cas
   * normal d'un fichier hors du projet, et il se dit.
   */
  loadSource?: (path: string) => Promise<string | undefined>
}) {
  const total = () => props.injections.sections.reduce((sum, section) => sum + section.chars, 0)
  const bySources = () => props.injections.kind === "sources"
  /**
   * Le dépli d'**une** source à la fois : deux fichiers ouverts en même temps pousseraient le reste
   * du fil hors de l'écran, et on ne compare pas deux injections d'instructions côte à côte.
   */
  const [openSource, setOpenSource] = createSignal<string | undefined>()
  const [sourceText, setSourceText] = createSignal<Record<string, string | undefined>>({})
  const [loadingSource, setLoadingSource] = createSignal<string | undefined>()

  const toggleSource = async (path: string) => {
    if (openSource() === path) {
      setOpenSource(undefined)
      return
    }
    setOpenSource(path)
    // Le contenu déjà lu n'est pas relu : un fichier d'instructions ne change pas pendant qu'on lit.
    if (sourceText()[path] !== undefined || !props.loadSource) return
    setLoadingSource(path)
    const text = await props.loadSource(path).catch(() => undefined)
    setSourceText((current) => ({ ...current, [path]: text ?? "" }))
    setLoadingSource(undefined)
  }
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
                    {/* Le nom seul ne suffit pas : on déplie pour lire **le chemin entier** et le
                        contenu. C'est la réponse à « qu'est-ce qui a été injecté, et d'où ? ». */}
                    <button class="inj-source" onClick={() => void toggleSource(path)} title={path}>
                      <span class="inj-chev">{openSource() === path ? "▾" : "▸"}</span>
                      <span class="inj-path">{sourceLabel(path)}</span>
                    </button>
                    <Show when={openSource() === path}>
                      <div class="inj-source-body">
                        <p class="inj-source-path">{path}</p>
                        <Show
                          when={sourceText()[path]}
                          fallback={
                            <p class="inj-source-empty">
                              {loadingSource() === path ? "loading…" : "not readable from here"}
                            </p>
                          }
                        >
                          {(text) => (
                            <pre class="inj-source-text">
                              {text().split(/\r?\n/).slice(0, SOURCE_PREVIEW_LINES).join("\n")}
                            </pre>
                          )}
                        </Show>
                      </div>
                    </Show>
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
    <div class={`tool fam-${toolIcon(props.tool)}`} classList={{ failed: props.state.status === "error", open: props.open }}>
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
        <ThinkIcon />
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
      <Markdown text={props.text} />
    </div>
  )
}

/**
 * Nombre de fichiers d'un patch montrés avant le « +N more ».
 */
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
 * Une étape — un regroupement du flux, sans en-tête ni bordure.
 *
 * Elle ne porte **aucune statistique** (§9.3) : la ligne « step 3 · 6 actions · 2.8s · $0.0008 ·
 * 31k tokens » n'est plus dans le fil, elle est dans `SessionPanel`. Ici une étape n'est qu'une
 * **suite du flux** : rien à annoncer, rien à encadrer.
 */
export function StepBlock(props: { step: StepView; children?: unknown }) {
  return <div class="step">{props.children as never}</div>
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

/* =============================================================================
   Le markdown — CIBLE.md §12.1.

   On ne rend **jamais** de HTML : l'analyseur (`markdown.ts`) produit un arbre, et l'on construit les
   balises ici. Solid échappe le texte par défaut, donc la sûreté tient par construction — la prose
   d'un modèle est une donnée, jamais du balisage de confiance.
   ============================================================================= */

/** Le texte en ligne : c'est ici que le contenu d'un modèle est posé, donc ici que rien ne s'exécute. */
function Inline(props: { nodes: MdInline[] }) {
  return (
    <>
      {props.nodes.map((node) => {
        if (node.kind === "text") return node.text
        if (node.kind === "code") return <code class="md-code">{node.text}</code>
        if (node.kind === "strong") return <strong><Inline nodes={node.children} /></strong>
        if (node.kind === "em") return <em><Inline nodes={node.children} /></em>
        if (node.kind === "image") {
          // Une image accepte sa data URL (c'est une pièce jointe) — pas une data URL quelconque.
          const src = safeHref(node.src, true)
          if (!src) return node.alt
          return <img class="md-image" src={src} alt={node.alt} loading="lazy" />
        }
        // Un saut dur : le markdown écrase les retours simples, pas ceux que l'auteur a marqués.
        if (node.kind === "break") return <br />
        if (node.kind === "link") {
          const href = safeHref(node.href)
          // Une destination refusée ne casse pas le texte : on garde le libellé, on jette le lien.
          if (!href) return <Inline nodes={node.children} />
          return (
            <a class="md-link" href={href} target="_blank" rel="noreferrer noopener">
              <Inline nodes={node.children} />
            </a>
          )
        }
        return null
      })}
    </>
  )
}

function MdBlockView(props: { block: MdBlock }) {
  const block = props.block

  if (block.kind === "heading") {
    // Décalé de deux niveaux : le fil a déjà sa structure, un `#` de l'agent n'est pas un `h1` de page.
    const children = <Inline nodes={block.children} />
    if (block.level === 1) return <h3 class="md-h md-h1">{children}</h3>
    if (block.level === 2) return <h4 class="md-h md-h2">{children}</h4>
    if (block.level === 3) return <h5 class="md-h md-h3">{children}</h5>
    return <h6 class="md-h md-h4">{children}</h6>
  }

  if (block.kind === "paragraph") return <p class="md-p"><Inline nodes={block.children} /></p>

  if (block.kind === "code") {
    return (
      <div class="md-block">
        <Show when={block.lang}>{(lang) => <span class="md-lang">{lang()}</span>}</Show>
        <pre class="md-pre"><code>{block.text}</code></pre>
      </div>
    )
  }

  if (block.kind === "quote") {
    return <blockquote class="md-quote"><Inline nodes={block.children} /></blockquote>
  }

  if (block.kind === "rule") return <hr class="md-rule" />

  if (block.kind === "list") {
    const items = block.items.map((item) => (
      <li>
        <Inline nodes={item.children} />
        <Show when={item.sub}>{(sub) => <MdBlockView block={sub()} />}</Show>
      </li>
    ))
    return block.ordered ? <ol class="md-list">{items}</ol> : <ul class="md-list">{items}</ul>
  }

  if (block.kind === "table") {
    return (
      <div class="md-table-wrap">
        <table class="md-table">
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th class={`md-${block.align[index] ?? "left"}`}><Inline nodes={cell} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr>
                {row.map((cell, index) => (
                  <td class={`md-${block.align[index] ?? "left"}`}><Inline nodes={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}

/** La prose de l'agent, rendue. Le markdown est analysé une fois par texte, pas à chaque rendu. */
export function Markdown(props: { text: string }) {
  const blocks = createMemo(() => parseMarkdown(props.text))
  return (
    <div class="md">
      <For each={blocks()}>{(block) => <MdBlockView block={block} />}</For>
    </div>
  )
}

/* =============================================================================
   Les médias — CIBLE.md §12.2. « On rend quand on a les octets, on nomme quand on ne les a pas. »
   ============================================================================= */

export function Media(props: { kind: MediaKind; url: string; name: string }) {
  const src = () => safeHref(props.url, true)
  return (
    <Show when={src()}>
      {(source) => (
        <figure class="media">
          <Show
            when={props.kind === "image"}
            fallback={<video class="media-video" src={source()} controls preload="metadata" />}
          >
            <img class="media-image" src={source()} alt={props.name} loading="lazy" />
          </Show>
          <figcaption>{props.name}</figcaption>
        </figure>
      )}
    </Show>
  )
}

/* =============================================================================
   Les fichiers **modifiés** par la réponse — CIBLE.md §12.3. Le bilan, à la fin du dernier step.
   Contenu (un nom, des ±lignes, le diff), jamais performance.
   ============================================================================= */

export function ModifiedFiles(props: { docs: DocumentRef[] }) {
  /** Les fichiers dont le diff est déplié, par chemin — un même fichier peut revenir dans deux tours. */
  const [open, setOpen] = createSignal<Record<string, boolean>>({})
  const toggle = (path: string) => setOpen({ ...open(), [path]: !open()[path] })

  /**
   * Le total des ±lignes, **seulement** s'il en existe au moins une.
   *
   * Un total à « +0 −0 » serait un chiffre faux : la moitié des entrées n'ont pas de comptage (les
   * fichiers d'un `patch` n'en portent pas), et l'additionner à zéro ferait croire à un travail nul
   * là où il n'a simplement pas été mesuré.
   */
  const totals = createMemo(() => {
    let additions = 0
    let deletions = 0
    let counted = false
    for (const doc of props.docs) {
      if (doc.additions !== undefined || doc.deletions !== undefined) {
        counted = true
        additions += doc.additions ?? 0
        deletions += doc.deletions ?? 0
      }
    }
    return counted ? { additions, deletions } : undefined
  })

  return (
    <Show when={props.docs.length > 0}>
      <div class="files">
        <div class="files-head">
          <span class="files-title">modified files</span>
          <span class="files-count">
            {props.docs.length} {props.docs.length > 1 ? "files" : "file"}
          </span>
          <span class="trace-spacer" />
          <Show when={totals()}>
            {(total) => (
              <span class="files-total">
                <span class="add">+{total().additions}</span>
                <span class="del">−{total().deletions}</span>
              </span>
            )}
          </Show>
        </div>
        <ul class="files-list">
          <For each={props.docs}>
            {(doc) => {
              const badge = fileBadge(doc.path)
              // Le diff n'existe que pour les outils qui écrivent ; les fichiers d'un `patch` n'en
              // portent pas, et la ligne le dit alors en n'offrant pas de chevron.
              const lines = createMemo(() => patchLines(doc.patch))
              const shown = () => Boolean(open()[doc.path])
              return (
                <li class="file" classList={{ open: shown() }}>
                  <div
                    class="file-row"
                    classList={{ "is-openable": lines().length > 0 }}
                    title={doc.path}
                    onClick={() => lines().length > 0 && toggle(doc.path)}
                  >
                    <span class="file-chevron" classList={{ open: shown(), vide: lines().length === 0 }}>
                      ›
                    </span>
                    {/* Les lettres de l'extension, teintées par **nature** de fichier : un raccourci
                        lisible, jamais une icône indéchiffrable. */}
                    <span class={`doc-badge doc-${badge.family}`}>{badge.label}</span>
                    <span class="docs-path">{shortPath(doc.path)}</span>
                    <Show when={doc.additions !== undefined && doc.deletions !== undefined}>
                      <span class="tool-diff">{diffLabel(doc.additions ?? 0, doc.deletions ?? 0)}</span>
                    </Show>
                    <CopyButton text={doc.path} label="Copy path" />
                  </div>
                  <Show when={shown()}>
                    <div class="file-diff">
                      <For each={lines()}>
                        {(line) => (
                          <div class={`dl dl-${line.kind}`}>
                            <span class="dl-sign">
                              {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                            </span>
                            <span class="dl-text">{line.text}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </li>
              )
            }}
          </For>
        </ul>
      </div>
    </Show>
  )
}

/* =============================================================================
   Le plan de la session — les **todos** et le **contrat de tâche**, juste au-dessus du compositeur.

   Les deux répondent à la même question — « où en est-on ? » — et à deux moments différents : le
   contrat est ce qui a été **demandé**, les todos ce qui est **fait**. Ils vivent donc au même
   endroit, collés au-dessus du champ où l'on écrit, et non dans le fil : ils décrivent l'état
   courant, pas un moment passé.

   Au repos, chacun tient sur **une ligne** : un compte et l'item en cours pour les todos, l'objectif
   pour le contrat. Le reste se déplie — même règle que la liste Trajectory : ce qui est rare ne
   s'affiche pas au repos.
   ============================================================================= */

/** Le glyphe d'un état de todo — un signe, jamais un mot : la ligne doit rester une ligne. */
const TODO_GLYPH: Record<TodoView["status"], string> = {
  completed: "✓",
  in_progress: "▸",
  pending: "·",
  cancelled: "✕",
}

export function TodoList(props: { todos: TodoView[] }) {
  const [open, setOpen] = createSignal(false)
  const progress = createMemo(() => todoProgress(props.todos))
  const percent = createMemo(() => {
    const { done, total } = progress()
    return total > 0 ? Math.round((done / total) * 100) : 0
  })
  return (
    <Show when={props.todos.length > 0}>
      <div class="plan">
        <div class="plan-card" classList={{ open: open() }}>
          <button class="plan-head" title="Todos" onClick={() => setOpen(!open())}>
            <span class="plan-chevron" classList={{ open: open() }}>
              ›
            </span>
            <span class="plan-title">todos</span>
            <span class="plan-count">
              {progress().done}/{progress().total}
            </span>
            {/* L'item en cours est la seule information qui mérite le repos : c'est ce que l'agent
                fait maintenant. Le compte dit où l'on en est ; le reste se déplie. */}
            <Show when={progress().active}>
              {(todo) => (
                <span class="plan-active" title={todo().content}>
                  {todo().content}
                </span>
              )}
            </Show>
          </button>
          {/* La barre reste **visible carte pliée** : c'est elle qui répond à « où en est-on ? »
              sans rien ouvrir. Un compteur se lit, une barre se voit. */}
          <div
            class="plan-progress"
            role="progressbar"
            aria-valuenow={percent()}
            aria-valuemin={0}
            aria-valuemax={100}
            title={`${progress().done}/${progress().total}`}
          >
            <div class="plan-progress-fill" style={{ width: `${percent()}%` }} />
          </div>
          <Show when={open()}>
            <ul class="plan-list">
              <For each={props.todos}>
                {(todo) => (
                  <li class={`plan-item st-${todo.status}`} title={todo.content}>
                    {/* La **case** est ce qui fait lire la liste comme une checklist : sans elle, un
                        glyphe en tête de ligne reste une puce, et l'état se déduit au lieu de se
                        voir. Le glyphe vit *dans* la case ; c'est la case qui porte l'état. */}
                    <span
                      class="todo-box"
                      classList={{
                        on: todo.status === "completed",
                        doing: todo.status === "in_progress",
                        off: todo.status === "cancelled",
                      }}
                    >
                      {TODO_GLYPH[todo.status]}
                    </span>
                    <span class="plan-text">{todo.content}</span>
                    <Show when={todo.priority === "high"}>
                      <span class="plan-prio">high</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </Show>
  )
}

/**
 * Le contrat de tâche — objectif, Definition of Done, hors-périmètre — **éditable**.
 *
 * Le contrat est la seule partie du plan qu'une main humaine doit pouvoir corriger : l'agent le
 * déduit de la demande, et une déduction se trompe. Le lire sans pouvoir le reprendre obligeait à
 * écrire dans le fil pour le faire changer.
 *
 * L'écriture passe par `PATCH /session/{id}` avec un `goalState` — route **existante**, vérifiée par
 * un PATCH réel (200, objectif relu modifié, `version` 5 → 6). Le composant ne connaît ni le réseau
 * ni le SDK : il reçoit `onSave` et **dit** ce qui s'est passé, réussite comme échec. Un
 * enregistrement silencieux laisserait croire qu'il a réussi.
 */
export function TaskContract(props: {
  contract: ContractView
  onSave?: (draft: ContractDraft) => Promise<boolean>
}) {
  const [open, setOpen] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal<ContractDraft>(draftFrom(props.contract))
  const [saving, setSaving] = createSignal(false)
  const [failure, setFailure] = createSignal<string | undefined>(undefined)

  const startEdit = () => {
    // Le brouillon repart du contrat **affiché**, jamais d'une saisie abandonnée.
    setDraft(draftFrom(props.contract))
    setFailure(undefined)
    setOpen(true)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setFailure(undefined)
  }

  const save = async () => {
    if (!props.onSave || saving()) return
    setSaving(true)
    setFailure(undefined)
    const accepted = await props.onSave(draft())
    setSaving(false)
    if (accepted) setEditing(false)
    else setFailure("The contract was not saved.")
  }

  return (
    <div class="plan">
      <div class="plan-card" classList={{ open: open() }}>
        <div class="plan-head-row">
          <button class="plan-head" title="Task contract" onClick={() => setOpen(!open())}>
            <span class="plan-chevron" classList={{ open: open() }}>
              ›
            </span>
            <span class="plan-title">contract</span>
            {/* L'objectif est la ligne du repos : c'est lui qui dit de quoi il s'agit, et il se rogne
                plutôt que de passer à la ligne — le détail est dans le dépli. */}
            <span class="plan-active">{props.contract.goal}</span>
            <Show when={props.contract.dod.length > 0}>
              <span class="plan-count">DoD {props.contract.dod.length}</span>
            </Show>
          </button>
          <Show when={props.onSave && !editing()}>
            <button class="plan-edit-btn" title="Edit the contract" aria-label="Edit the contract" onClick={startEdit}>
              ✎
            </button>
          </Show>
        </div>
        <Show when={editing()}>
          <div class="plan-edit">
            <h4 class="plan-sub">Objective</h4>
            <textarea
              class="plan-input"
              rows="2"
              value={draft().goal}
              onInput={(event) => setDraft({ ...draft(), goal: event.currentTarget.value })}
            />
            <h4 class="plan-sub">Definition of done</h4>
            <For each={draft().dod}>
              {(item, index) => (
                <div class="plan-row">
                  <input
                    class="plan-input"
                    value={item}
                    onInput={(event) =>
                      setDraft({ ...draft(), dod: setItem(draft().dod, index(), event.currentTarget.value) })
                    }
                  />
                  <button
                    class="plan-remove"
                    title="Remove"
                    aria-label="Remove"
                    onClick={() => setDraft({ ...draft(), dod: removeItem(draft().dod, index()) })}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
            <button class="plan-add" onClick={() => setDraft({ ...draft(), dod: addItem(draft().dod) })}>
              + criterion
            </button>
            <h4 class="plan-sub">Out of scope</h4>
            <For each={draft().outOfScope}>
              {(item, index) => (
                <div class="plan-row">
                  <input
                    class="plan-input"
                    value={item}
                    onInput={(event) =>
                      setDraft({ ...draft(), outOfScope: setItem(draft().outOfScope, index(), event.currentTarget.value) })
                    }
                  />
                  <button
                    class="plan-remove"
                    title="Remove"
                    aria-label="Remove"
                    onClick={() => setDraft({ ...draft(), outOfScope: removeItem(draft().outOfScope, index()) })}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
            <button class="plan-add" onClick={() => setDraft({ ...draft(), outOfScope: addItem(draft().outOfScope) })}>
              + exclusion
            </button>
            <Show when={failure()}>{(message) => <p class="plan-error">{message()}</p>}</Show>
            <div class="plan-actions">
              <button class="plan-save" disabled={saving() || !draft().goal.trim()} onClick={() => void save()}>
                {saving() ? "Saving…" : "Save"}
              </button>
              <button class="plan-cancel" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        </Show>
        <Show when={!editing() && open()}>
          <div class="plan-body">
            <Show when={props.contract.goal}>
              <h4 class="plan-sub">Objective</h4>
              <p class="plan-goal">{props.contract.goal}</p>
            </Show>
            <Show when={props.contract.dod.length > 0}>
              <h4 class="plan-sub">Definition of done</h4>
              <ul class="plan-list">
                <For each={props.contract.dod}>
                  {(item) => (
                    <li class="plan-item" title={item}>
                      <span class="todo-box on">✓</span>
                      <span class="plan-text">{item}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={props.contract.outOfScope.length > 0}>
              <h4 class="plan-sub">Out of scope</h4>
              <ul class="plan-list">
                <For each={props.contract.outOfScope}>
                  {(item) => (
                    <li class="plan-item out" title={item}>
                      <span class="todo-box off">✕</span>
                      <span class="plan-text">{item}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

/* =============================================================================
   Le travail est un **flux**, pas un repli — §9.2 révisé.

   Un repli qui cache tout ne laisse rien à lire : ce n'est pas de la densité, c'est une absence.
   Le travail s'affiche donc en continu, une ligne par fait. `ToolLine`, `Reasoning` et `PatchLine`
   sont déjà cette ligne ; chaque entrée se déplie **elle-même** pour son détail.
   ============================================================================= */

/* =============================================================================
   Le calque du compositeur — CIBLE.md §13.2.

   Il est posé **sous** le champ, à métriques identiques, et il ne fait qu'une chose : colorer la
   syntaxe. Le champ lui-même reste un `textarea` — le seul contrôle qui garde un curseur, une
   sélection et le copier-coller du système — mais son texte est transparent : ce qu'on lit vient du
   calque.
   ============================================================================= */

export function ComposerMarkup(props: { text: string }) {
  const spans = createMemo(() => markdownSpans(props.text))
  return (
    <div class="composer-markup" aria-hidden="true">
      <For each={spans()}>{(span) => <span class={`mk mk-${span.kind}`}>{span.text}</span>}</For>
      {/* Un caractère de largeur nulle : sans lui, un texte finissant par un retour à la ligne
          perdrait sa dernière ligne dans le calque, et le champ défilerait seul. */}
      <span class="mk mk-plain">{"\u200b"}</span>
    </div>
  )
}

/* =============================================================================
   La trajectoire — CIBLE.md §10.2.

   Le fil raconte ce qui s'est passé ; la trajectoire dit **comment** et **à quel prix**. Un tour y
   est un bloc, et il contient dans l'ordre : par quel agent et quel modèle il a été produit, ce qui a
   été **envoyé** (le prompt, puis ce que le serveur a injecté avant lui), ce qui est **revenu** (les
   jetons séparés par origine), puis chaque **étape** avec ses outils, son motif d'arrêt et son coût.

   Deux règles de composition :

   1. **Une ligne ne dit qu'un fait, et son libellé à gauche.** On lit une trajectoire en descendant
      une colonne, pas en cherchant le chiffre dans une phrase.
   2. **Une donnée absente disparaît** (§10.1) : une étape de raisonnement n'a pas d'outil et le dit
      (« reasoning »), mais une durée inconnue ne s'affiche pas comme un zéro.
   ============================================================================= */

export function TrajectoryPanel(props: { turns: TurnView[] }) {
  const traces = createMemo(() => trajectory(props.turns))
  const injectionSummary = (injections: Injections) =>
    injections.kind === "sources"
      ? `${injections.sources.length} file${injections.sources.length > 1 ? "s" : ""}`
      : `${injections.sections.length} section${injections.sections.length > 1 ? "s" : ""}`
  return (
    <Show when={traces().length > 0} fallback={<p class="log-empty">No turns in this session yet.</p>}>
      <ol class="trace-list">
        <For each={traces()}>
          {(trace) => (
            <li class="trace-turn">
              <div class="trace-head">
                <span class="trace-index">#{trace.turn}</span>
                <span class="trace-role">{trace.role}</span>
                <Show when={trace.agent}>{(agent) => <span class="trace-tag">{agent()}</span>}</Show>
                <Show when={trace.mode}>{(mode) => <span class="trace-tag">{mode()}</span>}</Show>
                <span class="trace-model" title={trace.model ?? undefined}>
                  {trace.model ?? "model unknown"}
                </span>
                <span class="trace-spacer" />
                <Show when={formatDuration(trace.durationMs)}>
                  {(value) => <span class="trace-fact">{value()}</span>}
                </Show>
                <Show when={formatCost(trace.cost)}>{(value) => <span class="trace-fact">{value()}</span>}</Show>
              </div>
              {/* Ce qui a été **envoyé**. */}
              <div class="trace-row">
                <span class="trace-label">prompt</span>
                <span class="trace-value">{trace.promptChars.toLocaleString()} chars</span>
              </div>
              <Show when={trace.systemChars}>
                {(chars) => (
                  <div class="trace-row">
                    <span class="trace-label">system</span>
                    <span class="trace-value">
                      {chars().toLocaleString()} chars — a system prompt was overridden
                    </span>
                  </div>
                )}
              </Show>
              <Show when={trace.injections}>
                {(injections) => (
                  <div class="trace-row">
                    <span class="trace-label">injected</span>
                    <span class="trace-value">{injectionSummary(injections())}</span>
                  </div>
                )}
              </Show>
              {/* Ce qui est **revenu**, séparé par origine : entrée, sortie, cache, raisonnement. */}
              <div class="trace-row">
                <span class="trace-label">tokens</span>
                <span class="trace-value">
                  {trace.input.toLocaleString()} in · {trace.output.toLocaleString()} out
                  <Show when={trace.reasoning > 0}> · {trace.reasoning.toLocaleString()} thinking</Show>
                  {" · "}
                  {trace.cacheRead.toLocaleString()} cached
                </span>
              </div>
              {/* L'état de la fenêtre en fin de tour : c'est lui qui explique une compaction. */}
              <Show when={trace.contextTokens}>
                {(tokens) => (
                  <div class="trace-row">
                    <span class="trace-label">context</span>
                    <span class="trace-value">{tokens().toLocaleString()} tokens in the window</span>
                  </div>
                )}
              </Show>
              <Show when={trace.cwd}>
                {(cwd) => (
                  <div class="trace-row">
                    <span class="trace-label">cwd</span>
                    <span class="trace-value" title={cwd()}>
                      {cwd()}
                    </span>
                  </div>
                )}
              </Show>
              <Show when={trace.steps.length > 0}>
                <div class="trace-steps">
                  <For each={trace.steps}>
                    {(step) => (
                      <div class="trace-step">
                        <span class="trace-step-index">step {step.index}</span>
                        <span class="trace-tools">{step.tools.length > 0 ? step.tools.join(", ") : "reasoning"}</span>
                        <span class="trace-spacer" />
                        <Show when={step.reason}>{(reason) => <span class="trace-fact">{reason()}</span>}</Show>
                        <span class="trace-fact">
                          {step.input.toLocaleString()}↓ {step.output.toLocaleString()}↑
                        </span>
                        <Show when={formatDuration(step.durationMs)}>
                          {(value) => <span class="trace-fact">{value()}</span>}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              {/* L'erreur, quand il y en a une : c'est la première chose qu'on cherche après coup. */}
              <Show when={trace.error}>{(error) => <p class="trace-error">{error()}</p>}</Show>
            </li>
          )}
        </For>
      </ol>
    </Show>
  )
}

/* =============================================================================
   Les statistiques — CIBLE.md §10. Exactement ce que le fil n'affiche plus.
   ============================================================================= */

/**
 * Les lignes montrées d'un fichier d'instructions déplié.
 *
 * Un `AGENTS.md` fait 7 291 octets (mesuré) : le montrer en entier noierait le fil sous un document
 * qu'on n'a pas demandé à lire. On en montre le début — assez pour reconnaître le fichier et voir de
 * quoi il parle — et on dit combien de lignes restent.
 */
const SOURCE_PREVIEW_LINES = 40

export function SessionPanel(props: { stats: SessionStats }) {
  const aggregates = () => {
    const stats = props.stats
    return [
      { label: "turns", value: String(stats.turns) },
      { label: "steps", value: String(stats.steps) },
      { label: "actions", value: String(stats.actions) },
      { label: "time", value: formatDuration(stats.durationMs) ?? "none" },
      { label: "tokens", value: formatCount(stats.tokens) ?? "none" },
      { label: "cost", value: formatCost(stats.cost) ?? "none" },
    ]
  }
  return (
    <div class="stats">
      <dl class="stats-grid">
        <For each={aggregates()}>
          {(row) => (
            <>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </>
          )}
        </For>
      </dl>
      <Show when={props.stats.perStep.length > 0}>
        <ol class="stats-steps">
          {/* La ligne d'étape rejetée du fil est ici : sa place est là où on la cherche. */}
          <For each={props.stats.perStep}>{(entry) => <li>{stepSummary(entry.step)}</li>}</For>
        </ol>
      </Show>
    </div>
  )
}

/* =============================================================================
   La barre de statistiques de la saisie — CIBLE.md §10.

   Elle vit **sous le champ**, et pas dans le tiroir : les trois chiffres qu'on y lit répondent à la
   question qu'on se pose en écrivant — « où en est cette session, et à quelle vitesse ? ». Le tiroir
   garde le détail par étape, qui ne se consulte pas en écrivant.

   Deux règles de composition :

   1. **Un groupe est un fait vérifiable**, et son infobulle dit la mesure exacte. Un chiffre sans
      unité ni provenance n'est pas une information — c'est ce qui distingue « 93% » d'un nombre
      décoratif.
   2. **Un groupe dont la donnée manque disparaît.** La barre ne montre jamais un remplissage de
      contexte à zéro faute de limite connue : elle se tait, plutôt que d'inventer un « 0% » qui
      ferait croire à une fenêtre vide.
   ============================================================================= */

export function ComposerStats(props: { stats: SessionStats; contextLimit?: number; working?: boolean }) {
  const rate = () => formatRate(tokensPerSecond(props.stats))
  const cached = () => formatPercent(cacheHitRate(props.stats))
  const fill = () => formatPercent(contextFill(props.stats.contextTokens, props.contextLimit))
  const tokens = () => formatCount(props.stats.tokens)
  const steps = () => `${props.stats.steps} step${props.stats.steps > 1 ? "s" : ""}`
  const turns = () => `${props.stats.turns} turn${props.stats.turns > 1 ? "s" : ""}`
  return (
    <Show when={props.stats.turns > 0}>
      <div class="composer-stats">
        <span
          class="stat"
          title={`${props.stats.turns} turns, ${props.stats.steps} steps, ${props.stats.actions} actions in this session`}
        >
          {turns()} · {steps()}
        </span>
        <Show when={rate()}>
          {(value) => (
            <span class="stat" title="Output tokens per second, measured over the steps' own duration">
              {value()}
            </span>
          )}
        </Show>
        <Show when={tokens()}>
          {(value) => (
            <span
              class="stat"
              title={`Tokens processed: ${props.stats.input.toLocaleString()} in, ${props.stats.output.toLocaleString()} out, ${props.stats.cacheRead.toLocaleString()} read from cache`}
            >
              {value()} tok
            </span>
          )}
        </Show>
        <Show when={cached()}>
          {(value) => (
            <span class="stat" title="Share of the input served from the prompt cache">
              {value()} cached
            </span>
          )}
        </Show>
        <Show when={fill()}>
          {(value) => (
            <span
              class="stat"
              title={`Context window: ${(props.stats.contextTokens ?? 0).toLocaleString()} of ${(props.contextLimit ?? 0).toLocaleString()} tokens`}
            >
              {value()} context
            </span>
          )}
        </Show>
        {/* L'arrêt n'est **pas** un bouton au repos : il ne s'affiche que pendant que l'agent
            travaille, et il dit la touche plutôt que de laisser la deviner. */}
        <Show when={props.working}>
          <span class="stat stop-hint" title="Press Escape twice to stop the agent">
            esc esc to stop
          </span>
        </Show>
      </div>
    </Show>
  )
}
