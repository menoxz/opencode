import { styleText } from "node:util"
import { Effect, Option } from "effect"
import { effectCmd } from "@/cli/effect-cmd"
import { InstanceRef } from "@/effect/instance-ref"
import * as Memory from "@/memory"

const c = (color: Parameters<typeof styleText>[0], text: string): string =>
  styleText(color, text)

const separator = c("dim", "─".repeat(56))

export const MemoryCommand = effectCmd({
  command: "memory",
  describe: "reflect on the agent's memory: a mirror of what it learned",
  builder: (yargs) =>
    yargs
      .option("since", {
        describe: "time window: 1h, 24h, 7d, 30d",
        type: "string",
        default: "24h",
      })
      .option("top", {
        describe: "number of top items per category",
        type: "number",
        default: 5,
      })
      .option("json", {
        describe: "output raw JSON instead of human-readable report",
        type: "boolean",
        default: false,
      })
      .option("tags", {
        describe: "print only the tag cloud",
        type: "boolean",
        default: false,
      })
      .option("project", {
        describe: "filter to a single project id",
        type: "string",
      })
      .example("opencodev2 memory", "Show the 24h memory mirror")
      .example("opencodev2 memory --since 7d", "Show the last 7 days")
      .example("opencodev2 memory --tags", "Print only the tag cloud"),
  handler: Effect.fn("Cli.memory")(function* (args) {
    yield* InstanceRef
    const windowMs = parseWindow(args.since)
    const topK = Math.min(Math.max(Number(args.top) || 5, 1), 25)
    const projectFilter = args.project?.trim()

    const memory = yield* Effect.serviceOption(Memory.Service).pipe(
      Effect.map(Option.getOrUndefined),
    )
    if (!memory) {
      console.log(c("red", "✗ Memory service is not available"))
      return
    }

    const report = yield* memory.mirror({ sinceMs: windowMs, topK })

    if (args.json) {
      console.log(JSON.stringify(report, null, 2))
      return
    }

    if (args.tags) {
      if (report.topTags.length === 0) {
        console.log(c("dim", "No tags found."))
        return
      }
      for (const { tag, count } of report.topTags) {
        console.log(`${c("cyan", `#${tag}`)} ${c("dim", `×${count}`)}`)
      }
      return
    }

    const filtered = projectFilter
      ? {
          ...report,
          highlights: report.highlights.filter((h) => h.projectId === projectFilter),
          topProjects: report.topProjects.filter((p) => p.projectId === projectFilter),
        }
      : report

    const windowLabel = describeWindow(filtered.windowMs)
    console.log(``)
    console.log(`${c("bold", "🪞 Memory Mirror")}`)
    console.log(c("dim", `   A self-reflective digest over the last ${windowLabel}`))
    console.log(separator)

    console.log(
      `${c("bold", "Total memories:")} ${filtered.total.toLocaleString()}  ` +
        `${c("bold", "Created:")} ${c("cyan", filtered.createdInWindow.toLocaleString())}  ` +
        `${c("bold", "Touched:")} ${c("yellow", filtered.touchedInWindow.toLocaleString())}  ` +
        `${c("bold", "Confidence:")} ${formatConfidence(filtered.averageConfidence)}`,
    )
    console.log(`${c("bold", "State of mind:")} ${c("magenta", filtered.stateOfMind)}`)
    console.log(separator)

    const typeEntries = Object.entries(filtered.byType).sort((a, b) => b[1] - a[1])
    if (typeEntries.length > 0) {
      console.log(c("bold", "Memory composition:"))
      const maxType = Math.max(...typeEntries.map((t) => t[1]))
      for (const [type, count] of typeEntries) {
        const bar = "█".repeat(Math.max(1, Math.min(20, Math.round((count / maxType) * 20))))
        console.log(`  ${c("cyan", type.padEnd(14))} ${bar} ${count}`)
      }
      console.log(``)
    }

    if (filtered.topProjects.length > 0) {
      console.log(c("bold", "Top projects:"))
      for (const { projectId, count } of filtered.topProjects) {
        console.log(
          `  ${c("green", projectId)} ${c("dim", `— ${count.toLocaleString()} memory${count === 1 ? "" : "ies"}`)}`,
        )
      }
      console.log(``)
    }

    if (filtered.topTags.length > 0) {
      console.log(
        c("bold", "Tag cloud: ") +
          filtered.topTags.map(({ tag, count }) => `${c("cyan", `#${tag}`)}${c("dim", `×${count}`)}`).join(" "),
      )
      console.log(``)
    }

    if (filtered.highlights.length > 0) {
      console.log(c("bold", "Recent highlights:"))
      for (const h of filtered.highlights) {
        const age = h.ageHours === 0 ? "just now" : `${h.ageHours}h ago`
        const badge = h.importance >= 0.8 ? c("red", "★") : h.importance >= 0.5 ? c("yellow", "☆") : c("dim", "·")
        console.log(`  ${badge} ${c("italic", h.content)}`)
        console.log(
          `     ${c("dim", `${h.type} · ${h.projectId} · ${age} · importance ${Math.round(h.importance * 100)}%`)}`,
        )
      }
    } else {
      console.log(c("dim", "No highlights in this window. Try a wider --since value."))
    }

    console.log(separator)
  }),
})

function parseWindow(input: string | undefined): number {
  const value = input?.trim().toLowerCase() ?? "24h"
  const match = value.match(/^(\d+)\s*(h|d|m|s)?$/)
  if (!match) return 24 * 60 * 60 * 1000
  const n = Number(match[1])
  const unit = match[2] ?? "h"
  switch (unit) {
    case "s":
      return n * 1000
    case "m":
      return n * 60 * 1000
    case "h":
      return n * 60 * 60 * 1000
    case "d":
      return n * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

function describeWindow(ms: number): string {
  if (ms >= 24 * 60 * 60 * 1000) {
    const days = Math.round(ms / (24 * 60 * 60 * 1000))
    return days === 1 ? "24 hours" : `${days} days`
  }
  if (ms >= 60 * 60 * 1000) {
    return `${Math.round(ms / (60 * 60 * 1000))} hours`
  }
  return `${Math.round(ms / (60 * 1000))} minutes`
}

function formatConfidence(n: number): string {
  const pct = Math.round(n * 100)
  if (pct >= 90) return c("green", `${pct}%`)
  if (pct >= 70) return c("yellow", `${pct}%`)
  return c("red", `${pct}%`)
}
