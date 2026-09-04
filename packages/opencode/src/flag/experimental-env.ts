import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"

// `OPENCODE_EXPERIMENTAL_*` flags are read from process.env by RuntimeFlags.
// Keeping them only in the OS user environment makes an agent profile (e.g. the
// lean agent's output budgets and advisories) invisible to anyone who copies the
// config directory. This loads `<config>/experimental.env` — a plain KEY=VALUE
// file — into process.env before anything reads the flags. Existing environment
// variables win, so the file is a declarative default, never an override.
export function loadExperimentalEnv(file = path.join(Global.Path.config, "experimental.env")) {
  let text: string
  try {
    text = fs.readFileSync(file, "utf8")
  } catch {
    return []
  }
  const applied: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    process.env[key] = line
      .slice(eq + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2")
    applied.push(key)
  }
  return applied
}
