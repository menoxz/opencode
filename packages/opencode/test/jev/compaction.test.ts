import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { ConfigJev } from "@/config/jev"
import { JevCompaction } from "@/jev/compaction"
import { JevSchema } from "@/jev/schema"

const yes = (probability: number): JevSchema.Answer => ({ type: "noul", noul: probability })

const digest = [
  "- Edited C:\\jeanluc\\opencode-fork\\packages\\opencode\\src\\session\\compaction.ts",
  "- Ran `bun typecheck` -> exit code 1",
  "- session ses_f45651d3dffeMl0luDq7Y4nZ70 has 349 tool calls",
  "error: EPERM uv_spawn ripgrep",
].join("\n")

describe("JevCompaction.candidatesFromText", () => {
  test("extracts paths, identifiers, commands and error lines", () => {
    const candidates = JevCompaction.candidatesFromText(digest)
    const texts = candidates.map((candidate) => candidate.text)
    expect(texts.some((text) => text.includes("compaction.ts"))).toBe(true)
    expect(texts.some((text) => text.includes("ses_f45651d3dffeMl0luDq7Y4nZ70"))).toBe(true)
    expect(texts.some((text) => text.includes("exit code 1"))).toBe(true)
    expect(texts.some((text) => text.includes("EPERM"))).toBe(true)
  })

  test("assigns stable sequential ids and dedupes case-insensitively", () => {
    const candidates = JevCompaction.candidatesFromText(`${digest}\n- ran \`BUN TYPECHECK\` -> EXIT CODE 1`)
    expect(candidates.map((candidate) => candidate.id)).toEqual(candidates.map((_, index) => `c${index + 1}`))
    expect(candidates.filter((candidate) => candidate.text.toLowerCase().includes("exit code 1")).length).toBe(1)
  })

  test("honours the max bound", () => {
    expect(JevCompaction.candidatesFromText(digest, 2)).toHaveLength(2)
  })

  test("returns nothing for a digest without anchors", () => {
    expect(JevCompaction.candidatesFromText("the model answered quickly")).toEqual([])
  })
})

describe("JevCompaction.clampState", () => {
  test("joins with a blank line and truncates to the budget", () => {
    expect(JevCompaction.clampState(["abc", "def"], 5)).toBe("abc\n\n")
    expect(JevCompaction.clampState(["abc", "def"], 100)).toBe("abc\n\ndef")
  })
})

describe("JevCompaction question batches", () => {
  const candidates = JevCompaction.candidatesFromText(digest, 2)

  test("keys one noul question per candidate and quotes the anchor", () => {
    const questions = JevCompaction.checklistQuestions(candidates)
    expect(Object.keys(questions)).toEqual(candidates.map((candidate) => candidate.id))
    for (const candidate of candidates) {
      const question = questions[candidate.id] as { type: string; instructions: string }
      expect(question.type).toBe("noul")
      expect(question.instructions).toContain(candidate.text)
    }
  })

  test("audits the same keys with a presence question", () => {
    const questions = JevCompaction.auditQuestions(candidates)
    expect(Object.keys(questions)).toEqual(candidates.map((candidate) => candidate.id))
    expect((questions[candidates[0]!.id] as { instructions: string }).instructions).toContain(candidates[0]!.text)
  })

  test("batches stay within the question bound", () => {
    expect(Object.keys(JevCompaction.checklistQuestions(JevCompaction.candidatesFromText(digest))).length).toBeLessThanOrEqual(
      JevCompaction.MAX_QUESTIONS,
    )
  })
})

describe("JevCompaction.renderChecklist", () => {
  const candidates = JevCompaction.candidatesFromText(digest, 2)

  test("keeps only the anchors Jev affirmed", () => {
    const checklist = JevCompaction.renderChecklist({
      candidates,
      answers: { [candidates[0]!.id]: yes(0.9), [candidates[1]!.id]: yes(0.2) },
    })
    expect(checklist).toContain(candidates[0]!.text)
    expect(checklist).not.toContain(candidates[1]!.text)
  })

  test("is undefined when nothing is load-bearing", () => {
    expect(
      JevCompaction.renderChecklist({ candidates, answers: { [candidates[0]!.id]: yes(0.1) } }),
    ).toBeUndefined()
  })

  test("is undefined when Jev returned no usable answer (fail-open)", () => {
    expect(JevCompaction.renderChecklist({ candidates, answers: {} })).toBeUndefined()
  })

  test("honours a custom threshold", () => {
    const answers = { [candidates[0]!.id]: yes(0.4) }
    expect(JevCompaction.renderChecklist({ candidates, answers, threshold: 0.5 })).toBeUndefined()
    expect(JevCompaction.renderChecklist({ candidates, answers, threshold: 0.3 })).toContain(candidates[0]!.text)
  })
})

describe("JevCompaction.missingFromSummary", () => {
  const candidates = JevCompaction.candidatesFromText(digest, 2)

  test("returns refuted anchors only", () => {
    const missing = JevCompaction.missingFromSummary({
      candidates,
      answers: { [candidates[0]!.id]: yes(0.05), [candidates[1]!.id]: yes(0.95) },
    })
    expect(missing.map((candidate) => candidate.id)).toEqual([candidates[0]!.id])
  })

  test("treats an absent answer as unknown, not missing (fail-open)", () => {
    expect(JevCompaction.missingFromSummary({ candidates, answers: {} })).toEqual([])
  })
})

describe("JevCompaction.repairPrompt", () => {
  test("lists every missing anchor and closes with the rewrite instruction", () => {
    const missing = JevCompaction.candidatesFromText(digest, 2)
    const prompt = JevCompaction.repairPrompt(missing)
    for (const candidate of missing) expect(prompt).toContain(candidate.text)
    expect(prompt).toContain("Rewrite the summary")
  })
})

describe("jev.compaction config guard", () => {
  const decode = Schema.decodeUnknownOption(ConfigJev.Info)

  test("accepts the documented shape", () => {
    const decoded = decode({ compaction: { enabled: true, max_questions: 4, threshold: 0.6, repair: false } })
    expect(Option.isSome(decoded)).toBe(true)
    expect(Option.getOrThrow(decoded).compaction).toEqual({
      enabled: true,
      max_questions: 4,
      threshold: 0.6,
      repair: false,
    })
  })

  test("accepts an empty compaction block so defaults apply", () => {
    expect(Option.isSome(decode({ compaction: {} }))).toBe(true)
  })

  test("rejects a wrongly typed value instead of silently ignoring it", () => {
    expect(Option.isNone(decode({ compaction: { enabled: "yes" } }))).toBe(true)
    expect(Option.isNone(decode({ compaction: { max_questions: "many" } }))).toBe(true)
  })

  test("keeps the pre-existing guard block valid", () => {
    expect(Option.isSome(decode({ guard: { enabled: true, threshold: 0.5 } }))).toBe(true)
  })
})
