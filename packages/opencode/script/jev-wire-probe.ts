#!/usr/bin/env bun
/**
 * jev-wire-probe — verifies the System One wire contract that jev-ultrafast relies on.
 *
 * The design under test is the one in https://github.com/browser-use/jev-ultrafast:
 * a single request carries one operation head plus a target head whose criteria are
 * generated from the elements currently observed on the page. If that holds, a browser
 * policy can decide a step in one call instead of a multi-turn tool-selection loop.
 *
 * What this probe asserts, per head:
 *   - one request answers every head it carries (including the speculative fan-out)
 *   - probabilities are present and sum to 1 (the tolerance jev-ultrafast uses is 0.02)
 *   - `choice` equals the argmax of the probability table (the fork's JevSchema requires it)
 *
 * Credentials resolve the same way `src/jev/client.ts` does for the command-code provider:
 * `COMMAND_CODE_API_KEY` in the environment first, then `jev.api_key` in opencode.json. Nothing is
 * printed but the facts above.
 *
 * Usage: bun script/jev-wire-probe.ts
 */

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ENDPOINT = "https://api.commandcode.ai/provider/v1/systemone"
const MODEL = "typesafe/jev"
const SUM_TOLERANCE = 0.02
const EXPECTED_ELEMENT_COUNT = 62

type Choice = Record<string, { element: string; current_value: string; role: string }>

function loadKey(): string {
  const fromEnv = process.env.COMMAND_CODE_API_KEY
  if (fromEnv && fromEnv.length > 0) return fromEnv
  const path = join(homedir(), ".config", "opencodev2", "opencode.json")
  const config = JSON.parse(readFileSync(path, "utf8"))
  const key = config?.jev?.api_key
  if (typeof key !== "string" || key.length === 0)
    throw new Error(
      `no COMMAND_CODE_API_KEY and no jev.api_key in ${path} — run with a configured provider`,
    )
  return key
}

/** A page observation shaped like a real action table, not a toy of two entries. */
function buildState() {
  const roles = ["button", "combobox", "textbox", "link", "checkbox", "tab", "menuitem", "option"]
  const labels = [
    "Change ticket type", "Where from?", "Where to?", "Departure", "Return", "Search flights",
    "Passengers", "Class", "1 adult", "Economy", "Search", "Filter results", "Stops", "Nonstop",
    "Airlines", "Currency", "Trip type", "Round trip", "One way", "Multi-city", "Flexible dates",
    "Add destination", "Remove", "Done", "Apply", "Reset", "Sort by", "Price", "Duration",
    "Departure time", "Arrival time", "Airports", "Nearby", "Anywhere", "Advanced search", "Help",
    "Sign in", "Feedback", "Privacy", "Terms", "Accessibility", "Language", "Region",
    "Cookie settings", "More filters", "Reset form", "Show more", "Show less", "Clear all",
    "Popular routes", "Explore", "Trips", "Flights", "Hotels", "Cars", "Packages", "Deals",
    "Support", "Contact us", "Feedback form", "Report a problem", "Where to?",
  ]
  const elements = labels.map((label, i) => ({
    index: String(i + 1),
    role: roles[i % roles.length]!,
    value: i % 3 === 0 ? "" : "empty",
    label,
  }))
  const click: Choice = {}
  for (const e of elements)
    click[e.index] = { element: `[${e.index}] ${e.label}`, current_value: e.value, role: e.role }
  return {
    state: {
      page: {
        url: "https://www.google.com/travel/flights?hl=en",
        title: "Google Flights",
        text: "Flights Zurich London. One way. 1 adult Economy. Cheapest CHF 118 round trip.",
      },
      elements,
      recent_actions: [],
    },
    click,
    count: elements.length,
  }
}

const GOAL = "Find one-way flights from Zurich to London on September 20, 2026, for one adult in economy."

function targetQuestion(criteria: Choice, operation: string) {
  return {
    type: "choice",
    instructions: {
      goal: GOAL,
      operation,
      rules: ["Choose the best observed target.", "Do not choose a field that already holds the requested value."],
    },
    criteria,
  }
}

function questions(click: Choice, fanout: boolean) {
  const base: Record<string, unknown> = {
    operation: {
      type: "choice",
      instructions: {
        goal: GOAL,
        rules: ["Advance the goal from the CURRENT page using one operation.", "Fill required fields before submitting."],
      },
      criteria: {
        CLICK: "Click an element, button, menu option, autocomplete suggestion, or calendar day.",
        TYPE_TEXT: "Enter or replace text in an editable field. A small LLM will supply the value from the goal.",
        SELECT: "Select an observed dropdown value.",
        SCROLL_DOWN: "Scroll down.",
        WAIT: "Wait for the page to update.",
        DONE: "Every requirement is visibly satisfied.",
        BLOCKED: "No supported operation can progress.",
      },
    },
    click_target: targetQuestion(click, "CLICK"),
  }
  if (fanout) base.type_text_target = targetQuestion(click, "TYPE_TEXT")
  return base
}

async function probe(label: string, key: string, payload: unknown, heads: string[]) {
  const body = JSON.stringify({ model: MODEL, ...(payload as object) })
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body,
    })
  } catch (err) {
    console.log(`PROBE=${label} TRANSPORT_ERROR ${(err as Error).message}`)
    return false
  }
  if (!res.ok) {
    console.log(`PROBE=${label} HTTP_ERROR status=${res.status}`)
    return false
  }
  const elapsed = Date.now() - started
  const json = (await res.json()) as {
    model?: string
    answers: Record<string, { type: string; choice: string; probabilities?: Record<string, number> }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  console.log(
    `PROBE=${label} HTTP_OK status=${res.status} elapsed_ms=${elapsed} request_bytes=${body.length} ` +
      `model=${json.model} usage_in=${json.usage?.input_tokens} usage_out=${json.usage?.output_tokens}`,
  )
  let ok = true
  for (const head of heads) {
    const answer = json.answers[head]
    if (!answer) {
      console.log(`PROBE=${label} ${head} ABSENT`)
      ok = false
      continue
    }
    const probs = answer.probabilities ?? {}
    let sum = 0
    let max = -Infinity
    let argmax = ""
    for (const [id, p] of Object.entries(probs)) {
      sum += p
      if (p > max) {
        max = p
        argmax = id
      }
    }
    const n = Object.keys(probs).length
    const sumOk = Math.abs(sum - 1) <= SUM_TOLERANCE
    const argmaxOk = answer.choice === argmax
    if (!sumOk || !argmaxOk || n === 0) ok = false
    console.log(
      `PROBE=${label} ${head} type=${answer.type} choice=${answer.choice} probs_n=${n} ` +
        `probs_sum=${sum.toFixed(4)} sum_ok=${sumOk} argmax=${argmax} choice_is_argmax=${argmaxOk}`,
    )
  }
  return ok
}

const key = loadKey()
const { state, click, count } = buildState()
console.log(`ELEMENT_COUNT=${count}`)
if (count !== EXPECTED_ELEMENT_COUNT) throw new Error(`element table drifted: ${count}`)

const twoHeads = await probe("two-heads", key, { state, questions: questions(click, false) }, [
  "operation",
  "click_target",
])
const fanout = await probe("fanout-3-heads", key, { state, questions: questions(click, true) }, [
  "operation",
  "click_target",
  "type_text_target",
])

const pass = twoHeads && fanout
console.log(`RESULT=${pass ? "PASS" : "FAIL"}`)
process.exit(pass ? 0 : 1)