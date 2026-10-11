/**
 * H4 §7.2 — revert stays correct under a single capture.
 *
 * The fix keeps one end-of-step hash as the next step's base. The risk is that a
 * wrong base makes `snapshot.patch()` under/over-include files, so `revert()`
 * restores the wrong tree. This test pins the byte-exact contract on the file
 * that was actually mutated: track -> mutate -> patch -> revert restores the
 * original bytes.
 */
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Snapshot } from "../../src/snapshot"
import * as Log from "@opencode-ai/core/util/log"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

void Log.init({ print: false })

const it = testEffect(Layer.mergeAll(Snapshot.defaultLayer, AppFileSystem.defaultLayer))

const fwd = (value: string) => value.replaceAll("\\", "/")

it.instance(
  "revert after a single capture restores the original bytes",
  () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const snapshot = yield* Snapshot.Service
      const target = path.join(tmp.directory, "revert-me.txt")
      const original = "ORIGINAL-CONTENT-42\nsecond line\n"
      const mutated = "MUTATED-CONTENT-99\nsecond line changed\n"

      yield* AppFileSystem.Service.use((fs) => fs.writeWithDirs(target, original))

      // One capture, taken before the mutation.
      const before = yield* snapshot.track()
      expect(before).toBeTruthy()

      yield* AppFileSystem.Service.use((fs) => fs.writeWithDirs(target, mutated))

      const patch = yield* snapshot.patch(before!)
      expect(patch.files.map(fwd)).toContain(fwd(target))

      yield* snapshot.revert([patch])

      const after = yield* AppFileSystem.Service.use((fs) => fs.readFileString(target))
      expect(after).toBe(original)
      expect(after).not.toBe(mutated)
    }),
  { git: true },
)
