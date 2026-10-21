#!/usr/bin/env bun
/**
 * Dry-run des garde-fous injectables — spec : `specs/injectable-guards.md`.
 *
 * Montre, sur une session réelle, quelles gardes auraient tiré et **pourquoi**. Le parse et la
 * décision sont ceux du service (`src/guard`), pas une réimplémentation : un instrument qui diverge
 * du code qu'il prétend instrumenter annonce ce qui aurait dû se passer.
 *
 * Usage :
 *   bun packages/opencode/script/guards.ts                 # gardes découvertes + dernière session
 *   bun packages/opencode/script/guards.ts <sessionID>
 *   bun packages/opencode/script/guards.ts <sessionID> --context 200000 --max 2 --max-chars 600
 *
 * Signaux reconstitués depuis la base : `tool_calls_in_turn`, `steps_in_turn`, `step`, `turn`,
 * `since_last_tokens` (jetons cumulés depuis le dernier tir), `context_ratio` (dernier prompt divisé
 * par la fenêtre passée en `--context`). `after_compaction` n'est pas déductible de la base : il vaut
 * false ici, et une garde qui en dépend ne peut donc pas être simulée.
 */
import { Database } from "bun:sqlite"
import { homedir } from "node:os"
import { join } from "node:path"
import { guardRoots } from "../src/guard"
import { loadGuardRoots } from "../src/guard/parse"
import { selectGuards } from "../src/guard/triggers"
import { buildGuardState, type Message, type ToolPart } from "../src/guard/state"

