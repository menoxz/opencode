// First-run migration wizard for the opencode fork.
//
// The fork (command `opencodev2`) keeps its own data/config directories so it
// can coexist with the upstream `opencode` install. On the first interactive
// launch, when upstream data is detected (config, credentials, sessions), ask
// the user whether they want to import it into the fork's own directories.
// The upstream directories are never modified.
//
// Non-interactive environments (CI, scripts) can force the behaviour with
// OPENCODEV2_MIGRATE=copy|skip.

import { Global } from "@opencode-ai/core/global"
import * as prompts from "@clack/prompts"
import fs from "fs/promises"
import path from "path"

const ORIGINAL_APP = "opencode"

// Headless commands for which the wizard must never prompt.
const HEADLESS_COMMANDS = new Set([
  "run",
  "serve",
  "web",
  "attach",
  "acp",
  "upgrade",
  "uninstall",
  "db",
  "eval",
  "stats",
  "models",
  "session",
  "export",
  "import",
  "mcp",
  "agent",
  "providers",
  "github",
  "pr",
  "watch",
  "daemon",
  "tasks",
  "dashboard",
  "memory",
  "self-improve",
  "skill-ingest",
  "completion",
  "debug",
  "generate",
  "help",
])

export const MIGRATE_ENV = "OPENCODEV2_MIGRATE"
export const MARKER_FILE = ".migrate-state"

export interface MigrationDirs {
  data: string
  config: string
}

export function originalDirs(own: MigrationDirs): MigrationDirs {
  return {
    data: path.join(path.dirname(own.data), ORIGINAL_APP),
    config: path.join(path.dirname(own.config), ORIGINAL_APP),
  }
}

export function markerPath(data: string): string {
  return path.join(data, MARKER_FILE)
}

export interface MigrationState {
  originalData: string
  originalConfig: string
  hasOriginalData: boolean // upstream opencode.db or auth.json exists
  hasForkData: boolean // the fork already has its own opencode.db
  decided: boolean // a marker file exists (migrated or skipped)
}

export async function computeMigrationState(own: MigrationDirs): Promise<MigrationState> {
  const orig = originalDirs(own)
  const hasOriginalData = (await exists(path.join(orig.data, "opencode.db"))) || (await exists(path.join(orig.data, "auth.json")))
  const hasForkData = await exists(path.join(own.data, "opencode.db"))
  const decided = await exists(markerPath(own.data))
  return { originalData: orig.data, originalConfig: orig.config, hasOriginalData, hasForkData, decided }
}

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY || process.stderr.isTTY)
}

/** True when the launched command is headless or a pure info flag — never prompt. */
export function wizardBlockedByArgs(args: string[]): boolean {
  if (args.includes("-h") || args.includes("--help") || args.includes("-v") || args.includes("--version")) return true
  const first = args.find((a) => !a.startsWith("-"))
  return first !== undefined && HEADLESS_COMMANDS.has(first)
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.cp(src, dest, { recursive: true, force: true, errorOnExist: false })
}

async function copyFileIfExists(src: string, dest: string): Promise<void> {
  if (!(await exists(src))) return
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

/** Copy the upstream data (config, credentials, sessions DB, legacy storage) into the fork dirs. */
export async function migrateOriginalData(own: MigrationDirs): Promise<string[]> {
  const orig = originalDirs(own)
  const copied: string[] = []

  if (await exists(orig.config)) {
    await copyDir(orig.config, own.config)
    copied.push(orig.config)
  }

  // Sessions DB + WAL/SHM so the copy stays consistent.
  for (const suffix of ["opencode.db", "opencode.db-wal", "opencode.db-shm"]) {
    await copyFileIfExists(path.join(orig.data, suffix), path.join(own.data, suffix))
  }
  await copyFileIfExists(path.join(orig.data, "auth.json"), path.join(own.data, "auth.json"))
  await copyDirIfExists(path.join(orig.data, "storage"), path.join(own.data, "storage"), copied)

  return copied
}

async function copyDirIfExists(src: string, dest: string, copied: string[]): Promise<void> {
  if (!(await exists(src))) return
  await copyDir(src, dest)
  copied.push(src)
}

export async function writeMarker(data: string, decision: "copy" | "skip"): Promise<void> {
  await fs.mkdir(data, { recursive: true })
  await fs.writeFile(
    markerPath(data),
    JSON.stringify({ decision, from: ORIGINAL_APP, at: new Date().toISOString() }, null, 2) + "\n",
  )
}

/** Run the wizard when appropriate. Called once from the CLI middleware. */
export async function maybeRunMigrationWizard(args: string[]): Promise<void> {
  if (wizardBlockedByArgs(args)) return

  const own: MigrationDirs = { data: Global.Path.data, config: Global.Path.config }
  const state = await computeMigrationState(own)
  if (!state.hasOriginalData || state.hasForkData || state.decided) return

  // Explicit env override works even in headless/CI environments.
  const env = process.env[MIGRATE_ENV]
  if (env === "copy") {
    await runMigration(own)
    return
  }
  if (env === "skip") {
    await writeMarker(own.data, "skip")
    return
  }

  if (!isInteractive()) return

  prompts.intro("opencodev2")
  const choice = await prompts.select({
    message:
      "Existing opencode data was detected. Import it into opencodev2? (config, API keys and session history)",
    options: [
      { value: "copy", label: "Import (recommended)", hint: "upstream data is left untouched" },
      { value: "later", label: "Later", hint: "ask again at the next launch" },
      { value: "skip", label: "Never", hint: "start with empty opencodev2 data" },
    ],
  })

  if (prompts.isCancel(choice) || choice === "later") return
  if (choice === "skip") {
    await writeMarker(own.data, "skip")
    prompts.log.info("Migration skipped — opencodev2 will start with fresh data.")
    return
  }
  await runMigration(own)
}

async function runMigration(own: MigrationDirs): Promise<void> {
  const orig = originalDirs(own)
  const interactive = isInteractive()
  const spinner = interactive ? prompts.spinner() : null

  const phase = (label: string) => {
    if (!spinner) return void process.stderr.write(`${label}…\n`)
    spinner.start(label)
  }
  const done = (label: string) => {
    if (!spinner) return void process.stderr.write(`${label}\n`)
    spinner.stop(label)
  }
  const report = (message: string) => {
    if (!interactive) return void process.stderr.write(`${message}\n`)
    prompts.log.success(message)
  }

  const copied: string[] = []

  if (await exists(orig.config)) {
    phase("Importing configuration")
    await copyDir(orig.config, own.config)
    copied.push(orig.config)
    done("Configuration imported")
  }

  phase("Importing credentials and session history")
  for (const suffix of ["opencode.db", "opencode.db-wal", "opencode.db-shm"]) {
    await copyFileIfExists(path.join(orig.data, suffix), path.join(own.data, suffix))
  }
  await copyFileIfExists(path.join(orig.data, "auth.json"), path.join(own.data, "auth.json"))
  await copyDirIfExists(path.join(orig.data, "storage"), path.join(own.data, "storage"), copied)
  done("Credentials and session history imported")

  await writeMarker(own.data, "copy")

  report(`Import complete — ${copied.length} item(s) copied from the original opencode installation.`)
  report(`Original data left in place: ${path.dirname(own.data)}${path.sep}opencode`)
}

export * as Migration from "./migrate"
