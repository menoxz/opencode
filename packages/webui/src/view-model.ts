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
  info: { id: string; role: string; cost?: number; tokens?: TokenCount }
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
}

export type TurnView = {
  id: string
  role: string
  /** Le prompt de l'utilisateur, tel qu'il l'a écrit. */
  prompt: Part[]
  steps: StepView[]
}

/** Types qui ne portent rien pour l'utilisateur, quel que soit leur volume. */
const HIDDEN_TYPES = new Set(["step-start", "step-finish", "snapshot", "agent", "subtask", "unknown"])

/**
 * Ce qui s'affiche **dans** une étape.
 *
 * `patch` est passé de filtré à affiché : il porte les fichiers changés (400 occurrences mesurées).
 * `compaction` et `retry` sont des **bornes du récit**, pas du bruit de protocole — les cacher
 * reviendrait à mentir sur ce qui s'est passé : après une compaction, ce qui suit ne s'appuie plus
 * sur ce qui précède.
 */
export function isVisiblePart(part: { type: string; text?: string; files?: string[] }): boolean {
  if (HIDDEN_TYPES.has(part.type)) return false
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
export function groupTurns(messages: Message[]): TurnView[] {
  const turns: TurnView[] = []
  let current: TurnView | undefined

  for (const message of messages) {
    const role = message.info.role
    const parts = message.parts ?? []
    if (role === "user") {
      current = { id: message.info.id, role, prompt: parts.filter((part) => isVisiblePart(part)), steps: [] }
      turns.push(current)
      continue
    }
    if (!current || current.role !== "user" || current.steps.length > 0) {
      current = { id: message.info.id, role, prompt: [], steps: [] }
      turns.push(current)
    }
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

/** `31k`, `1.2k`, `840` — la même échelle que les tailles de fichier ailleurs dans l'écran. */
export function formatCount(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  if (value < 1000) return String(Math.round(value))
  const thousands = (value / 1000).toFixed(1)
  return `${thousands.endsWith(".0") ? thousands.slice(0, -2) : thousands}k`
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`
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
