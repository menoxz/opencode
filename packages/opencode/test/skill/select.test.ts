import { describe, expect, it } from "bun:test"
import { SkillSelect } from "@/skill/select"

const catalogue = [
  { name: "arxiv", description: "Search arXiv papers" },
  { name: "docx", description: "Create Word documents" },
] as const

describe("SkillSelect.interpret", () => {
  it("keeps catalogue names in catalogue order", () => {
    expect(SkillSelect.interpret('["docx","arxiv"]', catalogue)).toEqual(["docx", "arxiv"])
  })

  it("drops unknown names and duplicates", () => {
    expect(SkillSelect.interpret('["arxiv","ghost","arxiv"]', catalogue)).toEqual(["arxiv"])
  })

  it("tolerates surrounding prose and a code fence", () => {
    expect(SkillSelect.interpret('Here you go:\n```json\n["arxiv"]\n```\nDone', catalogue)).toEqual(["arxiv"])
  })

  it("returns [] for a non-JSON answer or an explicit empty selection", () => {
    expect(SkillSelect.interpret("none of them apply", catalogue)).toEqual([])
    expect(SkillSelect.interpret("[]", catalogue)).toEqual([])
  })
})
