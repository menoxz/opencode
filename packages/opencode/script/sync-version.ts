#!/usr/bin/env bun
/**
 * sync-version.ts — Sync package.json version with the latest git tag.
 *
 * Reads the nearest git tag matching v* and updates packages/opencode/package.json
 * to match.  Prevents the version drift that happened at v1.18.6.
 *
 * Usage:
 *   bun run script/sync-version.ts          # check-only, exit 1 if mismatch
 *   bun run script/sync-version.ts --fix    # update package.json to match tag
 *   bun run script/sync-version.ts --check  # explicit check (default)
 */

import path from "path"
import { $ } from "bun"

const dir = path.resolve(import.meta.dir, "..")
const pkgPath = path.join(dir, "package.json")
const pkg = await Bun.file(pkgPath).json() as { version: string }

/**
 * Resolve the effective version from git state:
 *   1. If HEAD has a v-prefixed tag, use its first matching version.
 *   2. Otherwise, find the nearest reachable v-prefixed tag.
 *   3. If none, fall back to package.json version (no-op).
 */
async function resolveGitVersion(): Promise<string | undefined> {
  // 1. Tags on HEAD
  const tagOut = await $`git tag --points-at HEAD`.text()
  const headTag = tagOut
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^v/, ""))
    .find((v) => /^\d+\.\d+\.\d+/.test(v))
  if (headTag) return headTag

  // 2. Nearest v* tag reachable from HEAD
  try {
    const desc = await $`git describe --tags --abbrev=0 --match "v*"`.text()
    const tag = desc.trim().replace(/^v/, "")
    if (/^\d+\.\d+\.\d+/.test(tag)) return tag
  } catch {
    // No tags yet — fall through
  }

  return undefined
}

const resolvedVersion = (await resolveGitVersion()) ?? pkg.version
const isFix = process.argv.includes("--fix")
const isCheck = process.argv.includes("--check") || !isFix

if (resolvedVersion === pkg.version) {
  console.log(`✓ package.json version ${pkg.version} matches git tag v${resolvedVersion}`)
  process.exit(0)
}

if (isCheck) {
  console.error(
    `✗ Version mismatch!\n` +
    `  package.json:  ${pkg.version}\n` +
    `  git tag:       v${resolvedVersion}\n` +
    `\n` +
    `  Run "bun run script/sync-version.ts --fix" to update package.json.`,
  )
  process.exit(1)
}

// --fix: update package.json in place
const updated = JSON.stringify({ ...pkg, version: resolvedVersion }, null, 2)
await Bun.write(pkgPath, updated + "\n")
console.log(`✓ Updated package.json version from ${pkg.version} to ${resolvedVersion}`)
