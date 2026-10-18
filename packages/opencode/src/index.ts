import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import * as Log from "@opencode-ai/core/util/log"
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { NamedError } from "@opencode-ai/core/util/error"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { WatchCommand } from "./cli/cmd/watch"
import { DaemonCommand } from "./cli/cmd/daemon"
import { Filesystem } from "@/util/filesystem"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { GithubCommand } from "./cli/cmd/github"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/tui/attach"
import { TuiThreadCommand } from "./cli/cmd/tui/thread"
import { AcpCommand } from "./cli/cmd/acp"
import { EOL } from "os"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import { EvalCommand } from "./cli/cmd/eval"
import { SelfImproveCommand } from "./cli/cmd/self-improve"
import { SkillIngestCommand } from "./cli/cmd/skill-ingest"
import { TasksCommand } from "./cli/cmd/tasks"
import { DashboardCommand } from "./cli/cmd/dashboard"
import { MemoryCommand } from "./cli/cmd/memory"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { JsonMigration } from "@/storage/json-migration"
import { Database } from "@/storage/db"
import { Migration } from "./cli/migrate"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { PluginsCommand } from "./cli/cmd/plugins"
import { Heap } from "./cli/heap"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { ensureProcessMetadata } from "@opencode-ai/core/util/opencode-process"
import { isRecord } from "@/util/record"
import { loadExperimentalEnv } from "@/flag/experimental-env"
import { CliDefaultCommand } from "./cli/default-command"

const processMetadata = ensureProcessMetadata("main")

// Declarative OPENCODE_EXPERIMENTAL_* defaults from <config>/experimental.env;
// must run before any RuntimeFlags layer reads process.env.
loadExperimentalEnv()

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: errorMessage(e),
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: errorMessage(e),
  })
})

const args = hideBin(process.argv)

/**
 * Sans commande ni positional — `opencodev2` seul, ou seulement avec les options du serveur
 * (`--port`, `--hostname`, `--print-logs`…) — `opencodev2` démarre **le serveur**, puis ouvre **le
 * TUI attaché à lui** : c'est le serveur qui recharge à chaud ce qui vit — skills, agents, plugins,
 * instructions — et comme il vit dans son propre processus, il garde ses veilleurs armés pendant
 * que la TUI tourne, et survit à sa fermeture.
 *
 * **Sans terminal** (pipe, script, CI) une TUI ne peut pas s'afficher : le CLI sert en tête-à-tête,
 * comme avant. Le TTY est une **entrée** de `resolveDefaultMode`, pour que la règle reste pure.
 *
 * La décision est **pure et testée** (`cli/default-command.ts`) : la version précédente cherchait
 * « un jeton qui ne commence pas par un tiret », ce qui compte la **valeur** d'une option
 * (`opencodev2 --port 4099`) comme un nom de commande et retombait sur le TUI.
 */
const defaultMode = CliDefaultCommand.resolveDefaultMode(args, process.stdin.isTTY === true)
if (defaultMode === "serve") args.unshift("serve")
if (defaultMode === "local") {
  const { ensureServer } = await import("./cli/cmd/tui/attach")
  const url = CliDefaultCommand.localServerUrl(args)
  await ensureServer(url, undefined, CliDefaultCommand.listenerArgs(args))
  // La commande d'attache ne connaît pas les options d'écoute — et le CLI est en `strict()`. Elles
  // ont déjà servi à engendrer le serveur : on les retire de la ligne avant de l'attacher.
  args.splice(0, args.length, ...CliDefaultCommand.attachArgs(args))
  args.unshift("attach", url)
}

/**
 * Dans un **arbre de travail** (mode source), le serveur se relance à chaque modification de ses
 * propres sources : c'est le « hot reload de tout le harnais ». Un binaire installé n'a pas de
 * sources à surveiller, donc rien n'est relancé — d'où la condition sur `isLocal()`.
 *
 * L'enfant reprend **l'invocation du parent telle quelle** (mêmes arguments, mêmes options de
 * runtime, même dossier) : c'est ce qui garantit qu'il se résout comme lui. Rejouer les options avec
 * un autre dossier a été mesuré faux le 2026-10-17 — `--conditions=browser` depuis la racine ne
 * résolvait plus `react` (importé par le TUI), et le serveur ne démarrait pas.
 *
 * Conséquence à connaître : `bun --watch` ne surveille que les fichiers **sous son dossier courant**.
 * Lancé depuis `packages/opencode`, il ignore les paquets voisins (`packages/llm`, `packages/core`) ;
 * lancé depuis la racine du dépôt, il les couvre tous — et la CLI s'y résout (mesuré).
 *
 * La garde est un **marqueur d'environnement**, et non la présence de `--watch` dans `execArgv`
 * (dont la forme dépend de Bun) : sans elle, l'enfant se relancerait lui-même sans fin.
 */
if (Installation.isLocal() && !process.env.OPENCODE_WATCH) {
  const { spawn } = await import("node:child_process")
  const child = spawn(process.execPath, ["--watch", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, OPENCODE_WATCH: "1" },
  })
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal))
  }
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
  await new Promise(() => {})
}

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencodev2 ") && !text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text)
    return
  }
  process.stderr.write(out)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("opencodev2")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }

    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isLocal(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isLocal()) return "DEBUG"
        return "INFO"
      })(),
    })

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)

    Log.Default.info("opencode", {
      version: InstallationVersion,
      args: process.argv.slice(2),
      process_role: processMetadata.processRole,
      run_id: processMetadata.runID,
    })

    // First-run migration wizard (opencodev2): import upstream opencode data on
    // first launch so the original installation can coexist untouched.
    await Migration.maybeRunMigrationWizard(process.argv.slice(2))

    const marker = path.join(Global.Path.data, "opencode.db")
    if (!(await Filesystem.exists(marker))) {
      const tty = process.stderr.isTTY
      process.stderr.write("Performing one time database migration, may take a few minutes..." + EOL)
      const width = 36
      const orange = "\x1b[38;5;214m"
      const muted = "\x1b[0;2m"
      const reset = "\x1b[0m"
      let last = -1
      if (tty) process.stderr.write("\x1b[?25l")
      try {
        await JsonMigration.run(drizzle({ client: Database.Client().$client }), {
          progress: (event) => {
            const percent = Math.floor((event.current / event.total) * 100)
            if (percent === last && event.current !== event.total) return
            last = percent
            if (tty) {
              const fill = Math.round((percent / 100) * width)
              const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
              process.stderr.write(
                `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,
              )
              if (event.current === event.total) process.stderr.write("\n")
            } else {
              process.stderr.write(`sqlite-migration:${percent}${EOL}`)
            }
          },
        })
      } finally {
        if (tty) process.stderr.write("\x1b[?25h")
        else {
          process.stderr.write(`sqlite-migration:done${EOL}`)
        }
      }
      process.stderr.write("Database migration complete." + EOL)
    }
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ConsoleCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(PluginsCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(GithubCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(DbCommand)
  .command(EvalCommand)
  .command(WatchCommand)
  .command(DaemonCommand)
  .command(TasksCommand)
  .command(DashboardCommand)
  .command(SelfImproveCommand)
  .command(SkillIngestCommand)
  .command(MemoryCommand)
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  let data: Record<string, any> = {}
  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack,
    })
  }

  if (e instanceof NamedError) {
    const obj = e.toObject()
    if (isRecord(obj.data)) {
      for (const [key, value] of Object.entries(obj.data)) {
        if (key === "name" || key === "stack" || key === "cause") continue
        data[key] = value
      }
    }
  }

  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind,
    })
  }
  Log.Default.error("fatal", data)
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
