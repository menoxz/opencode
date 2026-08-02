import { EOL } from "os"
import { Effect, Duration, Schedule } from "effect"
import { effectCmd } from "../effect-cmd"
import { cmd } from "./cmd"
import { Eval } from "@/eval"
import { commandExecutor, runScenarioReal } from "@/eval/real-runner"
import type { ScenarioResult } from "@/eval/scenario"

/**
 * Outcome label. An unverified run must never be printed as PASS (it would
 * manufacture confidence) nor as FAIL (it would manufacture a phantom bug).
 */
function outcome(sc: ScenarioResult): string {
  if (sc.verdict === "unverified") return "UNVERIFIED"
  return sc.success ? "PASS" : "FAIL"
}

function outcomeMark(sc: ScenarioResult): string {
  if (sc.verdict === "unverified") return "\u26A0 UNVERIFIED"
  return sc.success ? "\u2713 PASS" : "\u2717 FAIL"
}

/** Warn once per report when nothing was actually checked. */
function unverifiedHint(scenarios: ScenarioResult[]): string {
  const count = scenarios.filter((s) => s.verdict === "unverified").length
  if (count === 0) return ""
  return (
    "  Unverified: " + count + "/" + scenarios.length + EOL +
    "              simulated runs execute no agent and prove nothing." + EOL +
    "              Use --runner real (or OPENCODE_DAEMON_EVAL_REAL=1) to verify." + EOL
  )
}


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
      .command(WatchCommand)
      .command(CompareCommand)
      .command(TrendCommand)
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
  describe: "run an evaluation scenario or suite",
  builder: (yargs) =>
    yargs
      .positional("target", {
        describe: "scenario ID or suite ID",
        type: "string",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use (default: build) — only for real-agent runs",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model — only for real-agent runs",
      })
      .option("runner", {
        type: "string",
        choices: ["simulated", "real"] as const,
        default: "simulated",
        describe: "runner mode: simulated is deterministic; real is opt-in and uses real scenario validation",
      }),
  handler: Effect.fn("Cli.eval.run")(function* (args) {
    if (!args.target) {
      process.stdout.write("Usage: opencodev2 eval run <scenario-id|suite-id>" + EOL)
      return
    }

    const svc = yield* Eval.Service
    const agentArg: string | undefined = args.agent
    const modelArg = args.model ? parseModelArg(args.model) : undefined
    const runner = args.runner ?? "simulated"

    const realCommand = process.env.OPENCODE_EVAL_REAL_COMMAND

    // Try scenario (single)
    const scenario = svc.getScenario(args.target)
    if (scenario) {
      process.stdout.write("Running scenario: " + scenario.name + "..." + EOL)
      if (agentArg) process.stdout.write("  Agent:      " + agentArg + EOL)
      if (modelArg) process.stdout.write("  Model:      " + modelArg.providerID + "/" + modelArg.modelID + EOL)
      if (runner === "real") {
        if (!realCommand) {
          process.stdout.write(
            "Real eval CLI requires OPENCODE_EVAL_REAL_COMMAND for this iteration." + EOL +
              "The command runs in the scenario sandbox; SessionPrompt LLM execution remains a future integration." + EOL,
          )
          return
        }
        const sc = yield* runScenarioReal(scenario, commandExecutor(realCommand))
        const report = yield* svc.recordRun([sc], scenario.id, scenario.name)
        process.stdout.write("" + EOL)
        process.stdout.write("  Result:     " + outcome(sc) + EOL)
        process.stdout.write("  Behaviors:  " + sc.behaviorsMatched + "/" + sc.behaviorsTotal + EOL)
        process.stdout.write("  Duration:   " + sc.durationMs + "ms" + EOL)
        process.stdout.write("  Tokens:     " + sc.tokensUsed + EOL)
        if (sc.errors.length > 0) process.stdout.write("  Errors:     " + sc.errors.join(", ") + EOL)
        process.stdout.write("  Run ID:     " + report.runId + EOL)
        return
      }
      const result = yield* svc.runSuite(args.target, { mode: "auto", record: false })
      // runSuite returns a report — extract first scenario
      const report = yield* svc.recordRun(result.scenarios, scenario.id, scenario.name)
      process.stdout.write("" + EOL)
      for (const sc of result.scenarios) {
        process.stdout.write("  Result:     " + outcome(sc) + EOL)
        process.stdout.write("  Behaviors:  " + sc.behaviorsMatched + "/" + sc.behaviorsTotal + EOL)
        process.stdout.write("  Duration:   " + sc.durationMs + "ms" + EOL)
        process.stdout.write("  Tokens:     " + sc.tokensUsed + EOL)
        if (sc.errors.length > 0) process.stdout.write("  Errors:     " + sc.errors.join(", ") + EOL)
      }
      process.stdout.write("  Run ID:     " + report.runId + EOL)
      return
    }

    // Try suite
    const suite = svc.getSuite(args.target)
    if (suite) {
      process.stdout.write("Running suite: " + suite.name + " (" + suite.scenarios.length + " scenarios)..." + EOL)
      if (agentArg) process.stdout.write("  Agent:      " + agentArg + EOL)
      if (modelArg) process.stdout.write("  Model:      " + modelArg.providerID + "/" + modelArg.modelID + EOL)
      if (runner === "real") {
        if (!realCommand) {
          process.stdout.write(
            "Real eval CLI requires OPENCODE_EVAL_REAL_COMMAND for this iteration." + EOL +
              "The command runs in each scenario sandbox; SessionPrompt LLM execution remains a future integration." + EOL,
          )
          return
        }
        const results = []
        for (const sc of suite.scenarios) results.push(yield* runScenarioReal(sc, commandExecutor(realCommand)))
        const report = yield* svc.recordRun(results, suite.id, suite.name)
        process.stdout.write("" + EOL)
        for (const sc of report.scenarios) {
          process.stdout.write("  [" + sc.scenarioId + "] " + sc.scenarioName + "... " + EOL)
          process.stdout.write("    " + outcomeMark(sc) + "  " + sc.behaviorsMatched + "/" + sc.behaviorsTotal + "  " + sc.durationMs + "ms" + EOL)
        }
        process.stdout.write("" + EOL)
        process.stdout.write("  Suite:      " + suite.name + EOL)
        process.stdout.write("  Passed:     " + report.passed + "/" + report.totalScenarios + EOL)
        process.stdout.write("  Pass rate:  " + (report.passRate * 100).toFixed(1) + "%" + EOL)
        process.stdout.write(unverifiedHint(report.scenarios))
        process.stdout.write("  Duration:   " + report.durationMs + "ms" + EOL)
        process.stdout.write("  Run ID:     " + report.runId + EOL)
        return
      }
      const report = yield* svc.runSuite(args.target)
      process.stdout.write("" + EOL)
      for (const sc of report.scenarios) {
        process.stdout.write("  [" + sc.scenarioId + "] " + sc.scenarioName + "... " + EOL)
        process.stdout.write("    " + outcomeMark(sc) + "  " + sc.behaviorsMatched + "/" + sc.behaviorsTotal + "  " + sc.durationMs + "ms" + EOL)
      }

      process.stdout.write("" + EOL)
      process.stdout.write("  Suite:      " + suite.name + EOL)
      process.stdout.write("  Passed:     " + report.passed + "/" + report.totalScenarios + EOL)
      process.stdout.write("  Pass rate:  " + (report.passRate * 100).toFixed(1) + "%" + EOL)
      process.stdout.write(unverifiedHint(report.scenarios))
      process.stdout.write("  Duration:   " + report.durationMs + "ms" + EOL)
      process.stdout.write("  Run ID:     " + report.runId + EOL)
      return
    }

    process.stdout.write(
      'Not found: "' + args.target + '". Use "opencodev2 eval list" to see available scenarios and suites.' + EOL,
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
      process.stdout.write("No eval reports yet. Run 'opencodev2 eval run' first." + EOL)
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

const WatchCommand = effectCmd({
  command: "watch [interval]",
  describe: "watch mode — run the sanity suite periodically and check for regressions",
  builder: (yargs) =>
    yargs
      .positional("interval", {
        describe: "interval in minutes between runs (default: 15)",
        type: "number",
      })
      .option("suite", {
        type: "string",
        describe: "suite to run (default: sanity)",
        default: "sanity",
      }),
  handler: Effect.fn("Cli.eval.watch")(function* (args) {
    const interval = (args.interval ?? 15) * 60 * 1000
    const suiteId = args.suite as string
    const svc = yield* Eval.Service

    const runAndReport = Effect.gen(function* () {
      process.stdout.write(`[${new Date().toISOString()}] Running suite "${suiteId}"...` + EOL)
      const report = yield* svc.runSuite(suiteId)

      process.stdout.write(
        `  Passed: ${report.passed}/${report.totalScenarios} (${(report.passRate * 100).toFixed(1)}%)  Duration: ${report.durationMs}ms` + EOL,
      )

      const regressionOpt = yield* Effect.option(svc.detectRegression(suiteId))
      if (regressionOpt._tag === "Some") {
        const r = regressionOpt.value
        if (r && r.major) {
          process.stdout.write(
            `  ⚠ REGRESSION: passRate ${(r.passRate.delta * 100).toFixed(1)}%, ` +
            `duration ${(r.avgDurationMs.delta > 0 ? "+" : "")}${r.avgDurationMs.delta}ms` + EOL,
          )
          if (r.details.newFailures.length > 0) {
            process.stdout.write(`  New failures: ${r.details.newFailures.join(", ")}` + EOL)
          }
        } else {
          process.stdout.write(`  ✅ No regression detected` + EOL)
        }
      } else {
        process.stdout.write(`  ✅ No regression detected` + EOL)
      }
    })

    const schedule = Schedule.fixed(Duration.millis(interval))
    process.stdout.write(`Watching suite "${suiteId}" every ${args.interval ?? 15} minutes...` + EOL)
    yield* runAndReport.pipe(Effect.repeat(schedule))
  }),
})

const CompareCommand = effectCmd({
  command: "compare <runIdA> <runIdB>",
  describe: "compare two eval runs and show the diff",
  builder: (yargs) =>
    yargs
      .positional("runIdA", { describe: "first run ID", type: "string" })
      .positional("runIdB", { describe: "second run ID", type: "string" }),
  handler: Effect.fn("Cli.eval.compare")(function* (args) {
    const svc = yield* Eval.Service
    const comparison = yield* svc.compareRuns(args.runIdA, args.runIdB)

    if (!comparison) {
      process.stdout.write("Could not find one or both runs." + EOL)
      return
    }

    process.stdout.write("Comparison:" + EOL + EOL)
    process.stdout.write(`  Current:    ${comparison.current.runId} @ ${new Date(comparison.current.timestamp).toISOString()}` + EOL)
    process.stdout.write(`  Baseline:   ${comparison.baseline.runId} @ ${new Date(comparison.baseline.timestamp).toISOString()}` + EOL)
    process.stdout.write(`  Pass rate:  ${(comparison.current.passRate * 100).toFixed(1)}% → ${(comparison.baseline.passRate * 100).toFixed(1)}% (${(comparison.passRateDelta > 0 ? "+" : "")}${(comparison.passRateDelta * 100).toFixed(1)}%)` + EOL)
    process.stdout.write(`  Duration:   ${comparison.current.avgDurationMs}ms → ${comparison.baseline.avgDurationMs}ms (${comparison.durationDelta > 0 ? "+" : ""}${comparison.durationDelta}ms)` + EOL)

    if (comparison.regressed.length > 0) {
      process.stdout.write(`  Regressed:  ${comparison.regressed.join(", ")}` + EOL)
    }
    if (comparison.improved.length > 0) {
      process.stdout.write(`  Improved:   ${comparison.improved.join(", ")}` + EOL)
    }
  }),
})

const TrendCommand = effectCmd({
  command: "trend [suite]",
  describe: "show pass rate trend over time for a suite",
  builder: (yargs) =>
    yargs
      .positional("suite", {
        describe: "suite ID (default: sanity)",
        type: "string",
        default: "sanity",
      })
      .option("limit", {
        type: "number",
        describe: "number of recent runs to show (default: 20)",
        default: 20,
      }),
  handler: Effect.fn("Cli.eval.trend")(function* (args) {
    const svc = yield* Eval.Service
    const suiteId = args.suite as string
    const limit = args.limit as number

    const reports = yield* svc.listReports(limit)
    const filtered = reports.filter((r) => r.suiteId === suiteId)

    if (filtered.length === 0) {
      process.stdout.write(`No runs found for suite "${suiteId}".` + EOL)
      return
    }

    process.stdout.write(`Trend for suite "${suiteId}" (${filtered.length} runs):` + EOL + EOL)
    process.stdout.write("  Run ID".padEnd(28) + " Date".padEnd(26) + " Pass Rate".padEnd(12) + " Duration".padEnd(12) + " Tokens" + EOL)
    process.stdout.write("  " + "-".repeat(92) + EOL)

    for (const r of filtered.reverse()) {
      const date = new Date(r.timestamp).toISOString().slice(0, 19).replace("T", " ")
      process.stdout.write(
        "  " + r.runId.padEnd(26) +
        " " + date.padEnd(24) +
        " " + (r.passRate * 100).toFixed(1).padStart(7) + "%" +
        " " + r.durationMs.toString().padStart(8) + "ms" +
        " " + r.totalTokensUsed.toString().padStart(8) + EOL,
      )
    }
  }),
})

// Note: use `svc.runSuite(target)` for simulated eval runs (no real LLM needed).
// For real-agent eval runs against an LLM, implement a dedicated runner.
