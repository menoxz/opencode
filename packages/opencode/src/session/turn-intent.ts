import type { MessageV2 } from "./message-v2"

// Turn intent keeps the mission continuous across lots. A short "ok / lot
// suivant" or a steering message belongs to the objective already in flight; a
// substantial new request starts a new one. Without this split, every lot looks
// like a fresh mission and the agent stops to ask permission between steps.

const CONTINUATION_TOKENS = new Set([
  "ok",
  "okay",
  "continue",
  "continuer",
  "commence",
  "commencer",
  "reprends",
  "reprendre",
  "poursuis",
  "poursuivre",
  "resume",
  "reprend",
  "go",
  "suite",
  "next",
  "vas",
  "y",
])

const CONTINUATION_FILLER_TOKENS = new Set([
  "please",
  "pls",
  "stp",
  "svp",
  "now",
  "maintenant",
  "alors",
])

// "lot 2", "étape suivante", "oui" advance an established plan even though they
// are not bare continuation verbs.
const STEP_ADVANCE_TOKENS = new Set([
  "lot",
  "lots",
  "etape",
  "etapes",
  "step",
  "steps",
  "phase",
  "phases",
  "suivant",
  "suivante",
  "suivants",
  "suivantes",
  "next",
  "ensuite",
  "then",
  "after",
  "avance",
  "avancer",
  "passe",
  "passer",
  "continue",
  "continuer",
  "poursuis",
  "poursuivre",
  "reprends",
  "reprendre",
  "go",
  "suite",
  "oui",
  "yes",
  "ok",
  "okay",
  "valide",
  "valider",
  "approuve",
  "approuver",
  "parfait",
  "correct",
])

export type TurnKind = "continuation" | "intervention" | "new_topic"

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function isContinuationPrompt(text: string): boolean {
  const normalized = normalize(text)
  if (!normalized) return false

  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 4) return false

  let hasContinuationToken = false
  for (const token of tokens) {
    if (CONTINUATION_FILLER_TOKENS.has(token)) continue
    if (CONTINUATION_TOKENS.has(token)) {
      hasContinuationToken = true
      continue
    }
    return false
  }

  return hasContinuationToken
}

function isStepAdvancePrompt(text: string): boolean {
  const normalized = normalize(text)
  if (!normalized) return false

  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 5) return false

  let hasStepToken = false
  for (const token of tokens) {
    if (CONTINUATION_FILLER_TOKENS.has(token)) continue
    if (/^\d+$/.test(token)) continue
    if (STEP_ADVANCE_TOKENS.has(token)) {
      hasStepToken = true
      continue
    }
    return false
  }

  return hasStepToken
}

export function classifyUserTurn(input: { text: string; steer?: boolean }): TurnKind {
  if (input.steer) return "intervention"
  const text = input.text.trim()
  if (!text) return "continuation"
  if (isContinuationPrompt(text) || isStepAdvancePrompt(text)) return "continuation"
  return "new_topic"
}

export function classifyUserMessage(message: MessageV2.WithParts): TurnKind {
  return classifyUserTurn({
    text: message.parts
      .filter((part): part is MessageV2.TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
    steer: message.parts.some(
      (part) => part.type === "text" && (part as { metadata?: { steer?: unknown } }).metadata?.steer === true,
    ),
  })
}

export * as TurnIntent from "./turn-intent"
