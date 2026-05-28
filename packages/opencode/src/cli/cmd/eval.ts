import { EOL } from "os"
import { Effect, Duration } from "effect"
import { effectCmd } from "../effect-cmd"
import { cmd } from "./cmd"
import { Eval, autoEvaluate } from "@/eval"
import type { EvalScenario, ScenarioResult } from "@/eval/scenario"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import * as MessageV2 from "@/session/message-v2"

function parseModelArg(value: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = value.split("/")
  return { providerID, modelID: rest.join("/") }
}

export const EvalCommand = cmd({
  command: "eval",
  describe: "benchmark and evaluate agent capabilities",
  builder: (yargs) =>
    yargs
      .command(ListCommand)
      .command(RunCommand)
      .command(ReportCommand)
      .demandCommand(),
  async handler() {},
})

const ListCommand = effectCmd({
  command: "list [category] [difficulty]",
  describe: "list available evaluation scenarios",
  builder: (yargs) =>
    yargs
      .positional("category", {
        describe: "filter by category (code-generation, bug-fixing, etc.)",
        type: "string",
      })
      .positional("difficulty", {
        describe: "filter by difficulty (easy, medium, hard, expert)",
        type: "string",
      }),
  handler: Effect.fn("Cli.eval.list")(function* (args) {
    const svc = yield* Eval.Service
    const scenarios = svc.listScenarios({
      category: args.category as any,
      difficulty: args.difficulty as any,
    })

    if (scenarios.length === 0) {
      process.stdout.write("No scenarios found." + EOL)
      return
    }

    process.stdout.write("Available scenarios (" + scenarios.length + "):" + EOL + EOL)
    for (const s of scenarios) {
      process.stdout.write("  " + s.id.padEnd(24) + " " + s.name + EOL)
      process.stdout.write(
        "  " + " ".repeat(24) + " category: " + s.category + ", difficulty: " + s.difficulty + ", tags: " + s.tags.join(", ") + EOL,
      )
      process.stdout.write("" + EOL)
    }
  }),
})

