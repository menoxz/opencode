import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import { Global } from "@opencode-ai/core/global"
import type { PatternReport, RecurringPattern } from "@/memory/patterns"

export const MIN_CANDIDATE_FREQUENCY = 3
export const MIN_CANDIDATE_CONFIDENCE = 0.6
export const MAX_CANDIDATES = 5

export function learningArtifactDir() {
  return process.env.OPENCODE_LEARNING_ARTIFACT_DIR ?? path.join(Global.Path.state, "pattern-detection")
}

function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, content, "utf8")
  fs.renameSync(temporary, file)
}

function stableKey(pattern: RecurringPattern) {
  const identity = `${pattern.description.replace(/\s*\(\d+ occurrences\)$/, "").toLowerCase()}|${[...pattern.tags].sort().join("|")}`
  return createHash("sha256").update(identity).digest("hex").slice(0, 16)
}

function candidateMarkdown(pattern: RecurringPattern, key: string) {
  return `# Skill candidate: ${key}\n\n## Method\n${pattern.description}\n\n## When\n${pattern.tags.map((tag) => `- ${tag}`).join("\n") || "- Pattern-based detection"}\n\n## Evidence\n- Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n- Occurrences: ${pattern.frequency}\n- First seen: ${new Date(pattern.firstSeen).toISOString()}\n- Last seen: ${new Date(pattern.lastSeen).toISOString()}\n\n> Candidate only. Promote manually to a reviewed SKILL.md.\n`
}

export interface PersistedLearningArtifacts {
  reportFile: string
  candidatesCreated: number
  candidatesUpdated: number
}

export function persistLearningArtifacts(report: PatternReport): PersistedLearningArtifacts {
  const root = learningArtifactDir()
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  const stamp = new Date(report.generatedAt).toISOString().replace(/[:.]/g, "-")
  const reportFile = path.join(root, "reports", `${stamp}.json`)
  atomicWrite(reportFile, serialized)
  atomicWrite(path.join(root, "latest.json"), serialized)

  let candidatesCreated = 0
  let candidatesUpdated = 0
  const eligible = report.recurringPatterns
    .filter((pattern) => pattern.frequency >= MIN_CANDIDATE_FREQUENCY && pattern.confidence >= MIN_CANDIDATE_CONFIDENCE)
    .slice(0, MAX_CANDIDATES)

  for (const pattern of eligible) {
    const key = stableKey(pattern)
    const dir = path.join(root, "candidates", key)
    const candidateFile = path.join(dir, "CANDIDATE.md")
    const metadataFile = path.join(dir, "metadata.json")
    const changelogFile = path.join(dir, "CHANGELOG.md")
    const content = candidateMarkdown(pattern, key)
    const metadata = `${JSON.stringify({ key, sourcePatternId: pattern.id, frequency: pattern.frequency, confidence: pattern.confidence, reportGeneratedAt: report.generatedAt }, null, 2)}\n`
    const existed = fs.existsSync(candidateFile)
    const contentChanged = !existed || fs.readFileSync(candidateFile, "utf8") !== content
    const previousMetadata = fs.existsSync(metadataFile)
      ? (JSON.parse(fs.readFileSync(metadataFile, "utf8")) as { frequency?: number; confidence?: number })
      : undefined
    const metricsChanged = !previousMetadata || previousMetadata.frequency !== pattern.frequency || previousMetadata.confidence !== pattern.confidence
    if (!contentChanged && !metricsChanged) continue
    atomicWrite(candidateFile, content)
    atomicWrite(metadataFile, metadata)
    const action = existed ? "Updated" : "Created"
    const previous = fs.existsSync(changelogFile) ? fs.readFileSync(changelogFile, "utf8") : "# Changelog\n"
    atomicWrite(changelogFile, `${previous.trimEnd()}\n\n- ${new Date(report.generatedAt).toISOString()}: ${action} candidate from pattern report.\n`)
    if (existed) candidatesUpdated++
    else candidatesCreated++
  }

  return { reportFile, candidatesCreated, candidatesUpdated }
}
