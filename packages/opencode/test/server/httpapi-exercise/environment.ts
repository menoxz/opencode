import { Flag } from "@opencode-ai/core/flag/flag"
import { Effect } from "effect"
import { mkdirSync } from "node:fs"
import path from "path"

const preserveExerciseGlobalRoot = !!process.env.OPENCODE_HTTPAPI_EXERCISE_GLOBAL
export const exerciseGlobalRoot =
  process.env.OPENCODE_HTTPAPI_EXERCISE_GLOBAL ??
  path.join(process.env.TMPDIR ?? "/tmp", `opencode-httpapi-global-${process.pid}`)
process.env.XDG_DATA_HOME = path.join(exerciseGlobalRoot, "data")
process.env.XDG_CONFIG_HOME = path.join(exerciseGlobalRoot, "config")
process.env.XDG_STATE_HOME = path.join(exerciseGlobalRoot, "state")
process.env.XDG_CACHE_HOME = path.join(exerciseGlobalRoot, "cache")
process.env.OPENCODE_DISABLE_SHARE = "true"

// The fork stores global data/config under its own app directory (`opencodev2`,
// packages/core/src/global.ts) rather than upstream's `opencode`. Resolve the
// real directories from Global so the auth/config scenarios read and write the
// exact same files the services use.
const { Global } = await import("@opencode-ai/core/global")
export const exerciseConfigDirectory = Global.Path.config
export const exerciseDataDirectory = Global.Path.data

// Ensure the global data/config directories exist up front. The auth scenarios
// read/write auth.json under the data directory, and the effect mode does not
// start the server first (unlike coverage/auth modes), so without this the seed
// or the post-call check hits ENOENT.
mkdirSync(exerciseDataDirectory, { recursive: true })
mkdirSync(exerciseConfigDirectory, { recursive: true })

const preserveExerciseDatabase = !!process.env.OPENCODE_HTTPAPI_EXERCISE_DB
export const exerciseDatabasePath =
  process.env.OPENCODE_HTTPAPI_EXERCISE_DB ??
  path.join(process.env.TMPDIR ?? "/tmp", `opencode-httpapi-exercise-${process.pid}.db`)
process.env.OPENCODE_DB = exerciseDatabasePath
Flag.OPENCODE_DB = exerciseDatabasePath

export const original = {
  OPENCODE_SERVER_PASSWORD: Flag.OPENCODE_SERVER_PASSWORD,
  OPENCODE_SERVER_USERNAME: Flag.OPENCODE_SERVER_USERNAME,
}

export const cleanupExercisePaths = Effect.promise(async () => {
  const fs = await import("fs/promises")
  if (!preserveExerciseDatabase) {
    await Promise.all(
      [exerciseDatabasePath, `${exerciseDatabasePath}-wal`, `${exerciseDatabasePath}-shm`].map((file) =>
        fs.rm(file, { force: true }).catch(() => undefined),
      ),
    )
  }
  if (!preserveExerciseGlobalRoot)
    await fs.rm(exerciseGlobalRoot, { recursive: true, force: true }).catch(() => undefined)
})
