import { EOL } from "os"
import { Effect } from "effect"
import { Skill } from "@/skill"
import { Memory } from "@/memory"
import { effectCmd, fail } from "../effect-cmd"

/**
 * Skill ingest — index SKILL.md skills into the native Memory store.
 *
 * Iterates discovered skills (Skill.all), chunks each skill body by H2 section,
 * embeds + stores each chunk as memory_type="skill" with source="<location>#<idx>".
 * Idempotent: a skill whose location already has stored chunks is skipped, so a
 * re-run stores 0 new. Retrievable via Memory.retrieve. Reversible: remove via
 * memory deletion by source; nothing auto-deploys.
 */

const MEMORY_TYPE = "skill"
const MAX_CHUNK_CHARS = 4000

/** Split a skill body into chunks by top-level H2 headings; cap chunk size. */
export function chunkSkillBody(body: string): string[] {
  const trimmed = body.trim()
  if (!trimmed) return []
  // Split on H2 boundaries, keeping the heading with its section.
  const parts = trimmed
    .split(/\n(?=##\s)/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const sections = parts.length > 0 ? parts : [trimmed]
  const chunks: string[] = []
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_CHARS) {
      chunks.push(section)
      continue
    }
    for (let i = 0; i < section.length; i += MAX_CHUNK_CHARS) {
      chunks.push(section.slice(i, i + MAX_CHUNK_CHARS))
    }
  }
  return chunks
}

const program = Effect.fn("Cli.skill-ingest.run")(function* (dryRun: boolean) {
  const skill = yield* Skill.Service
  const memory = yield* Memory.Service
  const skills = yield* skill.all()

  // Build the set of already-indexed locations (dedup key) from skill memories.
  const indexed = new Set<string>()
  let page = 1
  for (;;) {
    const { entries, total } = yield* memory.list({ memoryType: MEMORY_TYPE, page, pageSize: 200 })
    for (const e of entries) {
      const loc = e.source.includes("#") ? e.source.slice(0, e.source.lastIndexOf("#")) : e.source
      indexed.add(loc)
    }
    if (page * 200 >= total || entries.length === 0) break
    page++
  }

  let stored = 0
  let skipped = 0
  for (const s of skills) {
    if (indexed.has(s.location)) {
      skipped++
      continue
    }
    const chunks = chunkSkillBody(s.content)
    if (chunks.length === 0) {
      skipped++
      continue
    }
    for (let i = 0; i < chunks.length; i++) {
      const header = `Skill: ${s.name}${s.description ? ` — ${s.description}` : ""}`
      const content = `${header}\n\n${chunks[i]}`
      if (dryRun) {
        stored++
        continue
      }
      yield* memory.store({
        content,
        memoryType: MEMORY_TYPE,
        tags: ["skill", s.name],
        importance: 0.6,
        projectId: "default",
        source: `${s.location}#${i}`,
        confidence: 1.0,
      })
      stored++
    }
  }

  const verb = dryRun ? "would store" : "stored"
  process.stdout.write(
    `skill-ingest: ${verb} ${stored} chunk(s); skipped ${skipped} skill(s) (${skills.length} total)` + EOL,
  )
})

export const SkillIngestCommand = effectCmd({
  command: "skill-ingest",
  describe: "index local skills (SKILL.md) into the native memory store (idempotent)",
  builder: (yargs) =>
    yargs.option("dry-run", {
      type: "boolean",
      default: false,
      describe: "list what would be indexed without storing",
    }),
  handler: Effect.fn("Cli.skill-ingest")(function* (args) {
    yield* program(Boolean(args["dry-run"])).pipe(
      Effect.provide(Memory.defaultLayer),
      Effect.catch((e) => fail(`skill-ingest failed: ${String((e as { message?: string }).message ?? e)}`)),
    )
  }),
})
