import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import * as Tool from "./tool"
import {
  MINIMAL_DOD_ITEM,
  normalizeGoalList,
  parseGoalEditInput,
  serializeGoalStateCompressed,
} from "@/cli/cmd/tui/routes/session/goal-edit-parser"

type ContractSuggestion = {
  objective: string
  dod: string[]
  outOfScope: string[]
}

type ContractToolResponse = {
  status: "ok" | "error"
  action: "create" | "edit" | "suggest" | "apply" | "complete"
  updatedFields: string[]
  warnings: string[]
  suggestion?: ContractSuggestion
  goalState?: {
    status: string
    source: string
    goal: string
    dod: string[]
    outOfScope: string[]
    compressed?: string
    anchorUserID?: string
    version: number
    updatedAt: number
  }
}

type Metadata = {
  result: ContractToolResponse
}

const CreateParameters = Schema.Struct({
  objective: Schema.String.annotate({ description: "Objective / Objectif principal" }),
  dod: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Definition of Done items",
  }),
  outOfScope: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Out-of-scope / Hors périmètre items",
  }),
})

const EditParameters = Schema.Struct({
  objective: Schema.optional(Schema.String).annotate({ description: "New objective text" }),
  dod: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Replace DoD list when provided",
  }),
  outOfScope: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Replace out-of-scope list when provided",
  }),
})

const PromptParameters = Schema.Struct({
  prompt: Schema.String.annotate({
    description: "Free user text (FR/EN). Supports labels like Objective/Objectif, DoD/Définition de Done, Out of Scope/Hors périmètre",
  }),
})

const SuggestParameters = Schema.Struct({
  prompt: Schema.optional(Schema.String).annotate({
    description: "Optional prompt text; if omitted, suggestion uses recent conversation context.",
  }),
})

const OOS_KEYWORDS = [
  "out of scope",
  "hors périmètre",
  "hors perimetre",
  "scope exclusion",
  "ne pas",
  "excluded",
  "exclu",
]

function isOutOfScopeItem(item: string): boolean {
  const lower = item.toLowerCase()
  return OOS_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function collectBulletItems(text: string): { dod: string[]; outOfScope: string[] } {
  const dod: string[] = []
  const outOfScope: string[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/)
    const item = match?.[1]?.trim()
    if (!item) continue
    if (isOutOfScopeItem(item)) outOfScope.push(item)
    else dod.push(item)
  }
  return { dod: normalizeGoalList(dod), outOfScope: normalizeGoalList(outOfScope) }
}

function firstSentenceObjective(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    if (/^(objective|objectif|goal|dod|definition of done|d[ée]finition de done|out of scope|hors périmètre|oos)\s*:/i.test(line)) {
      continue
    }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) continue
    if (line.length < 3) continue
    return (line.split(/[.!?]\s/)[0] ?? line).trim().slice(0, 220)
  }

  return ""
}

function extractPromptTextFromMessages(messages: Tool.Context["messages"]): string {
  const chunks: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.info.role !== "user") continue
    for (const part of msg.parts) {
      if (part.type !== "text") continue
      if (!part.text?.trim()) continue
      chunks.push(part.text.trim())
      if (chunks.length >= 3) break
    }
    if (chunks.length >= 3) break
  }
  return chunks.reverse().join("\n\n")
}

function draftFromPrompt(text: string): { draft?: ContractSuggestion; warnings: string[] } {
  const warnings: string[] = []
  const parsed = parseGoalEditInput(text)
  const bullets = collectBulletItems(text)

  const objective = parsed.goal || firstSentenceObjective(text)
  let dod = normalizeGoalList(parsed.dod)
  let outOfScope = normalizeGoalList(parsed.outOfScope)

  // Fallback for free-form prompts without explicit sections.
  if (dod.length === 0 && outOfScope.length === 0) {
    dod = bullets.dod
    outOfScope = bullets.outOfScope
  }

  if (!objective) {
    warnings.push("Unable to infer objective from prompt.")
    return { warnings }
  }

  if (dod.length === 0) {
    dod = [MINIMAL_DOD_ITEM]
    warnings.push("No DoD detected; applied minimal DoD fallback.")
  }

  const hasSectionHeaders =
    /(objective|objectif|goal|dod|definition of done|d[ée]finition de done|out\s*of\s*scope|hors\s*p[ée]rim[èe]tre|oos)\s*:/i.test(
      text,
    )
  if (hasSectionHeaders && parsed.goal.length === 0) {
    warnings.push("Section headers detected but objective was empty; used free-text fallback.")
  }

  return {
    draft: {
      objective,
      dod,
      outOfScope,
    },
    warnings,
  }
}

function responseResult(result: ContractToolResponse) {
  return {
    title: `Contract ${result.action}`,
    output: JSON.stringify(result, null, 2),
    metadata: { result },
  }
}

