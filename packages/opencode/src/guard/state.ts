/**
 * Construction de l'état d'un step à partir des messages du tour — spec : `specs/injectable-guards.md`.
 *
 * Les déclencheurs `error_streak`, `repeat_action` et `path_match` étaient parsés et décidés mais
 * jamais alimentés : on savait les refuser, pas les mesurer. Ce module comble ce trou, en restant une
 * fonction pure sur des messages — donc testable sans lancer un tour.
 *
 * Ce qui n'est pas déductible d'ici (compaction, agent, phase, jetons écoulés) est passé en entrée
 * par l'appelant plutôt que deviné : un signal inventé vaut moins qu'un signal absent, parce qu'il
 * fait tirer une garde pour une mauvaise raison.
 */

export type ToolPart = {
  type: "tool" | string
  tool?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
}

export type Message = {
  info?: { role?: string }
  role?: string
  parts?: ToolPart[]
}

export type GuardStepInput = {
  step: number
  turn: number
  stepsInTurn: number
  /** Messages du tour, dans l'ordre. Sert à mesurer les outils ; le système les ignore. */
  messages: Message[]
  tokensSinceLastGuard: number
  /** Fenêtre de contexte du modèle, en jetons. 0 ⇒ `context_ratio` reste à 0 (signal absent). */
  contextWindow: number
  /** Jetons du dernier prompt envoyé, pour `context_ratio`. */
  lastPromptTokens: number
  /**
   * Absent quand la boucle de step ne sait pas le fournir. Ne pas le fabriquer : un `false` inventé
   * rend une garde muette sans que rien ne le signale, alors qu'un champ absent est déclaré dans
   * `signals.missing`.
   */
  afterCompaction?: boolean
  /** Nombre de tours depuis la dernière injection de garde ; absent = non fourni par l'appelant. */
  turnsSinceInjection?: number
  agent?: string
  phase?: string
}

/** Chemins touchés par un outil, quand son entrée en porte un. */
function toolPath(part: ToolPart): string | undefined {
  const input = part.state?.input
  if (!input) return undefined
  for (const key of ["filePath", "path", "file", "pattern"]) {
    const value = input[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

/** Signature d'un appel, pour détecter la répétition : même outil, mêmes arguments. */
function actionSignature(part: ToolPart): string | undefined {
  if (!part.tool) return undefined
  const input = part.state?.input
  if (!input) return part.tool
  // Tri des clés : un objet dont l'ordre des clés change n'est pas une action différente.
  const stable = JSON.stringify(input, Object.keys(input).sort())
  return part.tool + ":" + stable
}

function role(message: Message): string {
  return message.info?.role ?? message.role ?? "unknown"
}

function toolParts(message: Message): ToolPart[] {
  return (message.parts ?? []).filter((part) => part.type === "tool")
}

/** Un outil en échec : tout statut d'erreur connu, ou un code de sortie non nul. */
function failed(part: ToolPart): boolean {
  const state = part.state
  if (!state) return false
  if (state.status === "error" || state.status === "failed") return true
  const code = state.metadata?.exitCode ?? state.metadata?.exit
  return typeof code === "number" && code !== 0
}

export function buildGuardState(input: GuardStepInput): {
  state: import("./triggers").GuardState
  signals: { missing: string[] }
} {
  // Les outils du tour courant : tout ce qui suit le dernier message utilisateur.
  let turnStart = 0
  for (let index = input.messages.length - 1; index >= 0; index--) {
    if (role(input.messages[index]!) === "user") {
      turnStart = index
      break
    }
  }
  const turnMessages = input.messages.slice(turnStart)

  const tools = turnMessages.flatMap(toolParts)
  const paths = tools.map(toolPath).filter((value): value is string => Boolean(value))

  // Comptage par nom d'outil : c'est ce qui alimente le déclencheur `tool_calls`. Un outil jamais
  // appelé est simplement absent de la table ; la décision le lit comme 0.
  const toolCallsByName: Record<string, number> = {}
  for (const part of tools) {
    if (!part.tool) continue
    toolCallsByName[part.tool] = (toolCallsByName[part.tool] ?? 0) + 1
  }

  // Série d'échecs : on remonte depuis la fin tant que l'outil a échoué.
  let errorStreak = 0
  for (let index = tools.length - 1; index >= 0; index--) {
    if (!failed(tools[index]!)) break
    errorStreak++
  }

  // Répétition : la plus grande occurrence d'une même signature d'appel.
  const counts = new Map<string, number>()
  let repeatAction = 0
  for (const part of tools) {
    const signature = actionSignature(part)
    if (!signature) continue
    const next = (counts.get(signature) ?? 0) + 1
    counts.set(signature, next)
    if (next > repeatAction) repeatAction = next
  }

  const missing: string[] = []
  if (input.contextWindow <= 0) missing.push("context_ratio (fenêtre inconnue)")
  if (paths.length === 0) missing.push("path_match (aucun chemin dans le tour)")
  // Ces trois signaux ne sont pas déductibles des messages : quand l'appelant ne les fournit pas, on
  // le dit. Une garde qui n'en dépend que par eux est morte, et « morte silencieuse » est le défaut
  // que ce dispositif existe pour rendre impossible.
  if (input.afterCompaction === undefined) missing.push("after_compaction (non fourni par la boucle)")
  if (input.turnsSinceInjection === undefined) missing.push("turns_since_injection (non fourni)")
  if (input.phase === undefined) missing.push("phase (non fourni)")

  return {
    state: {
      step: input.step,
      turn: input.turn,
      stepsInTurn: input.stepsInTurn,
      toolCallsInTurn: tools.length,
      tokensSinceLastGuard: input.tokensSinceLastGuard,
      contextRatio:
        input.contextWindow > 0 ? Math.min(Math.max(input.lastPromptTokens / input.contextWindow, 0), 1) : 0,
      afterCompaction: input.afterCompaction ?? false,
      errorStreak,
      repeatAction,
      turnsSinceInjection: input.turnsSinceInjection ?? 0,
      paths,
      agent: input.agent,
      phase: input.phase,
      toolCallsByName,
    },
    signals: { missing },
  }
}
