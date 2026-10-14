import { parseInjections, type Injections } from "./injections"

/**
 * Pure decision logic for the web UI, kept free of JSX so it can be tested with `bun test`.
 *
 * Rationale: Vite needs `jsx: "preserve"` (vite-plugin-solid compiles the JSX) while Bun needs
 * `jsx: "react-jsx"` to run a file containing JSX. The two cannot share one tsconfig, so anything
 * worth asserting lives here, in plain TypeScript, and the components stay thin.
 */

/**
 * `metadata` est lu ici, et il l'était pas avant : 2 245 parts du relevé en portent, et il est la
 * **seule** source de certaines informations affichées. Mesuré sur données réelles :
 * `edit.filediff = { file, patch, additions, deletions }` — les ±lignes d'une écriture, que
 * `PatchPart` ne porte pas (il n'a que `hash` et `files[]`) ; `bash.exit`, `bash.truncated`,
 * `read.preview`, `write.filepath`. Sans ce champ typé, la ligne d'action ne peut rien dire de juste.
 */
export type ToolMetadata = Record<string, unknown>

/** Mirrors `ToolState` (packages/sdk/js/src/v2/gen/types.gen.ts:574-629). */
export type ToolState =
  | { status: "pending"; input: Record<string, unknown>; raw: string; metadata?: ToolMetadata }
  | {
      status: "running"
      input: Record<string, unknown>
      title?: string
      time: { start: number }
      metadata?: ToolMetadata
    }
  | {
      status: "completed"
      input: Record<string, unknown>
      output: string
      title: string
      time: { start: number; end: number }
      metadata?: ToolMetadata
      attachments?: unknown[]
    }
  | {
      status: "error"
      input: Record<string, unknown>
      error: string
      time: { start: number; end: number }
      metadata?: ToolMetadata
    }

/** Mirrors `PermissionRequest` (types.gen.ts:178-191). */
export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
}

export type PermissionReply = "once" | "always" | "reject"

export type UiEvent = { type: string; properties?: unknown }

export function toolStatusLabel(state: ToolState): string {
  switch (state.status) {
    case "pending":
      return "pending"
    case "running":
      return "running"
    case "completed":
      return "completed"
    case "error":
      return "error"
  }
}

/** Only `running` and `completed` carry a human title. */
export function toolTitle(state: ToolState): string | undefined {
  if (state.status === "running") return state.title
  if (state.status === "completed") return state.title
  return undefined
}

/**
 * What the expanded panel shows. `pending` exposes only the raw call, `running` only the input,
 * `completed` adds the output, `error` the message — never an empty box.
 */
export function toolDetail(state: ToolState): { input?: string; output?: string; error?: string } {
  const detail: { input?: string; output?: string; error?: string } = {}
  if (Object.keys(state.input ?? {}).length > 0) detail.input = JSON.stringify(state.input, null, 2)
  if (state.status === "completed") detail.output = state.output
  if (state.status === "error") detail.error = state.error
  return detail
}

/** A permission is only worth an "always" button when the server offered patterns for it. */
export function canAlways(request: PermissionRequest): boolean {
  return request.always.length > 0
}

/**
 * Reducer behind the permission panel. `permission.asked` adds, `permission.replied` removes —
 * keyed on `requestID`, which is the field the replied event actually carries.
 */
export function reducePermissions(current: PermissionRequest[], event: UiEvent): PermissionRequest[] {
  if (event.type === "permission.asked") {
    const request = event.properties as PermissionRequest | undefined
    if (!request?.id) return current
    if (current.some((item) => item.id === request.id)) return current
    return [...current, request]
  }
  if (event.type === "permission.replied") {
    const requestID = (event.properties as { requestID?: string } | undefined)?.requestID
    if (!requestID) return current
    return current.filter((item) => item.id !== requestID)
  }
  return current
}

/** Removes a request locally after the user answered, before the server confirms. */
export function dropPermission(current: PermissionRequest[], requestID: string): PermissionRequest[] {
  return current.filter((item) => item.id !== requestID)
}

/** Which reply the user can send for a request, in display order. */
export function permissionActions(request: PermissionRequest): PermissionReply[] {
  return canAlways(request) ? ["once", "always", "reject"] : ["once", "reject"]
}

/* =============================================================================
   Le fil — l'unité de lecture est **l'étape**, pas le message.

   Une réponse d'agent n'est pas un bloc : c'est une suite d'étapes — 1 447 `step-start` pour 230
   messages sur les conversations réelles, soit ~6 appels au modèle par réponse —, chacune avec son
   coût, ses jetons, ses outils et son raisonnement propres. Tout regrouper dans une bulle de message
   détruit la seule structure qui existe. D'où deux fonctions pures : `groupTurns` puis `groupSteps`.
   ============================================================================= */