// Stored in Session.goalState and persisted by session projector/storage.
function sameStringList(left: unknown, right: string[]) {
  const normalized = normalizeGoalList(Array.isArray(left) ? left.filter((item): item is string => typeof item === "string") : [])
  return normalized.length === right.length && normalized.every((item, index) => item === right[index])
}

function sameGoalContract(previous: any, objective: string, dod: string[], outOfScope: string[]) {
  if (!previous) return false
  return previous.goal?.trim() === objective.trim() && sameStringList(previous.dod, dod) && sameStringList(previous.outOfScope, outOfScope)
}

function nextGoalState(input: {
  previous: any
  objective: string
  dod: string[]
  outOfScope: string[]
  source: "auto" | "user"
  status: "draft" | "edited"
}) {
  const goal = input.objective.trim()
  const dod = normalizeGoalList(input.dod)
  const outOfScope = normalizeGoalList(input.outOfScope)
  return {
    ...(input.previous ?? {}),
    status: input.status,
    source: input.source,
    goal,
    dod,
    outOfScope,
    compressed: serializeGoalStateCompressed(goal, dod, outOfScope),
    version: ((input.previous?.version as number | undefined) ?? 0) + 1,
    updatedAt: Date.now(),
  }
}

function createToolDefinition(actionId: "create" | "edit") {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description:
        actionId === "create"
          ? "Create task contract objective + DoD + out-of-scope in the current session goalState."
          : "Edit existing task contract fields in the current session goalState.",
      parameters: actionId === "create" ? CreateParameters : EditParameters,
      execute: (params: any, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const previous = session.goalState ?? null

          if (actionId === "edit" && !previous) {
            return responseResult({
              status: "error",
              action: "edit",
              updatedFields: [],
              warnings: ["No existing contract found to edit in current session."],
            })
          }

          const objective = typeof params.objective === "string" ? params.objective.trim() : ""
          const dodInput = params.dod !== undefined ? normalizeGoalList(params.dod) : undefined
          const oosInput = params.outOfScope !== undefined ? normalizeGoalList(params.outOfScope) : undefined

          if (actionId === "create" && !objective) {
            return responseResult({
              status: "error",
              action: "create",
              updatedFields: [],
              warnings: ["Objective cannot be empty."],
            })
          }

          if (actionId === "edit" && !objective && dodInput === undefined && oosInput === undefined) {
            return responseResult({
              status: "error",
              action: "edit",
              updatedFields: [],
              warnings: ["Nothing to edit: provide at least one field (objective, dod, outOfScope)."],
            })
          }

          const baseObjective = objective || (previous?.goal ?? "")
          if (!baseObjective.trim()) {
            return responseResult({
              status: "error",
              action: actionId,
              updatedFields: [],
              warnings: ["Objective cannot be empty."],
            })
          }

          const baseDod =
            dodInput ?? (normalizeGoalList(previous?.dod).length > 0 ? normalizeGoalList(previous?.dod) : [MINIMAL_DOD_ITEM])
          const baseOos = oosInput ?? normalizeGoalList(previous?.outOfScope)

          if (sameGoalContract(previous, baseObjective, baseDod, baseOos)) {
            return responseResult({
              status: "ok",
              action: actionId,
              updatedFields: [],
              warnings: ["No semantic change; goalState was not rewritten."],
              goalState: previous ?? undefined,
            })
          }

          const next = nextGoalState({
            previous,
            objective: baseObjective,
            dod: baseDod,
            outOfScope: baseOos,
            source: "user",
            status: previous ? "edited" : "draft",
          })

          yield* sessions.setGoalState({ sessionID: ctx.sessionID, goalState: next })

          const updatedFields = [
            ...(objective ? ["objective"] : []),
            ...(dodInput !== undefined ? ["dod"] : []),
            ...(oosInput !== undefined ? ["outOfScope"] : []),
          ]

          return responseResult({
            status: "ok",
            action: actionId,
            updatedFields: updatedFields.length > 0 ? updatedFields : ["objective", "dod", "outOfScope"],
            warnings: [],
            goalState: next,
          })
        }),
    } satisfies Tool.DefWithoutID<any, Metadata>
  })
}

export const CreateObjectifTool = Tool.define("create_objectif", createToolDefinition("create"))
export const CreateObjectiveTool = Tool.define("create_objective", createToolDefinition("create"))
export const EditObjectifTool = Tool.define("edit_objectif", createToolDefinition("edit"))
export const EditObjectiveTool = Tool.define("edit_objective", createToolDefinition("edit"))

