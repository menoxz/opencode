import { readdirSync, readFileSync } from "node:fs"
import * as path from "node:path"
import { describe, expect, test } from "bun:test"

/**
 * Windows regression guard.
 *
 * The daemon is spawned detached, so it has NO console. A console child (git,
 * bun, cmd, gh, opencode...) of a console-less process allocates a NEW visible
 * console window unless the spawn passes `windowsHide: true`
 * (CREATE_NO_WINDOW). When the daemon forgot it, the idle patrol opened and
 * closed a terminal window every few seconds and made the machine unusable.
 *
 * Every child_process spawn site of the daemon must therefore declare
 * `windowsHide: true` explicitly in its options object.
 */
const daemonDir = path.resolve(import.meta.dir, "../../src/daemon")

const SPAWN_CALL = /(?:^|[^\w.$])(?:execSync|execFileSync|spawnSync|execFile|spawn|exec|fork)\s*\(/g
const SPAWN_NAMES = /(?:execSync|execFileSync|spawnSync|execFile|spawn|exec|fork)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.includes(".test.")) return []
    return [full]
  })
}

/** Text between the `(` at `open` and its matching `)`, skipping string literals. */
function callText(source: string, open: number): string {
  let depth = 0
  let quote: string | undefined
  for (let i = open; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === "\\") i++
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === "`") quote = char
    else if (char === "(") depth++
    else if (char === ")" && --depth === 0) return source.slice(open + 1, i)
  }
  return source.slice(open + 1)
}

/** Line of every child_process call that does not hide its console window. */
function unguardedSpawns(file: string): number[] {
  const source = readFileSync(file, "utf-8")
  const line = (index: number) => source.slice(0, index).split("\n").length
  return [...source.matchAll(SPAWN_CALL)]
    .filter((match) => SPAWN_NAMES.test(match[0].trim().replace(/\($/, "").trim()))
    .filter((match) => !/windowsHide\s*:\s*true/.test(callText(source, match.index + match[0].length - 1)))
    .map((match) => line(match.index))
}

function spawnCount(file: string): number {
  const source = readFileSync(file, "utf-8")
  return [...source.matchAll(SPAWN_CALL)].filter((match) =>
    SPAWN_NAMES.test(match[0].trim().replace(/\($/, "").trim()),
  ).length
}

const files = sourceFiles(daemonDir)

describe("daemon console visibility", () => {
  test("every daemon spawn hides the console window", () => {
    const offenders = files.flatMap((file) =>
      unguardedSpawns(file).map((line) => `${path.relative(daemonDir, file).replace(/\\/g, "/")}:${line}`),
    )
    expect(offenders).toEqual([])
  })

  test("the guard actually inspects the daemon spawn sites", () => {
    const total = files.reduce((sum, file) => sum + spawnCount(file), 0)
    expect(total).toBeGreaterThanOrEqual(8)
  })
})
