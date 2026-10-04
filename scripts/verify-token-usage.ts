#!/usr/bin/env bun
/**
 * Verify Token Usage — compares actual SQLite token data against OpenCode Go plan limits.
 *
 * Plan: $12/5h, $30/week, $60/month
 * Model: DeepSeek V4 Flash
 * Pricing: $0.14/M input (cache miss), $0.0028/M cached input, $0.28/M output
 *
 * Run: bun run scripts/verify-token-usage.ts
 */

import { Database } from "bun:sqlite"
import { existsSync } from "fs"

// ── Configuration ────────────────────────────────────────────────────────────

const DB_PATH = "C:/Users/jeanl/.local/share/opencode/opencode.db"

const PLAN = {
  label: "OpenCode Go — DeepSeek V4 Flash",
  price5h: 12,
  priceWeek: 30,
  priceMonth: 60,
} as const

const PRICING = {
  inputMiss: 0.14,     // $ per Million tokens — cache miss
  inputCached: 0.0028, // $ per Million tokens — cache hit
  output: 0.28,        // $ per Million tokens
} as const

const EXPECTED = {
  inputMissPerRequest: 790,
  cachedPerRequest: 68_000,
  outputPerRequest: 280,
  requestsPer5h: 31_650,
  costPerRequest: 0.0003794,
} as const

const FORK_OVERHEAD = {
  extraSystemPromptTokens: 8_300,
  cacheRate: 0.936,
} as const

