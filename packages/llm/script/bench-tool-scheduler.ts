import { Effect, Schema, Stream } from "effect"
import { Auth, LLM, LLMEvent, tool } from "../src"
import * as ToolRuntime from "../src/tool-runtime"
import * as OpenAIChat from "../src/protocols/openai-chat"

const DELAY_MS = 25
const CALLS = 4
const model = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "benchmark" })
const request = LLM.request({ id: "bench", model, prompt: "Benchmark tool scheduling." })

const makeTool = (safe: boolean) =>
  tool({
    description: "Benchmark delayed operation",
    ...(safe ? { annotations: { readOnlyHint: true } } : {}),
    parameters: Schema.Struct({ value: Schema.String }),
    success: Schema.String,
    execute: ({ value }) => Effect.promise(() => Bun.sleep(DELAY_MS).then(() => value)),
  })

const run = async (safe: boolean) => {
  const calls = Array.from({ length: CALLS }, (_, index) =>
    LLMEvent.toolCall({ id: `call-${index}`, name: "operation", input: { value: String(index) } }),
  )
  const started = Bun.nanoseconds()
  await Effect.runPromise(
    ToolRuntime.stream({
      request,
      tools: { operation: makeTool(safe) },
      stream: () => Stream.fromIterable([...calls, LLMEvent.stepFinish({ index: 0, reason: "tool-calls" })]),
    }).pipe(Stream.runDrain),
  )
  return (Bun.nanoseconds() - started) / 1_000_000
}

const serialMs = await run(false)
const parallelMs = await run(true)
console.log(
  JSON.stringify(
    {
      calls: CALLS,
      delayPerCallMs: DELAY_MS,
      serialMs: Number(serialMs.toFixed(2)),
      parallelMs: Number(parallelMs.toFixed(2)),
      speedup: Number((serialMs / parallelMs).toFixed(2)),
    },
    null,
    2,
  ),
)
