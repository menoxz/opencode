/**
 * La vue `Trajectory` — reprise de la **capture** de DSH (onglet `Trajectory`).
 *
 * La référence est la capture, et non une source : le composant de DSH appartient au client packagé
 * (`@deepseek-ai/dsh-client-ui-*`) et n'est pas lisible ici — `dsh-identite` n'est qu'une *skin*
 * (« aucune fonctionnalité métier, uniquement de la mise en forme »). La première tentative avait
 * repris `dsh-TUI/src/components/TraceView.tsx`, un composant de **terminal** : c'était du DSH, mais
 * pas celui de l'écran. L'écran fait foi.
 *
 * Deux colonnes : à gauche la **trajectoire** — une barre d'outils (`Duration`, `Turns`, `Calls`,
 * recherche), un **diagramme en pistes** (`Input` / `Model` / `Tools`, barres proportionnelles au
 * temps), puis la **liste** (badge de genre, contenu à gauche, résultat à droite après `→`) ; à
 * droite le **détail** de la ligne choisie (`Summary` / `Preview` / `Raw`).
 *
 * Les deux colonnes défilent **séparément** : on lit le détail d'une ligne sans perdre la ligne, et
 * l'inverse. C'est pour cela que le panneau est une colonne de la vue et non un tiroir par-dessus.
 */

import { createMemo, createSignal, For, Show } from "solid-js"
import { formatCount, formatDuration, formatRate, type TurnView } from "./view-model"
import {
  rowDuration,
  spanPlacement,
  trajectoryRange,
  trajectoryRows,
  trajectorySpans,
  type TraceDetailTab,
  type TraceRow,
  type TraceRowKind,
  type TraceTrack,
} from "./trajectory"
import { ClockIcon, ListIcon, SearchIcon } from "./icons"

/** Les badges de la liste, tels que la capture les écrit. */
const ROW_BADGE: Record<TraceRowKind, string> = {
  user: "USER",
  assistant: "ASSISTANT",
  tool: "TOOL",
}

/** Les pistes du diagramme, dans l'ordre de la capture. */
const TRACKS: Array<{ track: TraceTrack; label: string }> = [
  { track: "input", label: "Input" },
  { track: "model", label: "Model" },
  { track: "tools", label: "Tools" },
]

/** Les onglets du panneau de détail, dans l'ordre de la capture. */
const DETAIL_TABS: TraceDetailTab[] = ["summary", "preview", "raw"]

const DETAIL_LABEL: Record<TraceDetailTab, string> = {
  summary: "Summary",
  preview: "Preview",
  raw: "Raw",
}

/** L'état d'une ligne, en mot — la capture écrit `Completed`. */
function detailStatus(status: TraceRow["status"]): string {
  if (status === "error") return "Error"
  if (status === "running") return "Running"
  return "Completed"
}

/**
 * Un horodatage lisible : `2026-10-12 16:02:54.104`.
 *
 * Les millisecondes sont là parce que la capture les montre : à l'échelle d'une trajectoire, trois
 * chiffres après la seconde séparent deux appels d'outil consécutifs.
 */
function formatStamp(time: number | undefined): string {
  if (typeof time !== "number") return "unknown"
  const date = new Date(time)
  const pad = (value: number, size = 2) => String(value).padStart(size, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    pad(date.getMilliseconds(), 3)
  )
}

/**
 * Le débit d'une ligne : ses jetons sur son intervalle — `132 tok/s`, comme la capture l'écrit.
 *
 * Il n'existe que si les deux sont connus : un débit calculé sur une durée absente serait un chiffre
 * inventé, et c'est précisément ce qu'un panneau de diagnostic ne doit pas faire.
 */
function rowRate(row: TraceRow): string | undefined {
  if (typeof row.tokens !== "number" || typeof row.durationMs !== "number" || row.durationMs <= 0) {
    return undefined
  }
  return formatRate((row.tokens / row.durationMs) * 1000)
}

/** La tranche de texte que l'onglet `Preview` montre : le message écrit, ou les arguments d'un outil. */
function rowPreview(row: TraceRow): string | undefined {
  return row.contentFull ?? row.payload
}

