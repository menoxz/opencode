#!/usr/bin/env bun
/**
 * jev-browser-step — one browser decision, end to end, against the live endpoint.
 *
 * This is the measurement instrument for step 2 of the plan. It takes an a11y
 * snapshot (the shape the browser driver publishes), builds the action space from
 * it, asks the locked Command Code endpoint once, validates the answer, and
 * reports the resulting plan together with what the call cost.
 *
 * It exists because the only honest way to judge the policy layer is to watch it
 * on realistic pages: a policy that is elegant and wrong on a real snapshot is
 * worth nothing, and a policy that is never exercised against the live model is
 * a hypothesis.
 *
 * Usage:
 *   bun script/jev-browser-step.ts <snapshot.json> "<goal>" [history...]
 *
 * <snapshot.json> is `{ "url": ..., "title": ..., "elements": [ { uid, role, name, value?, actionable? } ] }`
 */

import { readFileSync } from "node:fs"
import { JevBrowserActionSpace } from "../src/jev/action-space"
import { JevClient } from "../src/jev/client"
import { JevSchema } from "../src/jev/schema"
import { JevBrowserSnapshot } from "../src/jev/snapshot"
import { JevBrowserValidate } from "../src/jev/validate"

interface SnapshotFile {
  url?: string
  title?: string
  elements: Parameters<typeof JevBrowserSnapshot.toElements>[0]
}

function fail(message: string): never {
  console.log(`ERROR ${message}`)
  process.exit(2)
}

async function main() {
  const path = process.argv[2]
  const goal = process.argv[3]
  if (!path || !goal) fail("usage: jev-browser-step <snapshot.json> \"<goal>\" [history...]")
  const history = process.argv.slice(4)

  const parsed = JSON.parse(readFileSync(path, "utf8")) as SnapshotFile
  const step = JevBrowserSnapshot.step(goal, parsed.elements, {
    url: parsed.url,
    title: parsed.title,
    history,
  })
  const space = JevBrowserActionSpace.space(step.goal, step.observed, step.rules ?? [])

  console.log(`PAGE ${parsed.title ?? "(untitled)"} ${parsed.url ?? ""}`)
  console.log(`GOAL ${goal}`)
  console.log(`ELEMENTS ${space.ids.length}${space.truncated ? ` (truncated ${space.truncated})` : ""}`)
  console.log(`QUESTIONS ${Object.keys(space.questions).length} / ${JevClient.MAX_QUESTIONS_PER_CALL}`)
  for (const [id, element] of space.state.elements.entries()) {
    console.log(`  [${element.index}] ${element.role} "${element.label}"${element.value ? ` = ${element.value}` : ""}`)
  }

  const key = JevClient.apiKey()
  if (!key) fail(`no ${JevClient.PROVIDER_ENV_KEY} in the environment`)

  const body = JSON.stringify({
    model: JevClient.resolveModel(),
    state: space.state,
    questions: space.questions,
  })
  const started = Date.now()
  const response = await fetch(JevClient.resolveEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body,
  })
  const elapsed = Date.now() - started
  if (!response.ok) {
    console.log(`HTTP_ERROR status=${response.status}`)
    console.log((await response.text()).slice(0, 400))
    process.exit(1)
  }

  const json = (await response.json()) as JevSchema.Response
  const outcome = JevBrowserValidate.decision(json.answers, space.operations, space.state.elements)
  const bindings = JevBrowserSnapshot.bind(space.state.elements, parsed.elements)
  const action = JevBrowserSnapshot.plan(outcome, bindings)

  console.log(
    `CALL endpoint=${JevClient.resolveEndpoint()} model=${json.model} status=${response.status} ` +
      `elapsed_ms=${elapsed} request_bytes=${body.length} in_tokens=${json.usage?.input_tokens} out_tokens=${json.usage?.output_tokens}`,
  )
  if (!outcome.ok) {
    console.log(`REJECTED reason=${outcome.reason} detail=${outcome.detail}`)
  } else {
    console.log(`DECIDED operation=${outcome.operation} confidence=${outcome.confidence.toFixed(4)}`)
  }
  console.log(`ACTION ${JSON.stringify(action)}`)
  process.exit(outcome.ok ? 0 : 1)
}

await main()