export const SuggestObjectifTool = Tool.define(
  "suggest_objectif",
  Effect.gen(function* () {
    return {
      description:
        "Suggest objective + DoD + out-of-scope from provided prompt or recent user context without persisting changes.",
      parameters: SuggestParameters,
      execute: (params: Schema.Schema.Type<typeof SuggestParameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const sourceText = (params.prompt ?? "").trim() || extractPromptTextFromMessages(ctx.messages)
          if (!sourceText) {
            return responseResult({
              status: "error",
              action: "suggest",
              updatedFields: [],
              warnings: ["No prompt/context text available to generate a suggestion."],
            })
          }

          const { draft, warnings } = draftFromPrompt(sourceText)
          if (!draft) {
            return responseResult({
              status: "error",
              action: "suggest",
              updatedFields: [],
              warnings,
            })
          }

          return responseResult({
            status: "ok",
            action: "suggest",
            updatedFields: [],
            warnings,
            suggestion: draft,
          })
        }),
    } satisfies Tool.DefWithoutID<typeof SuggestParameters, Metadata>
  }),
)

export const ApplyContractFromPromptTool = Tool.define(
  "apply_contract_from_prompt",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "Parse a free user prompt (FR/EN labels supported) and apply objective + DoD + out-of-scope to current session goalState.",
      parameters: PromptParameters,
      execute: (params: Schema.Schema.Type<typeof PromptParameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const prompt = params.prompt.trim()
          if (!prompt) {
            return responseResult({
              status: "error",
              action: "apply",
              updatedFields: [],
              warnings: ["Prompt cannot be empty."],
            })
          }

          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const previous = session.goalState ?? null
          const { draft, warnings } = draftFromPrompt(prompt)

          if (!draft || !draft.objective.trim()) {
            return responseResult({
              status: "error",
              action: "apply",
              updatedFields: [],
              warnings: warnings.length > 0 ? warnings : ["Unable to parse objective from prompt."],
            })
          }

          if (sameGoalContract(previous, draft.objective, draft.dod, draft.outOfScope)) {
            return responseResult({
              status: "ok",
              action: "apply",
              updatedFields: [],
              warnings: [...warnings, "No semantic change; goalState was not rewritten."],
              goalState: previous ?? undefined,
            })
          }

          const next = nextGoalState({
            previous,
            objective: draft.objective,
            dod: draft.dod,
            outOfScope: draft.outOfScope,
            source: "auto",
            status: previous ? "edited" : "draft",
          })

          yield* sessions.setGoalState({ sessionID: ctx.sessionID, goalState: next })

          return responseResult({
            status: "ok",
            action: "apply",
            updatedFields: ["objective", "dod", "outOfScope"],
            warnings,
            goalState: next,
          })
        }),
    } satisfies Tool.DefWithoutID<typeof PromptParameters, Metadata>
  }),
)

const CompleteParameters = Schema.Struct({
  summary: Schema.optional(Schema.String).annotate({
    description: "Short summary of what was accomplished for the current objective (shown to the user for confirmation).",
  }),
  evidence: Schema.optional(
    Schema.Array(
      Schema.Struct({
        dod: Schema.String.annotate({ description: "The DoD item this proves. Quote it or paraphrase it closely." }),
        proof: Schema.String.annotate({
          description:
            "A reproducible artifact: the command that was run and its exit code, a test result, a measured number, a file path and what it contains, an observed output. Not an opinion.",
        }),
      }),
    ),
  ).annotate({
    description: "One entry per DoD item, each carrying a verifiable artifact. Required — completion is refused without it.",
  }),
  unverified: Schema.optional(
    Schema.Array(
      Schema.Struct({
        dod: Schema.String,
        reason: Schema.String.annotate({ description: "Why this item could not be proven, stated plainly." }),
      }),
    ),
  ).annotate({
    description:
      "DoD items you are explicitly NOT claiming to have verified. Completion is still allowed, but the gap is recorded and shown to the user.",
  }),
})

/** A proof has to point at something someone else could re-observe. Approval
 *  words are not proof, and this is exactly the failure mode the gate exists to
 *  catch: the model asserting success in the language of success. */
const VAGUE_PROOF =
  /^(ok|okay|done|fait|termin[ée]s?|c'?est bon|[çc]a marche|works?|working|fine|good|yes|oui|valid[ée]?|success|r[ée]ussi|conforme|v[ée]rifi[ée]s?|test[ée]s?|no issues?|aucun probl[èe]me)[\s.!]*$/i

function proofIsSubstantive(proof: string): boolean {
  const value = proof.trim()
  if (value.length < 12) return false
  if (VAGUE_PROOF.test(value)) return false
  // Something re-observable: a command, a path, a number, a status, a URL, a hash.
  return /[\d]|[\\/]|https?:|exit|passed|failed|\bcode\b|\bscore\b|\btest/i.test(value)
}

function matchesDodItem(claim: string, item: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
  const claimWords = new Set(normalize(claim))
  if (claimWords.size === 0) return false
  const itemWords = normalize(item)
  if (itemWords.length === 0) return false
  const overlap = itemWords.filter((word) => claimWords.has(word)).length
  return overlap / itemWords.length >= 0.34
}


function lastUserMessageID(messages: Tool.Context["messages"]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.info.role === "user") return msg.info.id
  }
  return undefined
}