export function TrajectoryView(props: {
  turns: TurnView[]
  /**
   * Le schéma déclaré d'un outil, quand il est connu (`GET /experimental/tool`).
   *
   * Il vient de l'appelant : la route exige un couple `provider`/`model`, que seul l'écran connaît,
   * et sa charge pèse des dizaines de kilo-octets — on ne la lit que pour l'outil ouvert.
   */
  toolSchema?: (id: string) => { description?: string; parameters?: unknown } | undefined
}) {
  const rows = createMemo(() => trajectoryRows(props.turns))
  const spans = createMemo(() => trajectorySpans(props.turns))
  const range = createMemo(() => trajectoryRange(rows(), spans()))
  // Les trois bascules, toutes actives au départ : c'est l'état de la capture.
  const [showDurations, setShowDurations] = createSignal(true)
  const [showTurns, setShowTurns] = createSignal(true)
  const [showCalls, setShowCalls] = createSignal(true)
  const [query, setQuery] = createSignal("")
  /**
   * La ligne ouverte dans le panneau, et son onglet.
   *
   * On garde la **ligne** et non son numéro : la liste est filtrée et recherchée, donc un numéro
   * désignerait une autre ligne dès qu'on tape dans la recherche — le panneau montrerait autre chose
   * que ce qu'on a cliqué.
   */
  const [selected, setSelected] = createSignal<TraceRow | undefined>()
  const [tab, setTab] = createSignal<TraceDetailTab>("summary")
  // Les sections du `Summary` sont dépliées au départ : c'est la vue d'ensemble, celle qu'on vient
  // lire. Le repli sert à écarter une section devenue trop longue, pas à cacher le contenu.
  const [openPreview, setOpenPreview] = createSignal(true)
  const [openThinking, setOpenThinking] = createSignal(true)
  const [openTiming, setOpenTiming] = createSignal(true)

  const visible = createMemo(() => {
    const search = query().trim().toLowerCase()
    return rows()
      .filter((row) => (showCalls() ? true : row.kind !== "tool"))
      .filter((row) =>
        search === ""
          ? true
          : row.content.toLowerCase().includes(search) || (row.result ?? "").toLowerCase().includes(search),
      )
  })

  const schema = createMemo(() => {
    const row = selected()
    return row?.tool ? props.toolSchema?.(row.tool) : undefined
  })

  return (
    <div class="tj">
      <div class="tj-main">
        <div class="tj-tools">
          <button
            class="tj-toggle"
            classList={{ active: showDurations() }}
            onClick={() => setShowDurations(!showDurations())}
          >
            <ClockIcon /> Duration
          </button>
          <button class="tj-toggle" classList={{ active: showTurns() }} onClick={() => setShowTurns(!showTurns())}>
            <ListIcon /> Turns
          </button>
          <button class="tj-toggle" classList={{ active: showCalls() }} onClick={() => setShowCalls(!showCalls())}>
            Calls
          </button>
          <span class="trace-spacer" />
          <label class="tj-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>

        {/* Le diagramme : une piste par genre, chaque barre placée à sa position dans le temps. */}
        <div class="tj-chart">
          <For each={TRACKS}>
            {(entry) => (
              <div class="tj-track">
                <span class="tj-track-label">{entry.label}</span>
                <div class="tj-lane">
                  <For each={spans().filter((span) => span.track === entry.track)}>
                    {(span) => {
                      const place = spanPlacement(span, range())
                      return (
                        <span
                          class="tj-bar"
                          classList={{
                            [`bar-${entry.track}`]: true,
                            "bar-error": span.status === "error",
                            "bar-running": span.status === "running",
                          }}
                          style={{ left: `${place.left}%`, width: `${place.width}%` }}
                          title={formatDuration(Math.max(0, span.end - span.start)) ?? undefined}
                        />
                      )
                    }}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        <Show when={visible().length > 0} fallback={<p class="trace-empty">No events to show</p>}>
          <div class="tj-list">
            <For each={visible()}>
              {(row, index) => (
                <>
                  {/* Le repère de tour n'apparaît qu'au **changement** de tour : le répéter sur chaque
                      ligne ne dirait rien de plus et pousserait le contenu. */}
                  <Show when={showTurns() && (index() === 0 || visible()[index() - 1]!.turn !== row.turn)}>
                    <div class="tj-turn">Turn {row.turn}</div>
                  </Show>
                  <div
                    class="tj-row"
                    classList={{
                      [`row-${row.kind}`]: true,
                      "row-error": row.status === "error",
                      "is-selected": selected()?.seq === row.seq,
                      // La largeur du contenu dépend de la présence d'un résultat : c'est ce qui fait
                      // tomber le `→` au même x sur toutes les lignes.
                      "has-result": Boolean(row.result),
                    }}
                    onClick={() => setSelected(row)}
                  >
                    <span class="tj-mark" />
                    <span class="tj-bullet">•</span>
                    <span class={`tj-badge badge-${row.kind}`}>{ROW_BADGE[row.kind]}</span>
                    {/* La ligne est tronquée, donc elle porte son texte entier en infobulle : ce qui
                        est coupé reste atteignable sans ouvrir le panneau. */}
                    <span
                      class="tj-content"
                      classList={{ "is-empty": row.toolCallOnly }}
                      title={row.toolCallOnly ? undefined : row.content}
                    >
                      {row.toolCallOnly ? "(tool call only)" : row.content}
                    </span>
                    {/* La durée ne s'affiche que sur un **appel d'outil**, comme la capture : sur un
                        message, l'intervalle de l'étape est une information de détail, pas de liste. */}
                    <Show when={showDurations() && row.kind === "tool" && rowDuration(row)}>
                      {(value) => <span class="tj-duration">{value()}</span>}
                    </Show>
                    <Show when={row.result}>
                      {(result) => (
                        <span class="tj-result" title={result()}>
                          <span class="tj-arrow">→</span> {result()}
                        </span>
                      )}
                    </Show>
                  </div>
                </>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Le panneau de détail — les trois onglets de la capture. Il ouvre une **colonne** à droite,
          et la liste se rétrécit d'autant : on regarde un bloc et son détail, jamais l'un sans
          l'autre. Son défilement est le sien. */}
      <Show when={selected()}>
        {(entry) => (
          <aside class="tj-detail">
            <div class="tj-detail-head">
              <span class={`tj-badge badge-${entry().kind}`}>{ROW_BADGE[entry().kind]}</span>
              <span class="tj-detail-title">
                Turn {entry().turn} · Step {entry().step}
                {entry().tool ? ` · ${entry().tool}` : ""}
              </span>
              <span class="trace-spacer" />
              <button class="tj-detail-close" title="Close" onClick={() => setSelected(undefined)}>
                ✕
              </button>
            </div>
            <div class="tj-detail-tabs">
              <For each={DETAIL_TABS}>
                {(name) => (
                  <button class="tj-dtab" classList={{ active: tab() === name }} onClick={() => setTab(name)}>
                    {DETAIL_LABEL[name]}
                  </button>
                )}
              </For>
            </div>
            <div class="tj-detail-body">
              <Show when={tab() === "summary"}>
                <div class="tj-field">
                  <span class="tj-field-label">Source</span>
                  <span class="tj-field-value">Request #{entry().turn}</span>
                </div>
                <div class="tj-field">
                  <span class="tj-field-label">Status</span>
                  <span class="tj-field-value">{detailStatus(entry().status)}</span>
                </div>
                <Show when={formatCount(entry().tokens)}>
                  {(count) => (
                    <div class="tj-field">
                      <span class="tj-field-label">Tokens</span>
                      <span class="tj-field-value">{count()} tok</span>
                    </div>
                  )}
                </Show>

                <Show when={entry().thinking}>
                  {(text) => (
                    <>
                      <button class="tj-section" onClick={() => setOpenPreview(!openPreview())}>
                        <span class="tj-chevron" classList={{ open: openPreview() }}>
                          ›
                        </span>
                        Preview
                      </button>
                      <Show when={openPreview()}>
                        <button class="tj-section sub" onClick={() => setOpenThinking(!openThinking())}>
                          <span class="tj-chevron" classList={{ open: openThinking() }}>
                            ›
                          </span>
                          Thinking
                        </button>
                        <Show when={openThinking()}>
                          <p class="tj-think">{text()}</p>
                        </Show>
                      </Show>
                    </>
                  )}
                </Show>

                <button class="tj-section" onClick={() => setOpenTiming(!openTiming())}>
                  <span class="tj-chevron" classList={{ open: openTiming() }}>
                    ›
                  </span>
                  Request Timing
                </button>
                <Show when={openTiming()}>
                  <div class="tj-field">
                    <span class="tj-field-label">Started</span>
                    <span class="tj-field-value">{formatStamp(entry().started)}</span>
                  </div>
                  <div class="tj-field">
                    <span class="tj-field-label">Total duration</span>
                    <span class="tj-field-value">{formatDuration(entry().durationMs) ?? "—"}</span>
                  </div>
                  <Show when={rowRate(entry())}>
                    {(rate) => (
                      <div class="tj-field">
                        <span class="tj-field-label">Throughput</span>
                        <span class="tj-field-value">{rate()}</span>
                      </div>
                    )}
                  </Show>
                </Show>
              </Show>

              <Show when={tab() === "preview"}>
                <Show when={rowPreview(entry())} fallback={<p class="tj-empty">Nothing to preview here.</p>}>
                  {(text) => <pre class="tj-pre">{text()}</pre>}
                </Show>
                <Show when={entry().resultFull}>
                  {(result) => (
                    <>
                      <h4 class="tj-field-title">Result</h4>
                      <pre class="tj-pre">{result()}</pre>
                    </>
                  )}
                </Show>
              </Show>

              <Show when={tab() === "raw"}>
                <Show
                  when={entry().payload || entry().resultFull || schema()}
                  fallback={<p class="tj-empty">Nothing raw for this line.</p>}
                >
                  <Show when={entry().payload}>
                    {(payload) => (
                      <>
                        <h4 class="tj-field-title">Payload</h4>
                        <pre class="tj-pre">{payload()}</pre>
                      </>
                    )}
                  </Show>
                  <Show when={schema()}>
                    {(declared) => (
                      <>
                        <h4 class="tj-field-title">Schema</h4>
                        <Show when={declared().description}>
                          {(text) => <p class="tj-schema-desc">{text()}</p>}
                        </Show>
                        <pre class="tj-pre">{JSON.stringify(declared().parameters, null, 2)}</pre>
                      </>
                    )}
                  </Show>
                  <Show when={entry().resultFull}>
                    {(result) => (
                      <>
                        <h4 class="tj-field-title">Result</h4>
                        <pre class="tj-pre">{result()}</pre>
                      </>
                    )}
                  </Show>
                </Show>
              </Show>
            </div>
          </aside>
        )}
      </Show>
    </div>
  )
}
