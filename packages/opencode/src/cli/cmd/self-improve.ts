import { EOL } from "os"
import path from "path"
import fs from "fs"
import { Database } from "bun:sqlite"
import { cmd } from "./cmd"

/**
 * ParameterProfile as stored in the memory SQLite database.
 */
interface ParameterProfile {
  taskType: string
  modelId: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  samples: number
  avgSuccessRate: number
  avgTokensUsed: number
  avgToolCalls: number
  updatedAt: number
}

interface ImprovementTip {
  category: string
  title: string
  description: string
  expectedImpact: "high" | "medium" | "low"
  applicableTo: string[]
}

interface SelfImproveReport {
  totalSessionsAnalyzed: number
  avgSuccessRate: number
  totalProfiles: number
  recentUpdates: number
  tips: ImprovementTip[]
  topPerformingConfigs: { taskType: string; modelId: string; successRate: number; samples: number }[]
}

function getMemoryDbPath(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || ".", ".config")
  return path.join(configDir, "opencode", "memory.sqlite")
}

function loadProfiles(): ParameterProfile[] {
  const dbPath = getMemoryDbPath()
  if (!fs.existsSync(dbPath)) return []

  const sqlite = new Database(dbPath)
  try {
    const rows = sqlite
      .query(`SELECT content FROM memory WHERE tags LIKE '%adaptive-config%' ORDER BY updated_at DESC`)
      .all() as { content: string }[]

    const profiles: ParameterProfile[] = []
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.content) as ParameterProfile
        if (parsed.taskType && parsed.modelId) {
          profiles.push(parsed)
        }
      } catch {
        // skip unparseable entries
      }
    }
    return profiles
  } finally {
    sqlite.close()
  }
}

function computeReport(profiles: ParameterProfile[]): SelfImproveReport {
  if (profiles.length === 0) {
    return {
      totalSessionsAnalyzed: 0,
      avgSuccessRate: 0,
      totalProfiles: 0,
      recentUpdates: 0,
      tips: [],
      topPerformingConfigs: [],
    }
  }

  const totalSamples = profiles.reduce((s, p) => s + p.samples, 0)
  const avgSuccessRate =
    totalSamples > 0
      ? profiles.reduce((s, p) => s + p.avgSuccessRate * p.samples, 0) / totalSamples
      : 0

  const now = Date.now()
  const recentUpdates = profiles.filter((p) => now - p.updatedAt < 7 * 24 * 60 * 60 * 1000).length

  // Generate tips
  const tips: ImprovementTip[] = []
  const profilesByType = new Map<string, ParameterProfile[]>()
  for (const p of profiles) {
    const list = profilesByType.get(p.taskType) ?? []
    list.push(p)
    profilesByType.set(p.taskType, list)
  }

  for (const [taskType, typeProfiles] of profilesByType) {
    const avgRate =
      typeProfiles.reduce((s, p) => s + p.avgSuccessRate, 0) / typeProfiles.length
    if (avgRate < 0.5 && typeProfiles.length >= 3) {
      const best = typeProfiles.reduce((a, b) =>
        a.avgSuccessRate > b.avgSuccessRate ? a : b,
      )
      tips.push({
        category: "param-tuning",
        title: `Tune parameters for "${taskType}" tasks`,
        description: `Current avg success rate: ${(avgRate * 100).toFixed(0)}%. Best config: temp=${best.temperature ?? "default"}, topP=${best.topP ?? "default"} with ${(best.avgSuccessRate * 100).toFixed(0)}% success (${best.samples} samples)`,
        expectedImpact: "high",
        applicableTo: [taskType],
      })
    }
  }

  // Top performing configs
  const topPerforming = profiles
    .filter((p) => p.samples >= 3)
    .sort((a, b) => b.avgSuccessRate - a.avgSuccessRate)
    .slice(0, 10)
    .map((p) => ({
      taskType: p.taskType,
      modelId: p.modelId,
      successRate: p.avgSuccessRate,
      samples: p.samples,
    }))

  return {
    totalSessionsAnalyzed: totalSamples,
    avgSuccessRate,
    totalProfiles: profiles.length,
    recentUpdates,
    tips,
    topPerformingConfigs: topPerforming,
  }
}

export const SelfImproveCommand = cmd({
  command: "self-improve",
  describe: "self-improvement system — parameter optimization and insights",
  builder: (yargs) =>
    yargs.command(ReportCommand).demandCommand(),
  async handler() {},
})

const ReportCommand = cmd({
  command: "report",
  describe: "show self-improvement report with profiles, tips, and top configs",
  async handler() {
    const profiles = loadProfiles()
    const report = computeReport(profiles)

    process.stdout.write("Self-Improvement Report" + EOL)
    process.stdout.write("=".repeat(50) + EOL)
    process.stdout.write(`  Total sessions analyzed: ${report.totalSessionsAnalyzed}` + EOL)
    process.stdout.write(`  Average success rate:    ${(report.avgSuccessRate * 100).toFixed(1)}%` + EOL)
    process.stdout.write(`  Profiles tracked:        ${report.totalProfiles}` + EOL)
    process.stdout.write(`  Recent updates (7d):     ${report.recentUpdates}` + EOL)
    process.stdout.write("" + EOL)

    if (report.tips.length > 0) {
      process.stdout.write("Improvement Tips:" + EOL)
      process.stdout.write("-".repeat(50) + EOL)
      for (const tip of report.tips) {
        process.stdout.write(`  [${tip.expectedImpact}] ${tip.title}` + EOL)
        process.stdout.write(`     ${tip.description}` + EOL)
        process.stdout.write("" + EOL)
      }
    }

    if (report.topPerformingConfigs.length > 0) {
      process.stdout.write("Top Performing Configurations:" + EOL)
      process.stdout.write("-".repeat(50) + EOL)
      for (const cfg of report.topPerformingConfigs) {
        process.stdout.write(
          `  ${cfg.taskType.padEnd(20)} ${cfg.modelId.padEnd(20)} ${(cfg.successRate * 100).toFixed(1)}%  (${cfg.samples} samples)` +
            EOL,
        )
      }
      process.stdout.write("" + EOL)
    }
  },
})