const args = process.argv.slice(2)
const flag = (name: string, fallback?: string) => {
  const index = args.indexOf("--" + name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}
const positional = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"))

const dbPath = join(homedir(), ".local", "share", "opencodev2", "opencode.db")
const contextWindow = Number(flag("context", "200000"))
const max = Number(flag("max", "2"))
const maxChars = Number(flag("max-chars", "600"))

const roots = guardRoots({ configDir: join(homedir(), ".config", "opencodev2"), directory: process.cwd(), worktree: process.cwd() })
const loaded = await loadGuardRoots(roots)

console.log("DOSSIERS DE GARDES")
for (const root of roots) console.log("  " + root + (loaded.files.some((f) => f.startsWith(root)) ? "" : "  (aucun fichier)"))
console.log("\nGARDES CHARGÉES = " + loaded.guards.length)
for (const guard of loaded.guards) {
  const conditions = [
    ...guard.numeric.map((c) => `${c.key}${c.operator}${c.value}`),
    ...guard.boolean.map((c) => `${c.key}=${c.value}`),
    ...guard.list.map((c) => `${c.key}=[${c.globs.join(" ")}]`),
    ...guard.enumeration.map((c) => `${c.key}∈[${c.values.join(" ")}]`),
  ].join(" ET ")
  console.log("  " + guard.name + "  when " + conditions + (guard.maxPerTurn ? `  max/tour ${guard.maxPerTurn}` : ""))
}
if (loaded.errors.length > 0) {
  console.log("\nGARDES REFUSÉES = " + loaded.errors.length)
  for (const error of loaded.errors) console.log("  " + error.location + "\n    " + error.message)
}

const db = new Database(dbPath, { readonly: true })
try {
  const recent = db
    .query("select id, title, time_updated from session order by time_updated desc limit 3")
    .all() as { id: string; title: string; time_updated: number }[]
  const sessionID = positional[0] ?? recent[0]?.id
  if (!sessionID) {
    console.log("\nAUCUNE SESSION")
    process.exit(0)
  }
  console.log("\nSESSIONS RÉCENTES")
  for (const session of recent) console.log("  " + session.id + "  " + String(session.title).slice(0, 56))
  console.log("\nSESSION SIMULÉE = " + sessionID)

  const rows = db
    .query(
      "select m.id as id, m.time_created as time_created, m.data as mdata, p.data as pdata" +
        " from message m left join part p on p.message_id = m.id" +
        " where m.session_id = ? order by m.time_created asc, p.time_created asc",
    )
    .all(sessionID) as { id: string; time_created: number; mdata: string; pdata: string | null }[]

  type Step = { id: string; role: string; toolCalls: number; tools: string[]; parts: ToolPart[]; tokens: number }
  const steps = new Map<string, Step>()
  for (const row of rows) {
    let step = steps.get(row.id)
    if (!step) {
      let role = "unknown"
      let tokens = 0
      try {
        const data = JSON.parse(row.mdata) as { role?: string; tokens?: { input?: number; output?: number } }
        role = data.role ?? "unknown"
        tokens = (data.tokens?.input ?? 0) + (data.tokens?.output ?? 0)
      } catch {
        // un message illisible ne doit pas casser la simulation
      }
      step = { id: row.id, role, toolCalls: 0, tools: [], parts: [], tokens }
      steps.set(row.id, step)
    }
    if (!row.pdata) continue
    try {
      const part = JSON.parse(row.pdata) as ToolPart & { name?: string }
      if (part.type !== "tool") continue
      step.toolCalls += 1
      const name = part.tool ?? part.name
      if (name) step.tools.push(name)
      step.parts.push(part)
    } catch {
      continue
    }
  }

  const ordered = [...steps.values()]
  let turn = 0
  let stepsInTurn = 0
  let toolCallsInTurn = 0
  let tokensSinceLastGuard = 0
  let lastPrompt = 0
  const firedThisTurn: Record<string, number> = {}
  // Messages du tour courant : `buildGuardState` en dérive le nombre d'outils, la série d'échecs et
  // les répétitions. Reconstruire ces compteurs ici ferait diverger l'instrument du service.
  const turnMessages: Message[] = []
  let missingSignals: string[] = []
  const observedTools = new Set<string>()
  const firings: { step: number; turn: number; name: string; reasons: string }[] = []

  for (const step of ordered) {
    if (step.role === "user") {
      turn += 1
      stepsInTurn = 0
      turnMessages.length = 0
      for (const key of Object.keys(firedThisTurn)) delete firedThisTurn[key]
      continue
    }
    stepsInTurn += 1
    turnMessages.push({ info: { role: step.role }, parts: step.parts })
    tokensSinceLastGuard += step.tokens
    if (step.tokens > 0) lastPrompt = step.tokens

    const { state, signals } = buildGuardState({
      step: stepsInTurn,
      turn,
      stepsInTurn,
      messages: turnMessages,
      tokensSinceLastGuard,
      contextWindow,
      lastPromptTokens: lastPrompt,
      afterCompaction: false,
    })
    missingSignals = signals.missing
    for (const name of Object.keys(state.toolCallsByName ?? {})) observedTools.add(name)

    const { selected } = selectGuards(loaded.guards, { ...state, firedThisTurn }, { max, maxChars })
    for (const entry of selected) {
      firedThisTurn[entry.guard.name] = (firedThisTurn[entry.guard.name] ?? 0) + 1
      tokensSinceLastGuard = 0
      firings.push({ step: stepsInTurn, turn, name: entry.guard.name, reasons: entry.reasons.join(", ") })
    }
  }

  console.log("\nTIRS SIMULÉS = " + firings.length)
  for (const firing of firings) {
    console.log(
      "  tour " + String(firing.turn).padStart(2) + "  step " + String(firing.step).padStart(2) + "  " + firing.name.padEnd(28) + firing.reasons,
    )
  }
  if (firings.length === 0) console.log("  (aucun : soit aucune garde découverte, soit aucun seuil atteint)")

  // Outils cités par une garde mais jamais appelés dans la session : ce n'est pas « seuil non
  // atteint », c'est une garde qui ne peut pas tirer ici. Le dry-run doit le dire.
  const cited = [...new Set(loaded.guards.flatMap((guard) => guard.tools.map((condition) => condition.tool)))].sort()
  const never = cited.filter((tool) => !observedTools.has(tool))
  console.log("\nOUTILS OBSERVÉS = " + ([...observedTools].sort().join(", ") || "aucun"))
  if (cited.length > 0) {
    console.log("OUTILS CITÉS PAR UNE GARDE = " + cited.join(", "))
    console.log(never.length > 0 ? "JAMAIS OBSERVÉS (garde morte ici) = " + never.join(", ") : "TOUS OBSERVÉS")
  }
  console.log(
    missingSignals.length > 0
      ? "\nSIGNAUX NON DÉDUCTIBLES DE LA BASE = " + missingSignals.join(", ")
      : "\nTOUS LES SIGNAUX DÉDUCTIBLES ONT ÉTÉ MESURÉS",
  )
  // `after_compaction` n'existe pas dans la base : il ne peut venir que de la boucle de step.
  console.log("after_compaction reste false ici : signal de la boucle, pas de l'historique")
} finally {
  db.close()
}
