/**
 * La trajectoire — le modèle de la vue `Trajectory` de DSH (l'onglet de la capture fournie).
 *
 * **La référence est la capture**, pas la source : le composant de DSH appartient au client packagé
 * (`@deepseek-ai/dsh-client-ui-*`, bundles minifiés) et n'est pas lisible ici ; `dsh-identite` n'est
 * qu'une *skin* (« aucune fonctionnalité métier, uniquement de la mise en forme »). Le seul artefact
 * exploitable est donc l'écran, et c'est lui qui fait foi.
 *
 * Ce qu'il montre, et que ce module calcule :
 *
 * - une **liste d'événements** à deux colonnes — un badge de genre (`ASSISTANT` / `TOOL` / `USER`),
 *   le contenu à gauche, le **résultat** à droite après `→` —, groupée par `Turn N` ;
 * - un **diagramme en pistes** (`Input` / `Model` / `Tools`) dont les barres sont proportionnelles au
 *   temps, avec un curseur.
 *
 * Ce module est pur : il ne connaît ni le JSX ni le DOM, donc il se vérifie par des tests (`bun` ne
 * peut pas exécuter de JSX ici, cf. `view-model.ts`).
 */

import { parseInjections } from "./injections"
import { errorText, formatDuration, type PartTime, type StepView, type TurnView } from "./view-model"

/** Les onglets du panneau de détail — les trois de la capture de DSH. */
export type TraceDetailTab = "summary" | "preview" | "raw"

/** Les genres de ligne du diagramme — les pistes de DSH. */
export type TraceTrack = "input" | "model" | "tools"

/** Une barre du diagramme : un intervalle sur une piste. */
export type TraceSpan = {
  track: TraceTrack
  /** Début en ms (absolu, comme les événements). */
  start: number
  end: number
  status?: "ok" | "error" | "running"
}

/** Les genres de badge de la liste — les trois de DSH. */
export type TraceRowKind = "user" | "assistant" | "tool"

/** Une ligne de la liste. */
export type TraceRow = {
  seq: number
  time: number
  /** Le numéro de tour affiché (`Turn N` en marge). */
  turn: number
  /** Le rang de la ligne **dans son tour** — le `Step 18` de l'en-tête du panneau. */
  step: number
  kind: TraceRowKind
  /** Colonne de gauche. Pour un outil : `nom {arguments}`. */
  content: string
  /** Le texte **entier** : la liste l'aplatit sur une ligne, le panneau le montre tel quel. */
  contentFull?: string
  /** Colonne de droite, après `→`. Absente quand il n'y a pas de résultat à montrer. */
  result?: string
  /** Un assistant sans texte : DSH écrit « (tool call only) » plutôt que de laisser le vide. */
  toolCallOnly?: boolean
  durationMs?: number
  status?: "ok" | "error" | "running"
  /**
   * Le nom de l'outil, quand la ligne en est un — la clé du **schéma** dans
   * `/experimental/tool`, sans laquelle le panneau de détail ne peut rien dire de l'outil.
   */
  tool?: string
  /** Les arguments, en JSON lisible : c'est le *Payload* du panneau de détail. */
  payload?: string
  /** La sortie **entière** : la liste la rogne, le panneau la montre telle quelle. */
  resultFull?: string
  /** L'instant de départ, pour le *Timing* du panneau. */
  started?: number
  /**
   * Les jetons **produits** par l'étape — le `Tokens` du panneau de détail.
   *
   * C'est la sortie, et non le total : le total d'une étape est la taille du **contexte** qu'elle a
   * relu, et il se remplace d'une étape à l'autre au lieu de s'additionner (mesuré). Un message,
   * lui, se compte par ce qu'il a produit.
   */
  tokens?: number
  /** Le raisonnement de l'étape — la section `Preview › Thinking` du panneau. */
  thinking?: string
}

/** Aplatit les blancs — une ligne de liste reste une ligne. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** L'horodatage d'une partie, en cherchant dans son état comme dans `spanMs`. */
function partTime(part: { time?: PartTime; state?: unknown }): { start?: number; end?: number } {
  const state = part.state && typeof part.state === "object" ? (part.state as { time?: PartTime }) : undefined
  const time = part.time ?? state?.time
  return { start: time?.start, end: time?.end }
}