/** Variant of responseResult that overrides the human-readable `output` (F6). */
function responseWithOutput(result: ContractToolResponse, output: string) {
  return {
    title: `Contract ${result.action}`,
    output,
    metadata: { result },
  }
}

function completeToolDefinition() {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "Mark the current task objective as achieved. Requires evidence: one verifiable artifact per DoD item (command + exit code, test output, measured value, file path, observed behaviour). Completion is refused when a DoD item has no proof or the proof is a mere assertion of success. Items you cannot prove must be declared in `unverified` with a reason; they are then reported to the user.",
      parameters: CompleteParameters,
      execute: (params: Schema.Schema.Type<typeof CompleteParameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const previous = session.goalState ?? null

          if (!previous || !previous.goal?.trim()) {
            return responseResult({
              status: "error",
              action: "complete",
              updatedFields: [],
              warnings: ["No active objective to complete."],
            })
          }
          if (previous.status === "completed") {
            return responseResult({
              status: "ok",
              action: "complete",
              updatedFields: [],
              warnings: ["Objective already completed."],
              goalState: previous ?? undefined,
            })
          }
          if (previous.status === "skipped") {
            return responseResult({
              status: "error",
              action: "complete",
              updatedFields: [],
              warnings: ["Objective tracking is skipped for this session; nothing to complete."],
            })
          }

          // The DoD is the contract. Without a gate here, "completed" only means
          // the model decided to say so — which is precisely what it is worst at.
          const dodItems = (previous.dod ?? []).map((item) => item.trim()).filter((item) => item && item !== MINIMAL_DOD_ITEM)
          const evidence = (params.evidence ?? []).filter((item) => item.dod?.trim() && item.proof?.trim())
          const unverified = (params.unverified ?? []).filter((item) => item.dod?.trim() && item.reason?.trim())

          if (dodItems.length > 0) {
            const weak = evidence.filter((item) => !proofIsSubstantive(item.proof))
            const unproven = dodItems.filter(
              (item) =>
                !evidence.some((entry) => proofIsSubstantive(entry.proof) && matchesDodItem(entry.dod, item)) &&
                !unverified.some((entry) => matchesDodItem(entry.dod, item)),
            )
            if (unproven.length > 0 || weak.length > 0) {
              return responseResult({
                status: "error",
                action: "complete",
                updatedFields: [],
                warnings: [
                  "Completion refused: the DoD is not backed by verifiable evidence.",
                  ...unproven.map((item) => `No proof for DoD item: ${item}`),
                  ...weak.map((item) => `Proof is an assertion, not an artifact, for: ${item.dod} → "${item.proof}"`),
                  "Provide `evidence: [{ dod, proof }]` where each proof is re-observable (command + exit code, test output, measured value, file path and content). Declare what you truly cannot prove in `unverified: [{ dod, reason }]`.",
                ],
                goalState: previous ?? undefined,
              })
            }
          }

          const next = {
            ...previous,
            status: "completed" as const,
            anchorUserID: lastUserMessageID(ctx.messages),
            version: (previous.version ?? 0) + 1,
            updatedAt: Date.now(),
          }
          yield* sessions.setGoalState({ sessionID: ctx.sessionID, goalState: next })

          const summaryLine = params.summary?.trim() ? `\nWhat was done: ${params.summary.trim()}` : ""
          const evidenceLines = evidence.map((item) => `  - ${item.dod} → ${item.proof}`)
          const gapLines = unverified.map((item) => `  - NOT VERIFIED: ${item.dod} → ${item.reason}`)
          return responseWithOutput(
            {
              status: "ok",
              action: "complete",
              updatedFields: ["status"],
              warnings: unverified.map((item) => `Unverified DoD item: ${item.dod} (${item.reason})`),
              goalState: next,
            },
            [
              "Objective marked as completed (evidence-gated).",
              `Objective: ${previous.goal}${summaryLine}`,
              ...(evidenceLines.length > 0 ? ["Evidence:", ...evidenceLines] : []),
              ...(gapLines.length > 0 ? ["Gaps:", ...gapLines] : []),
              "Await the user's next objective.",
            ].join("\n"),
          )
        }),
    } satisfies Tool.DefWithoutID<typeof CompleteParameters, Metadata>
  })
}

export const CompleteObjectifTool = Tool.define<typeof CompleteParameters, Metadata, Session.Service>(
  "complete_objectif",
  completeToolDefinition(),
)
export const CompleteObjectiveTool = Tool.define<typeof CompleteParameters, Metadata, Session.Service>(
  "complete_objective",
  completeToolDefinition(),
)