const RunCommand = effectCmd({
  command: "run [target]",
  describe: "run an evaluation scenario or suite against a real agent",
  builder: (yargs) =>
    yargs
      .positional("target", {
        describe: "scenario ID or suite ID",
        type: "string",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use (default: build)",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      }),
  handler: Effect.fn("Cli.eval.run")(function* (args) {
    if (!args.target) {
      process.stdout.write("Usage: opencode eval run <scenario-id|suite-id>" + EOL)
      return
    }

    const svc = yield* Eval.Service
    const agentArg: string | undefined = args.agent
    const modelArg: { providerID: string; modelID: string } | undefined = args.model ? parseModelArg(args.model) : undefined

    const runOpts: EvalRunOptions = {}
    if (agentArg) runOpts.agent = agentArg
    if (modelArg) runOpts.model = modelArg

    // Try scenario first
    const scenario = svc.getScenario(args.target)
    if (scenario) {
      process.stdout.write("Running scenario: " + scenario.name + "..." + EOL)
      if (agentArg) process.stdout.write("  Agent:      " + agentArg + EOL)
      if (modelArg) process.stdout.write("  Model:      " + modelArg.providerID + "/" + modelArg.modelID + EOL)
      const result = yield* runScenarioWithAgent(scenario, runOpts)
      process.stdout.write("" + EOL)
      process.stdout.write("  Result:     " + (result.success ? "PASS" : "FAIL") + EOL)
      process.stdout.write("  Behaviors:  " + result.behaviorsMatched + "/" + result.behaviorsTotal + EOL)
      process.stdout.write("  Duration:   " + result.durationMs + "ms" + EOL)
      process.stdout.write("  Tokens:     " + result.tokensUsed + EOL)
      if (result.errors.length > 0) {
        process.stdout.write("  Errors:     " + result.errors.join(", ") + EOL)
      }

      // Record the run
      const report = yield* svc.recordRun([result], scenario.id, scenario.name)
      process.stdout.write("  Run ID:     " + report.runId + EOL)
      return
    }

    // Try suite
    const suite = svc.getSuite(args.target)
    if (suite) {
      process.stdout.write("Running suite: " + suite.name + " (" + suite.scenarios.length + " scenarios)..." + EOL)
      if (agentArg) process.stdout.write("  Agent:      " + agentArg + EOL)
      if (modelArg) process.stdout.write("  Model:      " + modelArg.providerID + "/" + modelArg.modelID + EOL)
      const results = []
      for (const s of suite.scenarios) {
        process.stdout.write("  [" + s.id + "] " + s.name + "... " + EOL)
        const r = yield* runScenarioWithAgent(s, runOpts)
        results.push(r)
        process.stdout.write("    " + (r.success ? "\u2713 PASS" : "\u2717 FAIL") + "  " + r.behaviorsMatched + "/" + r.behaviorsTotal + "  " + r.durationMs + "ms" + EOL)
      }

      const passed = results.filter((r) => r.success).length
      const totalDuration = results.reduce((s, r) => s + r.durationMs, 0)
      process.stdout.write("" + EOL)
      process.stdout.write("  Suite:      " + suite.name + EOL)
      process.stdout.write("  Passed:     " + passed + "/" + results.length + EOL)
      process.stdout.write("  Pass rate:  " + ((passed / results.length) * 100).toFixed(1) + "%" + EOL)
      process.stdout.write("  Duration:   " + totalDuration + "ms" + EOL)

      // Record the run
      const report = yield* svc.recordRun(results, suite.id, suite.name)
      process.stdout.write("  Run ID:     " + report.runId + EOL)
      return
    }

    process.stdout.write(
      'Not found: "' + args.target + '". Use "opencode eval list" to see available scenarios and suites.' + EOL,
    )
  }),
})

const ReportCommand = effectCmd({
  command: "report",
  describe: "show recent eval reports",
  handler: Effect.fn("Cli.eval.report")(function* () {
    const svc = yield* Eval.Service
    const reports = yield* svc.listReports(10)

    if (reports.length === 0) {
      process.stdout.write("No eval reports yet. Run 'opencode eval run' first." + EOL)
      return
    }

    process.stdout.write("Recent eval reports:" + EOL + EOL)
    for (const r of reports) {
      process.stdout.write("  Run ID:     " + r.runId + EOL)
      process.stdout.write("  Suite:      " + r.suiteName + " (" + r.suiteId + ")" + EOL)
      process.stdout.write("  Passed:     " + r.passed + "/" + r.totalScenarios + " (" + (r.passRate * 100).toFixed(1) + "%)" + EOL)
      process.stdout.write("  Duration:   " + r.durationMs + "ms" + EOL)
      process.stdout.write("  Tokens:     " + r.totalTokensUsed + EOL)
      process.stdout.write("" + EOL)
    }
  }),
})

// ---------------------------------------------------------------------------
// Agent Runner
// ---------------------------------------------------------------------------

type EvalRunOptions = {
  agent?: string
  model?: { providerID: string; modelID: string }
}

const defaultOpts: EvalRunOptions = { agent: "build" }

/**
 * Run a single eval scenario against the real agent.
 * Creates a session, sends the task prompt, collects the output, auto-evaluates.
 * Services (Session, SessionPrompt) are provided through AppRuntime via effectCmd.
 */
const runScenarioWithAgent = (scenario: EvalScenario, options?: EvalRunOptions): Effect.Effect<ScenarioResult> =>
  Effect.gen(function* () {
    const sessionSvc = yield* Session.Service
    const promptSvc = yield* SessionPrompt.Service
    const startedAt = Date.now()
    const timeoutSecs = scenario.timeoutSeconds
    const { agent, model } = { ...defaultOpts, ...options }

    // Create a temporary session for this eval scenario
    const session = yield* sessionSvc.create({
      title: "eval: " + scenario.name,
      agent,
      model: model ? ({ providerID: model.providerID, id: model.modelID } as any) : undefined,
    })

    try {
      // Run the agent on the scenario task prompt with timeout.
      // On failure (timeout, LLM error), catch returns null.
      const rawResponse: any = yield* (promptSvc as any)
        .prompt({
          sessionID: session.id,
          agent,
          model,
          parts: [{ type: "text", text: scenario.taskPrompt }],
        })
        .pipe(
          Effect.timeout(Duration.seconds(timeoutSecs)),
          Effect.catch(() => Effect.succeed(null)),
        )

      const completedAt = Date.now()
      const durationMs = completedAt - startedAt

      // On timeout or error, return a failure
      if (!rawResponse) {
        return makeFailedResult(scenario, startedAt, completedAt, durationMs, [
          "Agent execution failed or timed out",
        ])
      }

      const response = rawResponse as MessageV2.WithParts
      const info = response.info as MessageV2.Assistant
      const output = response.parts
        .filter((p: MessageV2.Part): p is MessageV2.TextPart => p.type === "text")
        .map((p: MessageV2.TextPart) => p.text)
        .join("\n")

      const toolCalls = response.parts
        .filter((p: MessageV2.Part): p is MessageV2.ToolPart => p.type === "tool")
        .filter((p: MessageV2.ToolPart) => p.state.status === "completed" || p.state.status === "error")
        .map((p: MessageV2.ToolPart) => p.tool)

      const errors: string[] = []
      if (info.error) errors.push(JSON.stringify(info.error))

      const { matched, total } = autoEvaluate(scenario, output, toolCalls)
      const success = matched >= Math.ceil(total / 2)

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success,
        durationMs,
        tokensUsed: info.tokens?.total ?? 0,
        toolCalls: toolCalls.length,
        errors,
        behaviorsMatched: matched,
        behaviorsTotal: total,
        output: "Task: " + scenario.taskPrompt + "\n\nOutput:\n" + output,
        startedAt,
        completedAt,
      }
    } finally {
      // Archive the session to keep things tidy
      yield* sessionSvc.setArchived({ sessionID: session.id }).pipe(
        Effect.catch(() => Effect.void),
      )
    }
  }) as any

function makeFailedResult(
  scenario: EvalScenario,
  startedAt: number,
  completedAt: number,
  durationMs: number,
  errors: string[],
): ScenarioResult {
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    success: false,
    durationMs,
    tokensUsed: 0,
    toolCalls: 0,
    errors,
    behaviorsMatched: 0,
    behaviorsTotal: scenario.expectedBehaviors.length,
    output: "",
    startedAt,
    completedAt,
  }
}
