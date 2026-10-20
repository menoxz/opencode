/**
 * Formatage des blocs de gardes injectés — spec : `specs/injectable-guards.md`.
 *
 * Pure et testable : le service (`./index`) fournit le catalogue, `./state` l'état du step,
 * `./triggers` la décision ; ce module ne fait que transformer la décision en texte et en trace.
 *
 * Le texte part dans la **queue volatile** du prompt, jamais dans le segment système : un bloc qui
 * apparaît à certains steps et pas à d'autres, écrit dans le système, re-facturerait tout le préfixe
 * mis en cache. Il est encadré par un marqueur stable pour rester reconnaissable dans le transcript.
 */
import { buildGuardState, type GuardStepInput } from "./state"
import { selectGuards, type CompiledGuard } from "./triggers"
import { loadGuardRoots } from "./parse"

/** Marqueur stable : sans lui, une consigne injectée est indistinguable d'une consigne utilisateur. */
export const GUARDS_MARKER = "[garde-fou:"

export type GuardFiring = { name: string; reasons: string; chars: number }

export type GuardInjection = {
  blocks: string[]
  firings: GuardFiring[]
  missing: string[]
}

export function buildGuardBlocks(input: {
  guards: CompiledGuard[]
  /** Tirs déjà effectués dans le tour, par nom — sert à `limits.max_per_turn`. */
  firedThisTurn: Record<string, number>
  step: GuardStepInput
  max?: number
  maxChars?: number
}): GuardInjection {
  if (input.guards.length === 0) return { blocks: [], firings: [], missing: [] }

  const { state, signals } = buildGuardState(input.step)
  const { selected } = selectGuards(input.guards, { ...state, firedThisTurn: input.firedThisTurn }, {
    max: input.max,
    maxChars: input.maxChars,
  })

  const blocks: string[] = []
  const firings: GuardFiring[] = []
  for (const entry of selected) {
    // Le nom reste visible dans le transcript : sans lui, une consigne injectée est
    // indistinguable d'une consigne écrite par l'utilisateur.
    blocks.push(`[garde-fou: ${entry.guard.name}]\n${entry.guard.body.trim()}`)
    firings.push({ name: entry.guard.name, reasons: entry.reasons.join(", "), chars: entry.guard.body.length })
  }
  return { blocks, firings, missing: signals.missing }
}

/**
 * Variante « une seule fonction » : charge (ou reçoit) les gardes, décide, et rend le texte prêt à
 * pousser dans la queue. Utile hors de la boucle de step (tests, dry-run), et c'est ce qui garantit
 * que l'appelant n'a pas à réimplémenter l'ordre chargement → décision → formatage.
 */
export async function guardsForStep(
  input: GuardStepInput & {
    guards?: CompiledGuard[]
    roots?: string[]
    firedThisTurn?: Record<string, number>
    max?: number
    maxChars?: number
  },
): Promise<{ names: string[]; text: string; reasons: string[]; blocks: string[]; missing: string[] }> {
  const guards = input.guards ?? (input.roots ? (await loadGuardRoots(input.roots)).guards : [])
  const injection = buildGuardBlocks({
    guards,
    firedThisTurn: input.firedThisTurn ?? {},
    step: {
      step: input.step,
      turn: input.turn,
      stepsInTurn: input.stepsInTurn,
      messages: input.messages,
      tokensSinceLastGuard: input.tokensSinceLastGuard,
      contextWindow: input.contextWindow,
      lastPromptTokens: input.lastPromptTokens,
      afterCompaction: input.afterCompaction,
      agent: input.agent,
      phase: input.phase,
    },
    max: input.max,
    maxChars: input.maxChars,
  })
  return {
    names: injection.firings.map((firing) => firing.name),
    text: injection.blocks.join("\n\n"),
    reasons: injection.firings.map((firing) => firing.reasons),
    blocks: injection.blocks,
    missing: injection.missing,
  }
}
