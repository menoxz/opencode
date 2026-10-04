import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { JevSkills } from "@/jev/skills"
import { JevTools } from "@/jev/tools"
import { testEffect } from "../lib/effect"

/**
 * Live integration against the Command Code GOAT Provider API — the long-term
 * Jev provider. It runs only when COMMAND_CODE_API_KEY is present, so CI and
 * keyless installs skip it while a developer can prove the real decision.
 *
 *     COMMAND_CODE_API_KEY=<goat key> bun test test/jev/live.test.ts
 */
const keyed = process.env.COMMAND_CODE_API_KEY ? describe : describe.skip
const it = testEffect(Layer.mergeAll(FetchHttpClient.layer))
const settings = { provider: "command-code" as const }

keyed("jev live against Command Code GOAT", () => {
  it.instance("selects the BPMN skill for an SRS cartography request", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const chosen = yield* JevSkills.select(http, settings, {
        prompt: "Je veux créer la cartographie BPMN d'un service administratif à partir du SRS fourni.",
        skills: [
          {
            name: "bpmn-cartography-from-srs",
            description: "Créer la cartographie BPMN cible d'un service à partir d'une fiche de besoin ou d'un SRS.",
          },
          { name: "songsee", description: "Visualise a song or audio signal: spectrogram, loudness, frequency bands." },
        ],
      })
      expect(chosen).toBeDefined()
      expect(chosen).toContain("bpmn-cartography-from-srs")
    }),
  )

  it.instance("keeps the shell tool for a build-and-test request", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const chosen = yield* JevTools.select(http, settings, {
        query: "build and run the project test suite",
        tools: [
          { id: "bash", description: "Run a shell command" },
          { id: "songsee", description: "Visualise a song or audio signal" },
        ],
      })
      expect(chosen).toBeDefined()
      expect(chosen).toContain("bash")
    }),
  )
})