/** Ce que porte `step-finish` : 1 440 occurrences mesurées, jamais affichées avant. */
export type TokenCount = {
  total?: number
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

/** `reasoning` donne `{start,end}` (1 511/1 511 mesurés), `retry` donne `{created}`. */
export type PartTime = { start?: number; end?: number; created?: number }

/**
 * Miroir **permissif** de l'union `Part` du serveur (`message-v2.ts:553`), limité aux champs que le
 * fil lit. Volontairement non discriminée : le rendu aiguille sur `type`, qui est une chaîne ouverte,
 * et un type inconnu doit rester sans effet plutôt que casser la lecture du fil.
 */
export type Part = {
  id?: string
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
  time?: PartTime
  metadata?: Record<string, unknown>
  tool?: string
  state?: ToolState
  hash?: string
  files?: string[]
  mime?: string
  filename?: string
  url?: string
  reason?: string
  cost?: number
  tokens?: TokenCount
  auto?: boolean
  autocontinue?: boolean
  overflow?: boolean
  tail_start_id?: string
  attempt?: number
  error?: unknown
  [key: string]: unknown
}

export type Message = {
  info: {
    id: string
    role: string
    cost?: number
    tokens?: TokenCount
    /**
     * Le modèle qui a produit une réponse d'agent, et l'agent qui a répondu.
     *
     * C'est la **seule** description de ce que la session utilise réellement — la configuration ne
     * donne qu'un défaut global. La saisie s'en sert pour amorcer ses deux choix, et le remplissage du
     * contexte a besoin du `providerID/modelID` pour retrouver sa limite.
     */
    providerID?: string
    modelID?: string
    agent?: string
    /**
     * Le mode de l'agent, ses bornes de temps, et l'erreur éventuelle.
     *
     * Ce sont les trois choses qu'un diagnostic par tour demande et que le fil n'affiche pas : *par
     * quel mode* la réponse a été produite, *combien de temps* elle a pris, et *pourquoi* elle a
     * échoué. `time.completed` manquant est en soi une information — une réponse qui n'a pas fini.
     */
    mode?: string
    time?: { created?: number; completed?: number }
    error?: unknown
    /**
     * Le modèle **demandé**, sur un message d'utilisateur (`{ providerID, modelID, variant? }`).
     *
     * Il est imbriqué, contrairement à celui d'une réponse : c'est la forme du serveur, et la
     * confusion entre les deux ferait lire un modèle vide sur les messages d'utilisateur.
     */
    model?: { providerID?: string; modelID?: string; variant?: string }
    /**
     * Le dossier de travail du tour, sur les messages d'agent.
     *
     * Deux tours d'une même session peuvent tourner dans des dossiers différents (le dossier de
     * travail se change en cours de route) : c'est une information de diagnostic, pas un détail.
     */
    path?: { cwd?: string }
    /** Un prompt système de remplacement, sur les messages d'utilisateur. */
    system?: string
  }
  parts: Part[]
}

export type StepView = {
  /** Numéro affiché, à partir de 1 : « step 3 ». */
  index: number
  items: Part[]
  actions: number
  cost: number
  tokens: number
  durationMs: number | undefined
  /**
   * Le détail des jetons, quand `step-finish` le porte.
   *
   * Le total ne suffit pas aux deux chiffres qu'on veut lire : les tok/s se calculent sur les jetons
   * **produits**, et le taux de cache sur `cache.read` face à l'entrée. Additionné par étape, il ne
   * sort jamais du fil — il alimente la barre de statistiques sous la saisie.
   */
  usage?: StepUsage
  /**
   * Le motif de fin d'étape — `stop`, `tool-calls`, `length`…
   *
   * C'est la réponse à « pourquoi cette étape s'est-elle arrêtée là ? », et c'est la première chose
   * qu'on cherche quand une réponse se coupe : une longueur atteinte ne se répare pas comme un arrêt
   * normal.
   */
  reason?: string
}

export type StepUsage = {
  input?: number
  output?: number
  /**
   * Les jetons de **raisonnement**, comptés à part par le serveur.
   *
   * Ils sont déjà dans le total, mais un total ne dit pas combien le modèle a « pensé » avant de
   * répondre : c'est le premier chiffre qu'on regarde quand un tour coûte cher sans rien produire.
   */
  reasoning?: number
  cacheRead?: number
  cacheWrite?: number
  /** `tokens.total` de l'étape : c'est la taille du contexte **à ce moment-là**. */
  total?: number
}

export type TurnView = {
  id: string
  role: string
  /** Le prompt de l'utilisateur, tel qu'il l'a écrit. */
  prompt: Part[]
  steps: StepView[]
  /**
   * L'information du message d'origine, gardée telle quelle.
   *
   * Le fil n'en a pas besoin — il rend des parties — mais la **trajectoire** oui : c'est la seule
   * source du modèle, de l'agent, du mode, des bornes de temps et de l'erreur d'un tour. La garder ici
   * évite de relire les messages bruts dans un second passage, ce qui risquerait de désynchroniser les
   * deux lectures.
   */
  info: Message["info"]
  /**
   * Les réponses d'agent du tour, avec leur information.
   *
   * C'est là que vivent ce que le tour a **réellement** utilisé — le modèle et l'agent retenus, le
   * mode, la borne de fin, l'erreur — là où le message de l'utilisateur ne porte que ce qu'il a
   * *demandé*. Un tour peut porter plusieurs réponses (une par étape) : on les garde toutes, et la
   * dernière fait foi pour ce qui est continu.
   */
  replies: Message["info"][]
}

/** Types qui ne portent rien pour l'utilisateur, quel que soit leur volume. */
const HIDDEN_TYPES = new Set(["step-start", "step-finish", "snapshot", "agent", "subtask", "unknown"])

/**
 * Outils dont la **ligne entière** est du bruit de protocole.
 *
 * `turn_plan` déclare une intention (« Engagement declared: … ») puis rend la main : il ne fait rien
 * et sa sortie ne se lit pas. C'est le même choix que le TUI du fork, qui l'exclut de son rendu
 * **et** de ses décomptes (`isHiddenTool`). Conséquence assumée : il ne compte plus comme une action
 * d'étape — compter un outil qu'on ne montre pas ferait diverger le fil de ses propres chiffres.
 */
const HIDDEN_TOOLS = new Set(["turn_plan"])

/**
 * Ce qui s'affiche **dans** une étape.
 *
 * `patch` est passé de filtré à affiché : il porte les fichiers changés (400 occurrences mesurées).
 * `compaction` et `retry` sont des **bornes du récit**, pas du bruit de protocole — les cacher
 * reviendrait à mentir sur ce qui s'est passé : après une compaction, ce qui suit ne s'appuie plus
 * sur ce qui précède.
 */
export function isVisiblePart(part: { type: string; tool?: string; text?: string; files?: string[] }): boolean {
  if (HIDDEN_TYPES.has(part.type)) return false
  // Un outil dont la ligne est du bruit de protocole n'entre pas dans le fil **du tout** : ni sa
  // ligne, ni son décompte d'action (voir `HIDDEN_TOOLS`).
  if (part.type === "tool" && HIDDEN_TOOLS.has(part.tool ?? "")) return false
  if (part.type === "tool" || part.type === "file" || part.type === "patch") return true
  if (part.type === "compaction" || part.type === "retry") return true
  if (part.type === "text") return Boolean(part.text)
  if (part.type === "reasoning") return Boolean(part.text?.trim())
  return false
}

function tokensOf(tokens: TokenCount | undefined): number {
  if (!tokens) return 0
  if (typeof tokens.total === "number") return tokens.total
  return (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0)
}

/**
 * La durée d'une étape se **mesure** sur ses parties (outils, raisonnement, texte) : le serveur ne
 * donne aucun temps à `step-finish`. Une étape sans borne de fin — un outil encore en cours — ne
 * renvoie rien plutôt qu'un zéro faux : on n'écrit pas « 0s » sur un travail qui dure.
 */
function spanMs(items: Part[]): number | undefined {
  let start: number | undefined
  let end: number | undefined
  for (const item of items) {
    const stateTime = item.state && "time" in item.state ? (item.state.time as PartTime | undefined) : undefined
    const time = item.time ?? stateTime
    if (!time || typeof time.start !== "number") continue
    if (start === undefined || time.start < start) start = time.start
    if (typeof time.end === "number" && (end === undefined || time.end > end)) end = time.end
  }
  if (start === undefined || end === undefined || end <= start) return undefined
  return end - start
}

/** Découpe les parties d'un message d'agent en étapes, à chaque `step-start`. */
export function groupSteps(parts: Part[]): StepView[] {
  const steps: StepView[] = []
  let open: StepView | undefined

  const begin = (): StepView => {
    const step: StepView = { index: steps.length + 1, items: [], actions: 0, cost: 0, tokens: 0, durationMs: undefined }
    steps.push(step)
    open = step
    return step
  }

  for (const part of parts) {
    if (part.type === "step-start") {
      begin()
      continue
    }
    if (part.type === "step-finish") {
      // Le prix appartient à l'étape qu'il referme ; s'il n'y en a pas d'ouverte, il en ouvre une.
      const step = open ?? begin()
      step.cost += typeof part.cost === "number" ? part.cost : 0
      step.tokens += tokensOf(part.tokens)
      // Le motif de fin : `stop`, `tool-calls`, `length`… Le fil ne le montre pas, la trajectoire oui.
      if (typeof part.reason === "string" && part.reason) step.reason = part.reason
      const tokens = part.tokens
      if (tokens && typeof tokens === "object") {
        const usage = step.usage ?? (step.usage = {})
        usage.input = (usage.input ?? 0) + (tokens.input ?? 0)
        usage.output = (usage.output ?? 0) + (tokens.output ?? 0)
        usage.reasoning = (usage.reasoning ?? 0) + (tokens.reasoning ?? 0)
        usage.cacheRead = (usage.cacheRead ?? 0) + (tokens.cache?.read ?? 0)
        usage.cacheWrite = (usage.cacheWrite ?? 0) + (tokens.cache?.write ?? 0)
        // La **taille du contexte** ne s'additionne pas : elle se remplace. L'addition donnait 3 500
        // là où la fenêtre contenait 2 500 (mesuré sur deux `step-finish` d'une même étape), et elle
        // fabriquait une taille à partir d'un `step-finish` qui n'en portait aucune.
        if (typeof tokens.total === "number") usage.total = tokens.total
      }
      continue
    }
    if (!isVisiblePart(part)) continue
    const step = open ?? begin()
    step.items.push(part)
    if (part.type === "tool") step.actions += 1
  }

  for (const step of steps) step.durationMs = spanMs(step.items)
  // Une étape sans contenu **et** sans prix n'est pas une étape : c'est un `step-start` resté seul.
  return steps.filter((step) => step.items.length > 0 || step.cost > 0)
}

/**
 * Le tour : le prompt de l'utilisateur, puis les étapes qui y répondent.
 *
 * Un message d'agent sans prompt devant lui (reprise, enchaînement) forme son propre tour plutôt que
 * d'être rattaché au hasard à ce qui précède — la page ne réécrit pas l'histoire, elle la montre.
 */
/**
 * Les agents **internes** dont les messages ne s'affichent pas.
 *
 * Mesuré sur une session réelle : une compaction produit un message de l'agent `compaction` portant
 * **9 243 caractères** de texte et 4 884 de raisonnement — le résumé du contexte. Il s'affichait
 * comme une réponse alors qu'il n'en est pas une : personne ne l'a demandé, et il n'apprend rien à
 * qui veut lire l'échange.
 *
 * La **borne** de compaction (`type: "compaction"`), elle, reste visible : c'est elle qui explique
 * la coupure du récit, et la cacher reviendrait à mentir sur ce qui s'est passé.
 */
const HIDDEN_AGENTS = new Set(["compaction"])

export function groupTurns(messages: Message[]): TurnView[] {
  const turns: TurnView[] = []
  let current: TurnView | undefined

  for (const message of messages) {
    const role = message.info.role
    const parts = message.parts ?? []
    // Le message est écarté **avant** toute construction de tour : le laisser passer produirait un
    // tour vide (des étapes sans texte), et l'écran montrerait une réponse blanche.
    if (HIDDEN_AGENTS.has(String(message.info.agent ?? ""))) continue
    if (role === "user") {
      current = {
        id: message.info.id,
        role,
        info: message.info,
        replies: [],
        prompt: parts.filter((part) => isVisiblePart(part)),
        steps: [],
      }
      turns.push(current)
      continue
    }
    if (!current || current.role !== "user" || current.steps.length > 0) {
      current = { id: message.info.id, role, info: message.info, replies: [], prompt: [], steps: [] }
      turns.push(current)
    }
    current.replies.push(message.info)
    current.steps.push(...groupSteps(parts))
  }

  return turns
}

/* -----------------------------------------------------------------------------
   Formatage. Les nombres suivent la langue de l'interface (anglais) : `$1.20`, `$0.005`, `1.2k`.
   -------------------------------------------------------------------------- */

/** Trois décimales sous le dollar, deux au-dessus, quatre sous le millième. `0` ne s'affiche pas. */
export function formatCost(cost: number | undefined): string | undefined {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) return undefined
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.001) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(4)}`
}

/**
 * `31k`, `1.2k`, `840`, `1.2M` — la même échelle que les tailles de fichier ailleurs dans l'écran.
 *
 * Le million est nécessaire, et pas par principe : les jetons d'une session le dépassent facilement
 * (145k sur **une** étape, mesuré). Sans lui, un total de 1 200 000 s'écrivait « 1200k » — un nombre
 * qu'on ne lit pas. Un test l'a rattrapé.
 */
export function formatCount(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  const scaled = (unit: number, suffix: string) => {
    const rounded = Math.round((value / unit) * 10) / 10
    const text = rounded.toFixed(1)
    return `${text.endsWith(".0") ? text.slice(0, -2) : text}${suffix}`
  }
  // Le seuil est décalé : 999 999 doit donner « 1M », pas « 1000k ».
  if (value >= 999_950) return scaled(1_000_000, "M")
  if (value >= 1000) return scaled(1000, "k")
  return String(Math.round(value))
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
}

/**
 * Un débit, arrondi à l'unité : `145 tok/s`.
 *
 * C'est un rapport **mesuré** (jetons produits par seconde écoulée), pas un débit d'API ; `undefined`
 * quand la durée manque, et la barre n'affiche alors rien plutôt qu'un zéro qui ferait croire à un
 * arrêt.
 */
export function formatRate(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  return `${Math.round(value)} tok/s`
}

/** Un pourcentage entier — `93%`. Une décimale ne se lit pas dans une barre de statistiques. */
export function formatPercent(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return `${Math.round(value * 100)}%`
}

/**
 * La ligne d'étape, telle qu'elle se lit — et **son prix**, parce que « combien a coûté ce travail »
 * est une question de lecteur, pas de comptable. Un segment absent disparaît au lieu d'afficher zéro.
 */
export function stepSummary(step: StepView): string {
  const segments = [`step ${step.index}`]
  if (step.actions > 0) segments.push(`${step.actions} action${step.actions > 1 ? "s" : ""}`)
  const duration = formatDuration(step.durationMs)
  if (duration) segments.push(duration)
  const cost = formatCost(step.cost)
  if (cost) segments.push(cost)
  const tokens = formatCount(step.tokens)
  if (tokens) segments.push(`${tokens} tokens`)
  return segments.join(" · ")
}

/** ±lignes d'une écriture : `edit.filediff = { file, patch, additions, deletions }` (603 mesures). */
export function fileDiff(state: ToolState | undefined): { additions: number; deletions: number } | undefined {
  const filediff = state?.metadata?.["filediff"]
  if (!filediff || typeof filediff !== "object") return undefined
  const { additions, deletions } = filediff as { additions?: unknown; deletions?: unknown }
  if (typeof additions !== "number" || typeof deletions !== "number") return undefined
  return { additions, deletions }
}

/**
 * « no change » se lit comme un résultat ; « +0 −0 » se lit comme un compteur cassé. Un diff vide est
 * le seul cas où l'on écrit des mots à la place des nombres.
 */
export function diffLabel(additions: number, deletions: number): string {
  if (additions === 0 && deletions === 0) return "no change"
  return `+${additions} −${deletions}`
}

/** Ce qu'un `patch` porte vraiment : `files[]`, et rien qui compte des lignes. */
export function patchLabel(part: { files?: string[] }): string {
  const count = part.files?.length ?? 0
  if (count === 0) return "no change"
  return `${count} file${count > 1 ? "s" : ""}`
}

/**
 * Nombre de lignes montrées d'une sortie avant le « +N lines ».
 *
 * Mesuré sur 2 410 sorties terminées : médiane 4 lignes, p75 17, p90 46, p99 191, maximum 1 349.
 * Douze lignes laissent passer la médiane et laissent les trois quarts des sorties intactes, tout en
 * bornant le déversement — le reste se révèle au clic.
 */
export const OUTPUT_PREVIEW_LINES = 12

export function boundLines(text: string, max = OUTPUT_PREVIEW_LINES): { head: string; hidden: number } {
  const lines = text.split("\n")
  if (lines.length <= max) return { head: text, hidden: 0 }
  return { head: lines.slice(0, max).join("\n"), hidden: lines.length - max }
}

/**
 * Le nombre de lignes d'une sortie n'est affiché que s'il y a **quelque chose à révéler** : il
 * accompagne le « +N lines », il ne vit jamais seul sur la ligne. C'est la règle de §3.8 — ce qui est
 * rare ne s'annonce pas.
 */
export function toolOutputLines(state: ToolState | undefined): number {
  if (!state || state.status !== "completed" || !state.output) return 0
  return state.output.split("\n").length
}

/** Un texte injecté n'a pas été dit par l'agent ; un texte ignoré ne lui a pas été envoyé. */
export function proseKind(part: { synthetic?: boolean; ignored?: boolean }): "synthetic" | "ignored" | undefined {
  if (part.synthetic) return "synthetic"
  if (part.ignored) return "ignored"
  return undefined
}

/* -----------------------------------------------------------------------------
   Le fil est **append-only à l'affichage**.

   La page relisait tout le fil par REST à chaque événement citant l'identifiant de session : c'est ce
   qui faisait sauter le défilement et clignoter le texte. Le serveur fournit pourtant de quoi tenir
   le fil à jour sur place — mesuré sur un tour réel : `/event` a porté 17 `message.part.updated` et
   12 `message.part.delta` (`/global/event`, lui, n'en a porté aucun : autre enveloppe).

   **Forme relevée sur le fil, pas déduite du schéma** : `properties` porte *la partie aplatie*
   (`{…part, messageID, sessionID}`), et non `{sessionID, part, time}` comme le laisse croire le
   schéma d'origine. Lire `properties.part` ne rendrait rien — et cela ne se verrait pas.
   -------------------------------------------------------------------------- */

/** Remplace une partie dans un message, ou l'ajoute (append-only) quand elle est encore inconnue. */
function replacePart(
  messages: Message[],
  messageID: string,
  partID: string,
  next: Part | undefined,
): Message[] | undefined {
  const index = messages.findIndex((message) => message.info.id === messageID)
  if (index === -1) return undefined
  const message = messages[index]!
  const parts = message.parts ?? []
  const at = parts.findIndex((part) => part.id === partID)
  if (at === -1) {
    if (!next) return messages
    const clone = messages.slice()
    clone[index] = { ...message, parts: [...parts, next] }
    return clone
  }
  const grown = parts.slice()
  if (next) grown[at] = next
  else grown.splice(at, 1)
  const clone = messages.slice()
  clone[index] = { ...message, parts: grown }
  return clone
}

/**
 * Applique un événement du fil sans jamais relire la session.
 *
 * Rend `undefined` quand l'événement ne peut pas être appliqué en place — le message est inconnu de la
 * page, ce qui arrive au début d'un tour. L'appelant recharge alors **une fois**, au lieu de recharger
 * à chaque événement.
 */
export function reduceThread(messages: Message[], event: UiEvent): Message[] | undefined {
  const properties = (event.properties ?? {}) as Record<string, unknown>

  if (event.type === "message.updated") {
    const info = (properties["info"] ?? properties) as Message["info"] | undefined
    if (!info?.id) return messages
    const index = messages.findIndex((message) => message.info.id === info.id)
    if (index === -1) return [...messages, { info, parts: [] }]
    const clone = messages.slice()
    clone[index] = { ...clone[index]!, info: { ...clone[index]!.info, ...info } }
    return clone
  }

  if (event.type === "message.part.updated") {
    const part = properties as Part
    const messageID = properties["messageID"]
    if (typeof part?.id !== "string" || typeof messageID !== "string") return messages
    return replacePart(messages, messageID, part.id, part)
  }

  if (event.type === "message.part.delta") {
    const messageID = properties["messageID"]
    const partID = properties["partID"]
    const field = properties["field"]
    const delta = properties["delta"]
    if (typeof messageID !== "string" || typeof partID !== "string" || typeof field !== "string") return messages
    if (typeof delta !== "string") return messages
    const index = messages.findIndex((message) => message.info.id === messageID)
    if (index === -1) return undefined
    const parts = messages[index]!.parts ?? []
    const at = parts.findIndex((part) => part.id === partID)
    if (at === -1) return undefined
    const grown = parts.slice()
    grown[at] = { ...parts[at]!, [field]: `${(parts[at]![field] as string) ?? ""}${delta}` }
    const clone = messages.slice()
    clone[index] = { ...messages[index]!, parts: grown }
    return clone
  }

  if (event.type === "message.part.removed") {
    const messageID = properties["messageID"]
    const partID = properties["partID"]
    if (typeof messageID !== "string" || typeof partID !== "string") return messages
    return replacePart(messages, messageID, partID, undefined)
  }

  return messages
}

/* =============================================================================
   La question de l'agent — la **seule** écriture du fil.

   §3.1 : le fil est en lecture seule, à une exception près, et elle est motivée. Quand l'agent pose
   une question, il est **bloqué** dessus : ne pas répondre arrête la conversation. Une question est
   donc un contrôle dans le fil, le seul. (`permission.asked` n'y est pas : il vit dans le tiroir
   droit, cf. §2.)

   Contrat relevé, pas supposé (`question/index.ts:58-92`, `groups/question.ts:22-56`) :

     question.asked    -> { id, sessionID, questions[], tool? }
     question.replied  -> { sessionID, requestID, answers[] }
     question.rejected -> { sessionID, requestID }
     POST /question/:requestID/reply    { answers: string[][] }
     POST /question/:requestID/reject

   `answers` est **une liste de libellés par question, dans l'ordre des questions** — d'où le
   `string[][]`. Ce n'est pas un détail de forme : la réponse est **positionnelle**, l'index est le
   contrat. Une réponse décalée d'un cran répondrait à la mauvaise question.
   ============================================================================= */

export type QuestionOption = { label: string; description: string }

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  /** Plusieurs choix possibles ; absent = choix unique. */
  multiple?: boolean
  /** Autorise une réponse libre ; absent = autorisé (défaut `true` côté serveur). */
  custom?: boolean
}

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

/** Une liste de libellés par question, dans l'ordre des questions posées. */
export type QuestionAnswers = string[][]

/** `question.asked` ajoute, `question.replied` et `question.rejected` retirent — sur `requestID`. */
export function reduceQuestions(current: QuestionRequest[], event: UiEvent): QuestionRequest[] {
  if (event.type === "question.asked") {
    const request = event.properties as QuestionRequest | undefined
    if (!request?.id) return current
    if (current.some((item) => item.id === request.id)) return current
    return [...current, request]
  }
  if (event.type === "question.replied" || event.type === "question.rejected") {
    const requestID = (event.properties as { requestID?: string } | undefined)?.requestID
    if (!requestID) return current
    return current.filter((item) => item.id !== requestID)
  }
  return current
}

/** Retire une question localement après réponse, avant que le serveur ne confirme. */
export function dropQuestion(current: QuestionRequest[], requestID: string): QuestionRequest[] {
  return current.filter((item) => item.id !== requestID)
}

/** Une entrée vide par question : la réponse est positionnelle, donc la forme est le contrat. */
export function emptyAnswers(request: QuestionRequest): QuestionAnswers {
  return request.questions.map(() => [])
}

/**
 * Coche ou décoche un libellé.
 *
 * `multiple` sépare le choix multiple du choix unique, et la différence est structurelle : en choix
 * unique, cocher **remplace**. Sans cela le serveur recevrait deux libellés pour une question qui
 * n'en attend qu'un — une réponse malformée au moment précis où l'agent attend.
 */
export function toggleAnswer(
  answers: QuestionAnswers,
  index: number,
  label: string,
  multiple: boolean,
): QuestionAnswers {
  return answers.map((current, at) => {
    if (at !== index) return current
    if (current.includes(label)) return current.filter((item) => item !== label)
    return multiple ? [...current, label] : [label]
  })
}

/**
 * Un texte libre ne s'ajoute pas aux libellés cochés : il **est** la réponse de sa question. Le
 * mélange produirait une réponse que ni le libellé ni la saisie ne décrit.
 */
export function setCustomAnswer(answers: QuestionAnswers, index: number, value: string): QuestionAnswers {
  return answers.map((current, at) => (at === index ? (value.trim() ? [value] : []) : current))
}

/** Toutes les questions doivent porter une réponse : une réponse partielle laisserait l'agent bloqué. */
export function answersComplete(request: QuestionRequest, answers: QuestionAnswers): boolean {
  if (answers.length !== request.questions.length) return false
  return answers.every((answer) => answer.some((label) => label.trim().length > 0))
}

export function isSelected(answers: QuestionAnswers, index: number, label: string): boolean {
  return Boolean(answers[index]?.includes(label))
}

/**
 * Le texte libre à afficher dans le champ : une réponse qui n'est **pas** un libellé d'option.
 * C'est ce qui garde le champ cohérent avec l'état — choisir une option le vide, au lieu de laisser
 * un texte qui ne serait plus envoyé.
 */
export function customValue(item: QuestionInfo, answers: QuestionAnswers, index: number): string {
  const current = answers[index] ?? []
  if (current.length !== 1) return ""
  const label = current[0]!
  return item.options.some((option) => option.label === label) ? "" : label
}

/* =============================================================================
   Copier — la seule action de **lecture** du fil (§3.9 : « copier une commande, un chemin, un bloc »).

   Ce qu'on copie est la **valeur**, jamais le libellé affiché. Les deux diffèrent, et l'écart n'est
   pas cosmétique : la ligne d'un `bash` affiche son titre — « Echo hi » — qui ne sert à rien une fois
   recollé, alors que ce qu'on veut recoller est la commande. Mesuré : `tool.state.title` est présent
   2 242 fois sur 2 262 outils, et pour un `bash` c'est une description, pour un `read`/`write`/`edit`
   c'est le chemin. D'où deux règles distinctes plutôt qu'une seule devinette.
   ============================================================================= */

/** Outils dont le titre **est** le chemin du fichier (relevé : `write.filepath` en metadata aussi). */
const PATH_TITLE_TOOLS = new Set(["read", "write", "edit"])

/**
 * Ce qu'une ligne d'action donne à copier, ou `undefined` s'il n'y a rien d'utile.
 *
 * La commande d'abord : quand un outil en porte une, c'est elle qu'on veut recoller. Sinon le chemin,
 * et seulement pour les outils dont le titre en est un — copier « Echo hi » ou « Lecture du dossier »
 * serait copier une phrase, pas une valeur.
 */
export function copyableText(tool: string, state: ToolState | undefined): string | undefined {
  if (!state) return undefined
  const command = state.input?.["command"]
  if (typeof command === "string" && command.trim().length > 0) return command
  if (!PATH_TITLE_TOOLS.has(tool)) return undefined
  const title = "title" in state ? state.title : undefined
  if (typeof title === "string" && title.trim().length > 0) return title
  return undefined
}

/**
 * Le bloc d'une sortie, tel qu'on le copie : la sortie **complète**, jamais l'aperçu borné.
 *
 * C'est le point qui compte : copier les 12 lignes affichées alors que l'outil en a produit 412
 * donnerait un résultat silencieusement tronqué — le pire des cas, parce qu'il a l'air complet.
 */
export function copyableOutput(state: ToolState | undefined): string | undefined {
  if (!state || state.status !== "completed") return undefined
  return state.output && state.output.length > 0 ? state.output : undefined
}

/* =============================================================================
   Les statistiques — elles ont quitté le fil pour une section (CIBLE.md §9.3, §10).

   Le fil ne porte plus un seul nombre de ce registre ; tout est agrégé ici, une fois, pour la
   section « Session ». `stepSummary` (déjà écrite) devient la ligne de chaque étape **dans cette
   section** — exactement la ligne que le fil n'affiche plus.
   ============================================================================= */

export type StepStat = { turn: number; step: StepView }

export type SessionStats = {
  turns: number
  steps: number
  actions: number
  /** Somme des durées mesurées ; `undefined` si aucune étape n'a de borne de fin. */
  durationMs: number | undefined
  tokens: number
  cost: number
  /** Le détail, dans l'ordre : c'est le contenu de la section, pas du fil. */
  perStep: StepStat[]
  /** Jetons produits, et entrée/cache — la matière des tok/s et du taux de cache. */
  output: number
  input: number
  cacheRead: number
  cacheWrite: number
  /** Taille du contexte à la dernière étape mesurée : ce que la fenêtre contient maintenant. */
  contextTokens: number | undefined
}

export function sessionStats(turns: TurnView[]): SessionStats {
  const perStep: StepStat[] = []
  let actions = 0
  let tokens = 0
  let cost = 0
  let durationMs = 0
  let timed = false
  let output = 0
  let input = 0
  let cacheRead = 0
  let cacheWrite = 0
  /** La taille du contexte à la **dernière** étape qui en porte une : c'est le remplissage actuel. */
  let contextTokens: number | undefined

  turns.forEach((turn, turnIndex) => {
    for (const step of turn.steps) {
      perStep.push({ turn: turnIndex + 1, step })
      actions += step.actions
      tokens += step.tokens
      cost += step.cost
      if (typeof step.durationMs === "number") {
        durationMs += step.durationMs
        timed = true
      }
      const usage = step.usage
      if (usage) {
        output += usage.output ?? 0
        input += usage.input ?? 0
        cacheRead += usage.cacheRead ?? 0
        cacheWrite += usage.cacheWrite ?? 0
        if (typeof usage.total === "number" && usage.total > 0) contextTokens = usage.total
      }
    }
  })

  return {
    turns: turns.length,
    steps: perStep.length,
    actions,
    durationMs: timed ? durationMs : undefined,
    tokens,
    cost,
    perStep,
    output,
    input,
    cacheRead,
    cacheWrite,
    contextTokens,
  }
}

/**
 * Les deux chiffres que la barre de statistiques ajoute au total, calculés **là où ils sont sûrs**.
 *
 * `tokensPerSecond` divise les jetons **produits** par la durée **mesurée** des étapes : un rapport
 * honnête, pas une estimation de débit d'API. `undefined` quand l'un des deux manque — mieux vaut
 * pas de chiffre qu'un chiffre faux, et la barre n'affiche alors rien plutôt qu'un zéro.
 *
 * `cacheHitRate` est la part de l'entrée servie par le cache : `cache.read / (cache.read + input)`.
 * La mesure vient de `step-finish.tokens`, la seule source qui distingue les deux.
 */
export function tokensPerSecond(stats: SessionStats): number | undefined {
  if (!stats.output || !stats.durationMs) return undefined
  return stats.output / (stats.durationMs / 1000)
}

export function cacheHitRate(stats: SessionStats): number | undefined {
  const total = stats.cacheRead + stats.input
  if (!total) return undefined
  return stats.cacheRead / total
}

/** Remplissage de la fenêtre : `contextTokens / limite`, `undefined` si l'un des deux manque. */
export function contextFill(contextTokens: number | undefined, limit: number | undefined): number | undefined {
  if (!contextTokens || !limit || limit <= 0) return undefined
  return Math.min(1, contextTokens / limit)
}

export type StepTrace = {
  index: number
  /** Les outils appelés, dans l'ordre — un pas de raisonnement n'en a aucun. */
  tools: string[]
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cost: number
  durationMs?: number
  reason?: string
}

/** Un tour, avec tout ce qui est exposable pour le diagnostiquer. */
export type TurnTrace = {
  /** Numéro affiché, à partir de 1. */
  turn: number
  role: string
  /** `providerID/modelID`, tel que le serveur l'a réellement utilisé pour ce tour. */
  model?: string
  agent?: string
  mode?: string
  started?: number
  durationMs?: number
  /** Le volume du prompt, en caractères : ce qui a été envoyé. */
  promptChars: number
  /**
   * La taille d'un **prompt système** de remplacement, quand le message en porte un.
   *
   * On expose sa taille et non son contenu : un système qui écrase celui de l'agent change tout ce qui
   * suit, et c'est cela qu'il faut voir — le texte, lui, serait un pavé au milieu du diagnostic.
   */
  systemChars?: number
  /** Le dossier dans lequel le tour a tourné — deux tours d'une même session peuvent différer. */
  cwd?: string
  /** Ce que le serveur a injecté **avant** le prompt, quand le texte synthétique le porte. */
  injections?: Injections
  steps: StepTrace[]
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cost: number
  actions: number
  /**
   * La taille du contexte à la **dernière** étape mesurée : ce que la fenêtre contenait à la fin du
   * tour. C'est le chiffre qui explique une compaction ou un échec de longueur.
   */
  contextTokens?: number
  error?: string
}

/**
 * Le message d'une erreur, quelle que soit sa variante.
 *
 * `error` est une union : chaque variante porte `name` et `data.message`. On ne devine pas la forme —
 * on lit celle qui est là, et on retombe sur le `name`, qui est déjà une information (« quelle erreur »
 * vaut mieux que rien).
 */
export function errorText(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const entry = error as { name?: unknown; data?: unknown }
  const data = entry.data && typeof entry.data === "object" ? (entry.data as { message?: unknown }) : undefined
  if (typeof data?.message === "string" && data.message) return data.message
  if (typeof entry.name === "string" && entry.name) return entry.name
  return undefined
}

/** Les outils d'une étape, dans l'ordre — le bruit de protocole (`turn_plan`) reste exclu. */
function stepTools(step: StepView): string[] {
  const tools: string[] = []
  for (const part of step.items) {
    if (part.type !== "tool" || !part.tool) continue
    if (HIDDEN_TOOLS.has(part.tool)) continue
    tools.push(part.tool)
  }
  return tools
}

/**
 * Les injections d'un tour.
 *
 * Le serveur les joint en **texte synthétique** dans le prompt (`Context injections · …` /
 * `Instructions from: …`) : c'est le seul endroit où elles vivent, donc on les relit là plutôt que de
 * les recalculer — recalculer donnerait une seconde vérité.
 */
function turnInjections(prompt: Part[]): Injections | undefined {
  for (const part of prompt) {
    if (part.type !== "text" || typeof part.text !== "string") continue
    const parsed = parseInjections(part.text)
    if (parsed) return parsed
  }
  return undefined
}

/** La trajectoire de la session, du plus ancien tour au plus récent. */
export function trajectory(turns: TurnView[]): TurnTrace[] {
  return turns.map((turn, index) => {
    const asked = turn.info
    // Ce qui a **réellement** servi : la dernière réponse du tour. À défaut (un tour sans réponse —
    // une question en attente), on retombe sur ce que l'utilisateur avait demandé.
    const ran = turn.replies[turn.replies.length - 1]
    const steps: StepTrace[] = turn.steps.map((step) => ({
      index: step.index,
      tools: stepTools(step),
      input: step.usage?.input ?? 0,
      output: step.usage?.output ?? 0,
      reasoning: step.usage?.reasoning ?? 0,
      cacheRead: step.usage?.cacheRead ?? 0,
      cost: step.cost,
      durationMs: step.durationMs,
      reason: step.reason,
    }))
    const started = asked.time?.created
    const completed = ran?.time?.completed
    const sum = (pick: (step: StepTrace) => number) => steps.reduce((total, step) => total + pick(step), 0)
    const usedProvider = ran?.providerID ?? asked.model?.providerID
    const usedModel = ran?.modelID ?? asked.model?.modelID
    // La taille du contexte à la **dernière** étape qui en donne une : l'état de la fenêtre en fin de
    // tour. Une étape muette ne remet pas le compte à zéro — elle n'en sait simplement rien.
    let contextTokens: number | undefined
    for (const step of turn.steps) {
      const total = step.usage?.total
      if (typeof total === "number" && total > 0) contextTokens = total
    }
    return {
      turn: index + 1,
      role: turn.role,
      model: usedProvider && usedModel ? `${usedProvider}/${usedModel}` : undefined,
      agent: ran?.agent ?? asked.agent,
      mode: ran?.mode,
      started,
      // Une réponse sans `completed` n'a pas de durée : on n'en invente pas une (elle est en cours).
      durationMs: typeof started === "number" && typeof completed === "number" ? completed - started : undefined,
      promptChars: turn.prompt.reduce((total, part) => total + (part.text?.length ?? 0), 0),
      systemChars: typeof asked.system === "string" && asked.system ? asked.system.length : undefined,
      cwd: ran?.path?.cwd,
      injections: turnInjections(turn.prompt),
      steps,
      input: sum((step) => step.input),
      output: sum((step) => step.output),
      reasoning: sum((step) => step.reasoning),
      cacheRead: sum((step) => step.cacheRead),
      cost: sum((step) => step.cost),
      actions: sum((step) => step.tools.length),
      contextTokens,
      error: turn.replies.map((reply) => errorText(reply.error)).find((text) => Boolean(text)),
    }
  })
}

/* =============================================================================
   Les médias — « on rend quand on a les octets, on nomme quand on ne les a pas » (CIBLE.md §12.2).

   Mesuré : `/file/content` rend `{"type":"text","content":""}` sur une image — il lit du texte, il
   ne sert pas d'octets. Un média n'est donc affichable que si la **partie** en porte déjà : une data
   URL (`file`, ou `tool.state.attachments` — 25 parties mesurées).
   ============================================================================= */

export type MediaKind = "image" | "video"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i

/**
 * Le type de média d'une source, déduit du **mime** d'abord, de l'**extension** ensuite.
 *
 * L'ordre compte : un mime explicite est une déclaration, l'extension une supposition. Un serveur qui
 * dit `image/png` ne se trompe pas ; un `.php` qui ressemble à une image, si.
 */
export function mediaKind(source: { mime?: string; url?: string } | undefined): MediaKind | undefined {
  if (!source) return undefined
  const mime = (source.mime ?? "").toLowerCase()
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  const url = (source.url ?? "").split(/[?#]/)[0] ?? ""
  if (IMAGE_EXT.test(url)) return "image"
  if (VIDEO_EXT.test(url)) return "video"
  return undefined
}

/**
 * Les médias portés par des **parties** — jamais par un chemin.
 *
 * `tool.state.attachments` a la même forme qu'une partie `file` (`{mime, url}`) : le serveur y joint
 * lui-même les octets. C'est la seule voie par laquelle une lecture d'image peut s'afficher.
 */
export function partMedia(part: Part): Array<{ kind: MediaKind; mime?: string; url: string; name: string; from: string }> {
  const out: Array<{ kind: MediaKind; mime?: string; url: string; name: string; from: string }> = []
  const push = (source: { mime?: string; url?: string; filename?: string } | undefined, name: string, from: string) => {
    const kind = mediaKind(source)
    const url = source?.url
    if (!kind || typeof url !== "string" || url.length === 0) return
    out.push({ kind, mime: source?.mime, url, name: source?.filename ?? name, from })
  }

  if (part.type === "file") push({ mime: part.mime, url: part.url, filename: part.filename }, "attachment", "file")
  if (part.type === "tool") {
    const state = part.state as ToolState | undefined
    const attachments = (state as { attachments?: Array<{ mime?: string; url?: string }> } | undefined)?.attachments
    if (Array.isArray(attachments)) {
      attachments.forEach((item, index) =>
        push(item, `${part.tool ?? "tool"}-${index + 1}`, String(part.tool ?? "tool")),
      )
    }
  }
  return out
}

/* =============================================================================
   Les fichiers **modifiés** par la réponse — le bilan, à la fin du dernier step (CIBLE.md §12.3).

   « Contenu, pas performance » : un nom, des ±lignes, un chemin, et le **diff** quand il est connu.
   Aucune statistique.
   ============================================================================= */

export type DocumentRef = {
  path: string
  additions?: number
  deletions?: number
  /**
   * Le diff du **dernier** passage sur ce fichier, tel que le serveur l'a produit.
   *
   * Il n'existe que pour les outils qui écrivent (`edit`, `write`) : `metadata.filediff.patch`, relevé
   * sur 603 mesures. Les fichiers d'un `patch` n'en portent pas — on sait qu'ils ont changé, pas
   * comment. Le composant le dit alors au lieu de faire semblant.
   */
  patch?: string
}

/** Outils dont le titre **est** le chemin (même règle que `copyableText`, pour la même raison). */
const PATH_TOOLS = new Set(["read", "write", "edit"])

function documentOf(tool: string, state: ToolState | undefined): DocumentRef | undefined {
  if (!state) return undefined
  const diff = fileDiff(state)
  if (diff) {
    const file = state.metadata?.["filediff"]
    const entry = file && typeof file === "object" ? (file as { file?: unknown; patch?: unknown }) : undefined
    const path = entry?.file
    if (typeof path === "string" && path.length > 0) {
      const patch = typeof entry?.patch === "string" && entry.patch.length > 0 ? entry.patch : undefined
      return { path, additions: diff.additions, deletions: diff.deletions, patch }
    }
  }
  if (!PATH_TOOLS.has(tool)) return undefined
  const title = "title" in state ? state.title : undefined
  if (typeof title === "string" && title.trim().length > 0) return { path: title }
  return undefined
}

/**
 * Les documents produits ou touchés par une **réponse** : les fichiers des patches, et ceux des
 * écritures (`metadata.filediff`).
 *
 * Dédupliqué par chemin, le dernier passage gagnant — un même fichier modifié trois fois dans le tour
 * est **un** document, et ses ±lignes sont celles du dernier passage, pas la somme (qui ne décrirait
 * rien de réel).
 */
export function answerDocuments(turn: TurnView | undefined): DocumentRef[] {
  if (!turn) return []
  const byPath = new Map<string, DocumentRef>()
  for (const step of turn.steps) {
    for (const item of step.items) {
      if (item.type === "patch") {
        for (const file of item.files ?? []) {
          if (typeof file === "string" && file.length > 0 && !byPath.has(file)) byPath.set(file, { path: file })
        }
        continue
      }
      if (item.type !== "tool") continue
      const found = documentOf(String(item.tool ?? ""), item.state as ToolState | undefined)
      if (found) byPath.set(found.path, found)
    }
  }
  return [...byPath.values()]
}

/** Une ligne de diff, classée par ce qu'elle fait — et non par sa couleur, qui est une vue. */
export type PatchLine = {
  kind: "add" | "del" | "hunk" | "context"
  text: string
}

/**
 * Le patch, décomposé en lignes classées.
 *
 * Un diff se **lit** : on cherche les lignes qui changent, et les lignes de contexte ne servent qu'à
 * situer le changement. La classification est donc faite ici, une fois, plutôt que dans le rendu —
 * c'est elle qu'un test peut vérifier.
 *
 * Le préfixe `+`/`-` est **retiré** du texte : il est déjà porté par la classe, et le laisser ferait
 * deux fois la même information à l'écran.
 */
export function patchLines(patch: string | undefined): PatchLine[] {
  if (typeof patch !== "string" || patch.length === 0) return []
  return patch.split(/\r?\n/).map((line) => {
    if (line.startsWith("@@")) return { kind: "hunk", text: line }
    if (line.startsWith("+++") || line.startsWith("---")) return { kind: "hunk", text: line }
    if (line.startsWith("+")) return { kind: "add", text: line.slice(1) }
    if (line.startsWith("-")) return { kind: "del", text: line.slice(1) }
    return { kind: "context", text: line.startsWith(" ") ? line.slice(1) : line }
  })
}

/**
 * Le dernier tour **qui a produit du travail** — celui dont on montre le bilan.
 *
 * On ne peut pas filtrer sur `role` : `groupTurns` rattache la réponse de l'agent au tour **ouvert par
 * le prompt**, donc `turn.role` vaut `"user"` sur tout tour qui porte des étapes. Chercher un tour de
 * rôle `assistant` ne trouverait donc **jamais** rien — c'est l'erreur qu'un test a rattrapée. Ce qui
 * identifie le travail, ce sont les **étapes**.
 */
export function lastWorkingTurn(turns: TurnView[]): TurnView | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn && turn.steps.length > 0) return turn
  }
  return undefined
}

/* =============================================================================
   Le badge de type d'un document — CIBLE.md §14.

   Un raccourci **lisible**, jamais une icône indéchiffrable : les lettres de l'extension (« TS »,
   « JSON ») et une teinte par **nature** de fichier. La teinte dit la nature (du code, des données,
   un style, de la documentation), pas le langage — sinon il faudrait une couleur par extension, et
   personne ne retient ce vocabulaire.
   ============================================================================= */

export type FileBadge = { label: string; family: string }

/** Nature d'un fichier, déduite de son extension. */
const BADGE_FAMILY: Record<string, string> = {
  // Code
  ts: "code", tsx: "code", js: "code", jsx: "code", mjs: "code", cjs: "code", py: "code", rb: "code",
  go: "code", rs: "code", java: "code", kt: "code", c: "code", h: "code", cpp: "code", hpp: "code",
  cs: "code", php: "code", swift: "code", scala: "code", lua: "code", ex: "code", exs: "code",
  // Balisage
  html: "markup", htm: "markup", xml: "markup", svg: "markup", vue: "markup", svelte: "markup",
  // Styles
  css: "style", scss: "style", sass: "style", less: "style", styl: "style",
  // Données et configuration
  json: "data", jsonc: "data", yaml: "data", yml: "data", toml: "data", ini: "data", env: "data",
  csv: "data", tsv: "data", sql: "data", graphql: "data", lock: "data",
  // Documentation
  md: "docs", mdx: "docs", txt: "docs", rst: "docs", adoc: "docs", pdf: "docs",
  // Scripts
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell", ps1: "shell", bat: "shell", cmd: "shell",
  // Médias
  png: "media", jpg: "media", jpeg: "media", gif: "media", webp: "media", avif: "media", bmp: "media",
  mp4: "media", webm: "media", mov: "media", mp3: "media", wav: "media", ogg: "media",
}

/**
 * Le badge d'un chemin : son extension en lettres, et la nature du fichier.
 *
 * Deux cas que la devinette raterait : un fichier **sans** extension (`Makefile`, `.gitignore`) n'a
 * pas de lettres à montrer, et un **point en tête** (`.env`) désigne un nom, pas une extension —
 * d'où le test `dot > 0` et non `>= 0`.
 */
export function fileBadge(path: string): FileBadge {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
  if (!ext || ext.length > 8) return { label: "•", family: "other" }
  return { label: (ext.length <= 4 ? ext : ext.slice(0, 3)).toUpperCase(), family: BADGE_FAMILY[ext] ?? "other" }
}

/* =============================================================================
   Le travail est un **flux** (CIBLE.md §9.2 révisé).

   Il n'y a plus de « répartition » prose/travail à calculer : un repli qui cachait tout le travail
   ne montrait plus rien, et la répartition n'existait que pour l'alimenter. Le rendu parcourt donc
   simplement les étapes dans l'ordre — la prose au corps de lecture, le travail en une ligne — ce qui
   est aussi l'ordre des faits.
   ============================================================================= */
