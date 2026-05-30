/**
 * Sandbox isolation for eval scenarios.
 * Creates temporary directories with automatic cleanup.
 *
 * @module eval/sandbox
 */

import { Effect } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import os from "node:os"
import type { ScenarioResult } from "./scenario"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for sandbox creation. */
export interface SandboxOptions {
  /**
   * Explicit sandbox directory path.
   * If omitted, a temp directory is created via fs.mkdtempSync.
   */
  directory?: string

  /**
   * Whether to clean up the sandbox directory after completion.
   * Default: true
   */
  cleanup?: boolean
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

/**
 * Create a sandboxed execution environment.
 *
 * Creates a temporary directory (or uses the one provided in opts.directory),
 * saves and changes process.cwd() to the sandbox dir, runs the provided effect,
 * then restores the original cwd and optionally cleans up the sandbox directory.
 *
 * @param effect - The effect to run inside the sandbox, receives the sandbox dir path
 * @param opts - Sandbox options
 */
export function createSandbox(
  effect: (dir: string) => Effect.Effect<ScenarioResult>,
  opts?: SandboxOptions,
): Effect.Effect<ScenarioResult> {
  // Effect.scoped provides the Scope service needed by Effect.addFinalizer
  return Effect.scoped(
    Effect.gen(function* () {
      const cleanup = opts?.cleanup ?? true
      const tmpDir = opts?.directory ?? fs.mkdtempSync(path.join(os.tmpdir(), "opencode-eval-"))
      const dir = fs.realpathSync(tmpDir)
      const originalCwd = process.cwd()

      // Change to sandbox directory before running the effect
      process.chdir(dir)

      // Register cleanup that runs on success or error via Effect's finalizer
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.chdir(originalCwd)
          if (cleanup) {
            fs.rmSync(dir, { recursive: true, force: true })
          }
        }),
      )

      return yield* effect(dir)
    }),
  )
}

export * as Sandbox from "./sandbox"