// DeepSeek V4 Flash model IDs (both opencode free and opencode-go paid)
const DSV4_FLASH_IDS = [
  "deepseek-v4-flash",
  "deepseek-v4-flash-free",
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

function fmt$n(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function fmt$(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sep(title: string): void {
  console.log()
  console.log("─".repeat(72))
  console.log(`  ${title}`)
  console.log("─".repeat(72))
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Open database
  if (!existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found at ${DB_PATH}`)
    process.exit(1)
  }

  const db = new Database(DB_PATH, { readonly: true })

  try {
    // 2. Pull aggregate data for ALL sessions
    const all = db.query(`
      SELECT
        COUNT(*)                                        AS sessions,
        COALESCE(SUM(tokens_input), 0)                  AS total_input,
        COALESCE(SUM(tokens_output), 0)                 AS total_output,
        COALESCE(SUM(tokens_reasoning), 0)              AS total_reasoning,
        COALESCE(SUM(tokens_cache_read), 0)             AS total_cache_read,
        COALESCE(SUM(tokens_cache_write), 0)            AS total_cache_write,
        COALESCE(SUM(cost), 0)                          AS total_cost,
        MIN(time_created)                               AS first_ts,
        MAX(time_created)                               AS last_ts
      FROM session
    `).get() as Record<string, unknown>

    // 3. Pull data specifically for DeepSeek V4 Flash (all providers)
    //    Model JSON looks like: {"id":"deepseek-v4-flash","providerID":"opencode-go","variant":"default"}
    //    or {"id":"deepseek-v4-flash-free","providerID":"opencode","variant":"default"}
    const dsFlash = db.query(`
      SELECT
        COUNT(*)                                        AS sessions,
        COALESCE(SUM(tokens_input), 0)                  AS total_input,
        COALESCE(SUM(tokens_output), 0)                 AS total_output,
        COALESCE(SUM(tokens_reasoning), 0)              AS total_reasoning,
        COALESCE(SUM(tokens_cache_read), 0)             AS total_cache_read,
        COALESCE(SUM(tokens_cache_write), 0)            AS total_cache_write,
        COALESCE(SUM(cost), 0)                          AS total_cost
      FROM session
      WHERE model LIKE '%"id":"deepseek-v4-flash%'
    `).get() as Record<string, unknown>

    // 4. Break down by provider (opencode-go vs opencode free)
    const dsGo = db.query(`
      SELECT
        model,
        COUNT(*)                                        AS sessions,
        COALESCE(SUM(tokens_input), 0)                  AS total_input,
        COALESCE(SUM(tokens_output), 0)                 AS total_output,
        COALESCE(SUM(tokens_reasoning), 0)              AS total_reasoning,
        COALESCE(SUM(tokens_cache_read), 0)             AS total_cache_read,
        COALESCE(SUM(tokens_cache_write), 0)            AS total_cache_write,
        COALESCE(SUM(cost), 0)                          AS total_cost
      FROM session
      WHERE model LIKE '%"id":"deepseek-v4-flash%'
        AND model LIKE '%"providerID":"opencode-go"%'
      GROUP BY model
      ORDER BY sessions DESC
    `).all() as Record<string, unknown>[]

    const dsFree = db.query(`
      SELECT
        model,
        COUNT(*)                                        AS sessions,
        COALESCE(SUM(tokens_input), 0)                  AS total_input,
        COALESCE(SUM(tokens_output), 0)                 AS total_output,
        COALESCE(SUM(tokens_reasoning), 0)              AS total_reasoning,
        COALESCE(SUM(tokens_cache_read), 0)             AS total_cache_read,
        COALESCE(SUM(tokens_cache_write), 0)            AS total_cache_write,
        COALESCE(SUM(cost), 0)                          AS total_cost
      FROM session
      WHERE model LIKE '%"id":"deepseek-v4-flash%'
        AND model LIKE '%"providerID":"opencode"%'
        AND model NOT LIKE '%"providerID":"opencode-go"%'
      GROUP BY model
      ORDER BY sessions DESC
    `).all() as Record<string, unknown>[]

    const a = all
    const f = dsFlash

    const totalInput = Number(f.total_input)
    const totalOutput = Number(f.total_output)
    const totalReasoning = Number(f.total_reasoning)
    const totalCacheRead = Number(f.total_cache_read)
    const totalCacheWrite = Number(f.total_cache_write)
    const totalCost = Number(f.total_cost)
    const sessionCount = Number(f.sessions)
    const allSessions = Number(a.sessions)
    const allTotalInput = Number(a.total_input)
    const allTotalOutput = Number(a.total_output)
    const allTotalCacheRead = Number(a.total_cache_read)
    const allTotalCacheWrite = Number(a.total_cache_write)
    const allTotalCost = Number(a.total_cost)

    // ── Report ──────────────────────────────────────────────────────────────

    console.log()
    console.log("╔══════════════════════════════════════════════════════════════════════════╗")
    console.log("║              OpenCode Token Usage Verification Report                   ║")
    console.log("╚══════════════════════════════════════════════════════════════════════════╝")
    console.log(`  Database    : ${DB_PATH}`)
    console.log(`  Report Date : ${new Date().toISOString()}`)
    console.log(`  Data Span   : ${new Date(Number(a.first_ts)).toISOString().slice(0, 10)} → ${new Date(Number(a.last_ts)).toISOString().slice(0, 10)}`)
    console.log()

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 1: Overview — All Models
    // ═══════════════════════════════════════════════════════════════════════
    sep("1. All Models — Total Usage Across All Providers")

    console.log(`  ${"Sessions:".padEnd(32)} ${fmt(allSessions)}`)
    console.log(`  ${"Total Input Tokens:".padEnd(32)} ${fmt(allTotalInput)}`)
    console.log(`  ${"Total Output Tokens:".padEnd(32)} ${fmt(allTotalOutput)}`)
    console.log(`  ${"Total Cache Read Tokens:".padEnd(32)} ${fmt(allTotalCacheRead)}`)
    console.log(`  ${"Total Cache Write Tokens:".padEnd(32)} ${fmt(allTotalCacheWrite)}`)
    console.log(`  ${"Total Recorded Cost:".padEnd(32)} ${fmt$(allTotalCost)}`)

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 2: DeepSeek V4 Flash — Detailed Breakdown
    // ═══════════════════════════════════════════════════════════════════════
    sep("2. DeepSeek V4 Flash — All Versions")

    console.log(`  ${"Sessions:".padEnd(32)} ${fmt(sessionCount)}`)
    console.log(`  ${"Total Input Tokens (miss):".padEnd(32)} ${fmt(totalInput)}`)
    console.log(`  ${"Total Output Tokens:".padEnd(32)} ${fmt(totalOutput)}`)
    console.log(`  ${"Total Reasoning Tokens:".padEnd(32)} ${fmt(totalReasoning)}`)
    console.log(`  ${"Total Cache Read Tokens:".padEnd(32)} ${fmt(totalCacheRead)}`)
    console.log(`  ${"Total Cache Write Tokens:".padEnd(32)} ${fmt(totalCacheWrite)}`)
    console.log(`  ${"Recorded Cost (from DB):".padEnd(32)} ${fmt$(totalCost)}`)

    // Cache hit rate
    const totalEffectiveInput = totalInput + totalCacheRead
    const cacheRate = totalEffectiveInput > 0 ? (totalCacheRead / totalEffectiveInput) * 100 : 0
    console.log(`  ${"Effective Cache Hit Rate:".padEnd(32)} ${cacheRate.toFixed(2)}%`)

    // ── Per-provider breakdown ──────────────────────────────────────────
    sep("2a. DeepSeek V4 Flash — by Provider")

    console.log("  opencode-go (paid):")
    for (const row of dsGo) {
      const modelJson = JSON.parse(String(row.model))
      const variant = modelJson.variant ?? "default"
      console.log(`    ${String(variant).padEnd(16)} ${fmt(Number(row.sessions)).padStart(6)} sessions  ` +
        `in:${fmt(Number(row.total_input)).padStart(12)}  out:${fmt(Number(row.total_output)).padStart(10)}  ` +
        `cache:${fmt(Number(row.total_cache_read)).padStart(14)}  cost:${fmt$(Number(row.total_cost))}`)
    }

    const goTotalSessions = dsGo.reduce((s, r) => s + Number(r.sessions), 0)
    const goTotalInput = dsGo.reduce((s, r) => s + Number(r.total_input), 0)
    const goTotalOutput = dsGo.reduce((s, r) => s + Number(r.total_output), 0)
    const goTotalCache = dsGo.reduce((s, r) => s + Number(r.total_cache_read), 0)
    const goTotalCost = dsGo.reduce((s, r) => s + Number(r.total_cost), 0)

    console.log(`    ${"→ opencode-go total:".padEnd(20)} ${fmt(goTotalSessions).padStart(6)} sessions  ` +
      `in:${fmt(goTotalInput).padStart(12)}  out:${fmt(goTotalOutput).padStart(10)}  ` +
      `cache:${fmt(goTotalCache).padStart(14)}  cost:${fmt$(goTotalCost)}`)

    console.log()
    console.log("  opencode (free tier):")
    for (const row of dsFree) {
      const modelJson = JSON.parse(String(row.model))
      const variant = modelJson.variant ?? "default"
      console.log(`    ${String(variant).padEnd(16)} ${fmt(Number(row.sessions)).padStart(6)} sessions  ` +
        `in:${fmt(Number(row.total_input)).padStart(12)}  out:${fmt(Number(row.total_output)).padStart(10)}  ` +
        `cache:${fmt(Number(row.total_cache_read)).padStart(14)}  cost:${fmt$(Number(row.total_cost))}`)
    }

    const freeTotalSessions = dsFree.reduce((s, r) => s + Number(r.sessions), 0)
    const freeTotalInput = dsFree.reduce((s, r) => s + Number(r.total_input), 0)
    const freeTotalOutput = dsFree.reduce((s, r) => s + Number(r.total_output), 0)
    const freeTotalCache = dsFree.reduce((s, r) => s + Number(r.total_cache_read), 0)
    const freeTotalCost = dsFree.reduce((s, r) => s + Number(r.total_cost), 0)

    console.log(`    ${"→ opencode free total:".padEnd(20)} ${fmt(freeTotalSessions).padStart(6)} sessions  ` +
      `in:${fmt(freeTotalInput).padStart(12)}  out:${fmt(freeTotalOutput).padStart(10)}  ` +
      `cache:${fmt(freeTotalCache).padStart(14)}  cost:${fmt$(freeTotalCost)}`)

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 3: Cost at OpenCode Go Server Rates
    // ═══════════════════════════════════════════════════════════════════════
    sep("3. Estimated Cost at OpenCode Go Server Rates (DeepSeek V4 Flash)")

    // Cost breakdown:
    const costInputMiss = (totalInput / 1_000_000) * PRICING.inputMiss
    const costCached = (totalCacheRead / 1_000_000) * PRICING.inputCached
    const costOutput = (totalOutput / 1_000_000) * PRICING.output
    const costReasoning = (totalReasoning / 1_000_000) * PRICING.output // reasoning priced same as output

    // Cache writes are typically free with most providers, but let's note them
    // Actually, on DeepSeek, cache write happens automatically and isn't separately charged.
    // Cache reads/inputs that hit the cache are charged at the cached rate.

    console.log(`  ${"Input (cache miss):".padEnd(30)} ${fmt(totalInput).padStart(14)} tokens × $0.14/M = ${fmt$n(costInputMiss)}`)
    console.log(`  ${"Input (cache hit):".padEnd(30)} ${fmt(totalCacheRead).padStart(14)} tokens × $0.0028/M = ${fmt$n(costCached)}`)
    console.log(`  ${"Output:".padEnd(30)} ${fmt(totalOutput).padStart(14)} tokens × $0.28/M = ${fmt$n(costOutput)}`)
    console.log(`  ${"Reasoning (as output):".padEnd(30)} ${fmt(totalReasoning).padStart(14)} tokens × $0.28/M = ${fmt$n(costReasoning)}`)

    const totalEstimatedCost = costInputMiss + costCached + costOutput + costReasoning
    console.log(`  ${"─".repeat(60)}`)
    console.log(`  ${"Total Estimated Cost:".padEnd(30)} ${fmt$n(totalEstimatedCost)}`)
    if (totalCost > 0) {
      console.log(`  ${"Recorded Cost (from DB):".padEnd(30)} ${fmt$(totalCost)}`)
      console.log(`  ${"Difference (estimate − recorded):".padEnd(30)} ${fmt$n(totalEstimatedCost - totalCost)}`)
    }

    // Average per session
    if (sessionCount > 0) {
      console.log()
      console.log(`  Average per session:`)
      console.log(`    Input (miss):  ${fmt(Math.round(totalInput / sessionCount))}`)
      console.log(`    Output:        ${fmt(Math.round(totalOutput / sessionCount))}`)
      console.log(`    Reasoning:     ${fmt(Math.round(totalReasoning / sessionCount))}`)
      console.log(`    Cache read:    ${fmt(Math.round(totalCacheRead / sessionCount))}`)
      console.log(`    Cost:          ${fmt$n(totalEstimatedCost / sessionCount)}`)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 4: Comparison Against Plan Estimates
    // ═══════════════════════════════════════════════════════════════════════
    sep("4. Comparison Against OpenCode Go Plan Estimates")

    console.log(`  Plan: ${PLAN.label}`)
    console.log(`  ${"$12/5h".padEnd(24)} → expects ${fmt(EXPECTED.requestsPer5h)} requests @ ${fmt$n(EXPECTED.costPerRequest)} each`)
    console.log(`  ${"$30/week".padEnd(24)} → expects ${fmt(Math.round(EXPECTED.requestsPer5h * 2.5))} requests (≈12.5h)`)
    console.log(`  ${"$60/month".padEnd(24)} → expects ${fmt(Math.round(EXPECTED.requestsPer5h * 5))} requests (≈25h)`)

    // How many requests our actual usage would consume at expected rates
    // Normalize actual total tokens to "equivalent requests" using expected per-request values
    if (EXPECTED.inputMissPerRequest > 0 && EXPECTED.outputPerRequest > 0) {
      const equivInputRequests = totalInput / EXPECTED.inputMissPerRequest
      const equivOutputRequests = totalOutput / EXPECTED.outputPerRequest
      const equivCacheRequests = totalCacheRead / EXPECTED.cachedPerRequest
      console.log()
      console.log(`  Equivalent requests based on actual tokens:`)
      console.log(`    Input (miss) based:  ${fmt(Math.round(equivInputRequests))} requests (${fmt(totalInput)} / ${EXPECTED.inputMissPerRequest})`)
      console.log(`    Output based:        ${fmt(Math.round(equivOutputRequests))} requests (${fmt(totalOutput)} / ${EXPECTED.outputPerRequest})`)
      console.log(`    Cache read based:    ${fmt(Math.round(equivCacheRequests))} requests (${fmt(totalCacheRead)} / ${fmt(EXPECTED.cachedPerRequest)})`)

      // The plan "expected" per-request cost includes all three components
      // Let's compute how many "plan-equivalent" requests our cost represents
      if (EXPECTED.costPerRequest > 0) {
        const equivByCost = totalEstimatedCost / EXPECTED.costPerRequest
        console.log(`    Cost based:          ${fmt(Math.round(equivByCost))} requests (${fmt$n(totalEstimatedCost)} / ${fmt$n(EXPECTED.costPerRequest)})`)

    console.log()
    console.log(`  NOTE: Plan limits are per-period caps. The data spans ~5 months.`)
    console.log(`  Plan quota consumed (total estimate against each plan cap):`)
    console.log(`    ${"5h block ($12):".padEnd(24)} ${(totalEstimatedCost / PLAN.price5h * 100).toFixed(1)}% used (${fmt$n(totalEstimatedCost)} / ${fmt$(PLAN.price5h)})`)
    console.log(`      → this equals ${(totalEstimatedCost / PLAN.price5h).toFixed(1)} blocks of 5h`)
    console.log(`    ${"Weekly ($30):".padEnd(24)} ${(totalEstimatedCost / PLAN.priceWeek * 100).toFixed(1)}% used (${fmt$n(totalEstimatedCost)} / ${fmt$(PLAN.priceWeek)})`)
    console.log(`    ${"Monthly ($60):".padEnd(24)} ${(totalEstimatedCost / PLAN.priceMonth * 100).toFixed(1)}% used (${fmt$n(totalEstimatedCost)} / ${fmt$(PLAN.priceMonth)})`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 5: Fork Overhead Analysis
    // ═══════════════════════════════════════════════════════════════════════
    sep("5. Fork Overhead Analysis")

    // The fork adds ~8,300 tokens of extra system prompt per request
    // Most of these are cache hits (93.6% cache rate observed)
    const forkExtraPerRequest = FORK_OVERHEAD.extraSystemPromptTokens
    const forkCacheRate = FORK_OVERHEAD.cacheRate
    const forkMissPerRequest = forkExtraPerRequest * (1 - forkCacheRate)
    const forkCachedPerRequest = forkExtraPerRequest * forkCacheRate

    console.log(`  Extra system prompt tokens per request (fork): ${fmt(forkExtraPerRequest)}`)
    console.log(`  Assumed cache rate for fork overhead:          ${(forkCacheRate * 100).toFixed(1)}%`)
    console.log(`  Expected miss tokens/request from fork:         ${fmt(Math.round(forkMissPerRequest))}`)
    console.log(`  Expected cached tokens/request from fork:       ${fmt(Math.round(forkCachedPerRequest))}`)

    // Cost of fork overhead per request
    const forkMissCostPerRequest = (forkMissPerRequest / 1_000_000) * PRICING.inputMiss
    const forkCachedCostPerRequest = (forkCachedPerRequest / 1_000_000) * PRICING.inputCached
    const forkTotalCostPerRequest = forkMissCostPerRequest + forkCachedCostPerRequest

    console.log()
    console.log(`  Per-request cost impact of fork overhead:`)
    console.log(`    Cache miss portion:  ${fmt$n(forkMissCostPerRequest)} (${fmt(Math.round(forkMissPerRequest))} tokens)`)
    console.log(`    Cache hit portion:   ${fmt$n(forkCachedCostPerRequest)} (${fmt(Math.round(forkCachedPerRequest))} tokens)`)
    console.log(`    Total per request:   ${fmt$n(forkTotalCostPerRequest)}`)

    // Total fork overhead across all sessions
    const totalForkMiss = forkMissPerRequest * sessionCount
    const totalForkCached = forkCachedPerRequest * sessionCount
    const totalForkMissCost = (totalForkMiss / 1_000_000) * PRICING.inputMiss
    const totalForkCachedCost = (totalForkCached / 1_000_000) * PRICING.inputCached
    const totalForkCost = totalForkMissCost + totalForkCachedCost

    console.log()
    console.log(`  Total fork overhead across ${fmt(sessionCount)} DeepSeek V4 Flash sessions:`)
    console.log(`    Extra cache-miss tokens: ${fmt(Math.round(totalForkMiss))} → ${fmt$n(totalForkMissCost)}`)
    console.log(`    Extra cache-hit tokens:  ${fmt(Math.round(totalForkCached))} → ${fmt$n(totalForkCachedCost)}`)
    console.log(`    Total overhead cost:     ${fmt$n(totalForkCost)}`)

    // What percentage of total cost is from fork overhead
    if (totalEstimatedCost > 0) {
      const overheadPct = (totalForkCost / totalEstimatedCost) * 100
      console.log()
      console.log(`  Fork overhead as % of total estimated cost: ${overheadPct.toFixed(1)}%`)
      console.log(`  Without fork overhead, estimated cost would be: ${fmt$n(totalEstimatedCost - totalForkCost)}`)
    }

    // Extra requests the fork overhead "consumes"
    const wastedRequests = EXPECTED.costPerRequest > 0 ? totalForkCost / EXPECTED.costPerRequest : 0
    if (EXPECTED.costPerRequest > 0) {
      console.log()
      console.log(`  Equivalent plan requests lost to fork overhead: ~${fmt(Math.round(wastedRequests))}`)
      const wasted5hBlocks = totalForkCost / PLAN.price5h
      console.log(`  Equivalent 5h blocks wasted:                   ${wasted5hBlocks.toFixed(2)}`)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 6: Reasoning Token Overcounting Check
    // ═══════════════════════════════════════════════════════════════════════
    sep("6. Reasoning Token Overcounting Check")

    // Reasoning tokens may be double-counted in some implementations
    // (once as output, once as reasoning). Check if output > reasoning and how they relate.
    if (totalOutput > 0) {
      const reasoningPct = (totalReasoning / totalOutput) * 100
      console.log(`  Total output tokens:      ${fmt(totalOutput)}`)
      console.log(`  Total reasoning tokens:   ${fmt(totalReasoning)}`)
      console.log(`  Reasoning as % of output: ${reasoningPct.toFixed(1)}%`)

      if (reasoningPct > 100) {
        console.log(`  ⚠️  WARNING: Reasoning tokens EXCEED output tokens!`)
        console.log(`     Possible double-counting in getUsage().`)
        console.log(`     If reasoning is included in output, actual output cost may be lower.`)
        console.log(`     Overcount estimate: ${fmt$n(((totalReasoning) / 1_000_000) * PRICING.output)}`)
      } else if (reasoningPct > 50) {
        console.log(`  ⚡ NOTE: Reasoning tokens are significant (${reasoningPct.toFixed(1)}% of output).`)
        console.log(`     Verify getUsage() doesn't double-count them in the output total.`)
      } else {
        console.log(`  ✅ Reasoning tokens are a reasonable proportion of output — no overcounting detected.`)
      }
    }

    // Check for anomaly: sessions where reasoning > output
    const anomalyCount = db.query(`
      SELECT COUNT(*) as cnt
      FROM session
      WHERE model LIKE '%"id":"deepseek-v4-flash%'
        AND tokens_reasoning > tokens_output
        AND tokens_output > 0
    `).get() as { cnt: number }

    if (anomalyCount.cnt > 0) {
      console.log(`  ⚠️  ${anomalyCount.cnt} sessions have reasoning_tokens > output_tokens (potential double-count).`)
    }

    // Check total from DB vs what we recompute
    if (totalCost > 0) {
      // Recompute cost from tokens
      const recomputedCost = (totalInput / 1_000_000) * PRICING.inputMiss
        + (totalCacheRead / 1_000_000) * PRICING.inputCached
        + ((totalOutput + totalReasoning) / 1_000_000) * PRICING.output

      const costDiff = Math.abs(recomputedCost - totalCost)
      const costDiffPct = totalCost > 0 ? (costDiff / totalCost) * 100 : 0

      console.log()
      console.log(`  Recorded DB cost:     ${fmt$(totalCost)}`)
      console.log(`  Recomputed cost:      ${fmt$n(recomputedCost)}`)
      console.log(`  Difference:           ${fmt$n(recomputedCost - totalCost)} (${costDiffPct.toFixed(2)}%)`)

      if (costDiffPct > 5) {
        console.log(`  ⚠️  WARNING: Large discrepancy between recorded and recomputed cost!`)
        console.log(`     The DB recording may use different pricing or miss some tokens.`)
      } else {
        console.log(`  ✅ Recorded cost matches expected pricing within ${costDiffPct.toFixed(2)}%.`)
      }
    } else {
      console.log(`  ℹ️  Recorded cost is zero (free tier). Cannot verify getUsage() pricing accuracy.`)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 7: Summary
    // ═══════════════════════════════════════════════════════════════════════
    sep("7. Summary")

    if (sessionCount > 0) {
      const avgInput = Math.round(totalInput / sessionCount)
      const avgOutput = Math.round(totalOutput / sessionCount)
      const avgCache = Math.round(totalCacheRead / sessionCount)

      console.log(`  DeepSeek V4 Flash sessions: ${fmt(sessionCount)}`)
      console.log(`  Avg input (miss)/session:    ${fmt(avgInput)}`)
      console.log(`  Avg output/session:          ${fmt(avgOutput)}`)
      console.log(`  Avg cache read/session:      ${fmt(avgCache)}`)
      console.log(`  Cache hit rate:              ${cacheRate.toFixed(1)}%`)
      console.log()
      console.log(`  Estimated cost at Go rates:  ${fmt$n(totalEstimatedCost)}`)
      console.log(`  Fork overhead cost:          ${fmt$n(totalForkCost)} (${(totalForkCost / totalEstimatedCost * 100).toFixed(1)}% of total)`)
      console.log()
      console.log(`  Plan comparison:`)
      console.log(`    $12/5h block:  ${(totalEstimatedCost / PLAN.price5h * 100).toFixed(1)}% consumed`)
      console.log(`    $30/week:      ${(totalEstimatedCost / PLAN.priceWeek * 100).toFixed(1)}% consumed`)
      console.log(`    $60/month:     ${(totalEstimatedCost / PLAN.priceMonth * 100).toFixed(1)}% consumed`)
      console.log()
      console.log(`  Cost without fork overhead:     ${fmt$n(totalEstimatedCost - totalForkCost)}`)
      console.log(`  Plan capacity recovered if fork overhead removed:`)
      console.log(`    ~${fmt(Math.round(wastedRequests))} extra requests or ~${(wastedRequests / EXPECTED.requestsPer5h).toFixed(2)} additional 5h blocks`)
    } else {
      console.log("  No DeepSeek V4 Flash sessions found in database.")
    }

  } finally {
    db.close()
  }
}

main()