/** L'intervalle couvert par une étape : de son premier fait à son dernier. */
function stepSpan(step: StepView): { start?: number; end?: number } {
  let start: number | undefined
  let end: number | undefined
  for (const item of step.items) {
    const { start: s, end: e } = partTime(item)
    if (typeof s === "number" && (start === undefined || s < start)) start = s
    if (typeof e === "number" && (end === undefined || e > end)) end = e
  }
  return { start, end }
}

/**
 * Les barres du diagramme, dans l'ordre du temps.
 *
 * Trois pistes, comme DSH : `input` (ce qui entre — le prompt d'un tour), `model` (chaque étape de
 * génération) et `tools` (chaque exécution d'outil). Une barre sans fin connue est une barre
 * **ouverte** : elle se dessine jusqu'au bord, et son statut dit qu'elle tourne encore.
 */
export function trajectorySpans(turns: TurnView[]): TraceSpan[] {
  const spans: TraceSpan[] = []
  for (const turn of turns) {
    // Un tour sans horodatage existe quand même — le serveur ne le donne pas toujours (question en
    // attente, tour rejoué). On le place à **0** plutôt que de l'écarter : l'écarter supprimait aussi
    // ses outils et ses étapes du diagramme, alors qu'ils ont bien eu lieu. Un tour sans travail reste
    // donc une entrée de durée nulle, pas une absence.
    const started = turn.info.time?.created ?? 0
    // `input` : de l'arrivée du prompt au **début du premier travail** — le temps où l'entrée se
    // constitue. La fin du tour serait une barre couvrant tout le tour : la piste ne dirait plus rien,
    // et c'est la **répartition** qu'on vient lire ici.
    const opened = turn.steps.length > 0 ? stepSpan(turn.steps[0]!) : undefined
    spans.push({
      track: "input",
      start: started,
      end: typeof opened?.start === "number" && opened.start > started ? opened.start : started,
      status: "ok",
    })
    for (const step of turn.steps) {
      const span = stepSpan(step)
      if (typeof span.start === "number") {
        spans.push({
          track: "model",
          start: span.start,
          end: typeof span.end === "number" ? span.end : started,
          status: typeof span.end === "number" ? "ok" : "running",
        })
      }
      for (const item of step.items) {
        if (item.type !== "tool" || !item.tool) continue
        const { start, end } = partTime(item)
        if (typeof start !== "number") continue
        const status = item.state?.status
        spans.push({
          track: "tools",
          start,
          end: typeof end === "number" ? end : start,
          status: status === "error" ? "error" : status === "completed" ? "ok" : "running",
        })
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

/**
 * Les lignes de la liste.
 *
 * Une ligne par fait : un prompt (`USER`), un texte d'agent (`ASSISTANT`), un appel d'outil (`TOOL`).
 * Les raisonnements ne sont **pas** des lignes — DSH ne les met pas dans cette liste, et la capture
 * le confirme : on y voit des `ASSISTANT` et des `TOOL`, jamais un « thinking ».
 *
 * Un assistant sans texte existe pourtant (l'étape qui n'a fait qu'appeler un outil) : DSH l'affiche
 * `(tool call only)`. On le reproduit plutôt que de sauter la ligne — sauter romprait l'ordre du temps,
 * qui est ce que la liste raconte.
 */
export function trajectoryRows(turns: TurnView[]): TraceRow[] {
  const rows: TraceRow[] = []
  let seq = 0

  turns.forEach((turn, index) => {
    const started = turn.info.time?.created ?? 0
    const number = index + 1
    // Le rang se compte **par tour**, pas globalement : le panneau décrit un bloc, et `Step 18` y
    // situe la ligne dans son tour — un rang de session ne dirait rien d'utile au lecteur.
    let stepNo = 0
    const push = (row: Omit<TraceRow, "seq" | "step">) => {
      seq += 1
      stepNo += 1
      rows.push({ seq, step: stepNo, ...row })
    }
    for (const part of turn.prompt) {
      if (part.type !== "text" || !flat(part.text ?? "")) continue
      // Le **contexte injecté** n'est pas un prompt de l'humain, et la capture de DSH ne le montre
      // pas comme tel : sans ce filtre, une ligne `USER` annoncerait comme dit ce qui ne l'a pas été.
      if (parseInjections(part.text ?? "")) continue
      push({
        time: started,
        turn: number,
        kind: "user",
        content: flat(part.text ?? ""),
        contentFull: part.text ?? "",
      })
    }
    for (const step of turn.steps) {
      const span = stepSpan(step)
      const when = span.start ?? started
      const tools = step.items.filter((item) => item.type === "tool" && item.tool)
      const written = step.items.filter((item) => item.type === "text" && flat(item.text ?? ""))
      const text = written.map((item) => flat(item.text ?? "")).join(" ")
      const full = written.map((item) => item.text ?? "").join("\n\n")
      const answered = turn.replies.some((reply) => Boolean(errorText(reply.error)))
      // Ce qu'une étape a produit, en une fois : ses jetons de sortie, son raisonnement, son
      // intervalle. Un assistant **sans texte** les porte aussi — c'est l'étape qui n'a fait
      // qu'appeler un outil, et c'est justement là que le raisonnement se lit.
      const common = {
        time: when,
        turn: number,
        kind: "assistant" as const,
        started: span.start,
        durationMs:
          typeof span.start === "number" && typeof span.end === "number"
            ? Math.max(0, span.end - span.start)
            : undefined,
        tokens: step.usage?.output,
        thinking: step.reason,
      }
      if (text) {
        push({ ...common, content: text, contentFull: full, status: answered ? "error" : "ok" })
      } else if (tools.length > 0) {
        // Aucun texte mais des outils : la ligne existe quand même, et elle le dit.
        push({ ...common, content: "", toolCallOnly: true })
      }
      for (const item of tools) {
        const { start, end } = partTime(item)
        const durationMs =
          typeof start === "number" && typeof end === "number" ? Math.max(0, end - start) : undefined
        const state = item.state
        const input = state && "input" in state ? state.input : undefined
        const output = state && "output" in state ? String(state.output ?? "") : ""
        const args = input ? JSON.stringify(input) : ""
        push({
          time: typeof start === "number" ? start : when,
          turn: number,
          kind: "tool",
          tool: item.tool,
          content: `${item.tool ?? ""}${args && args !== "{}" ? ` ${args}` : ""}`,
          result: flat(output).slice(0, 400),
          resultFull: output,
          payload: input ? JSON.stringify(input, null, 2) : undefined,
          started: start,
          durationMs,
          status: state?.status === "error" ? "error" : state?.status === "completed" ? "ok" : "running",
        })
      }
    }
  })
  return rows
}

/** L'intervalle de temps couvert par les lignes et les barres — l'axe du diagramme. */
export function trajectoryRange(rows: TraceRow[], spans: TraceSpan[]): { start: number; end: number } {
  const times: number[] = []
  for (const row of rows) times.push(row.time)
  for (const span of spans) times.push(span.start, span.end)
  if (times.length === 0) return { start: 0, end: 0 }
  return { start: Math.min(...times), end: Math.max(...times) }
}

/** Où placer une barre, en pourcentage de la largeur : `{ left, width }`, bornés à `[0, 100]`. */
export function spanPlacement(
  span: { start: number; end: number },
  range: { start: number; end: number },
): { left: number; width: number } {
  const total = range.end - range.start
  if (total <= 0) return { left: 0, width: 100 }
  // On borne **d'abord** la position, puis la largeur sur ce qu'il reste à droite : borner la largeur
  // d'après la position *non* bornée laissait une barre dépasser (mesuré : `left 0` + `width 150`,
  // pour une barre qui commence avant l'intervalle affiché).
  const left = Math.max(0, Math.min(100, ((span.start - range.start) / total) * 100))
  const width = ((span.end - span.start) / total) * 100
  return { left, width: Math.max(0.4, Math.min(100 - left, width)) }
}

/** Le résumé de durée d'une ligne — `(13ms)`, `(…)` si elle tourne encore. */
export function rowDuration(row: TraceRow): string | undefined {
  if (row.durationMs !== undefined) return formatDuration(row.durationMs)
  return undefined
}
