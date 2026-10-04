export * as PluginArtifact from "./artifact"

import path from "path"
import { createHash } from "crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { pathToFileURL } from "url"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "plugin.artifact" })

// Plugin code has to be imported from a NEW specifier after every edit: Bun caches ESM modules by
// specifier, so re-importing the same path returns the stale module. A cache-busting query string
// does not help either (measured: `?v=<ts>` on a file:// URL still returned the old module), so the
// only reliable discriminator is a different file path.
//
// Every file plugin is therefore materialised into a content-hashed artifact and that artifact is
// imported instead. The artifact lives under the global cache directory on purpose: putting it next
// to the plugin sources would make the plugin watcher observe its own output and reload forever.

const SOURCE_FILES = /\.(mjs|js|cjs|ts|tsx)$/i

export type Materialized = {
  // What to hand to `import()`. Falls back to the original entry when materialisation is impossible.
  specifier: string
  hash: string
  bundled: boolean
}

function fingerprint(file: string) {
  const dir = path.dirname(file)
  const parts: string[] = []
  try {
    for (const name of readdirSync(dir).sort()) {
      if (!SOURCE_FILES.test(name)) continue
      const stat = statSync(path.join(dir, name))
      parts.push(`${name}:${stat.size}:${Math.floor(stat.mtimeMs)}`)
    }
  } catch (error) {
    log.warn("plugin fingerprint could not read the plugin directory", { dir, error })
  }
  return parts.join("|")
}

async function bundle(file: string, outDir: string) {
  if (typeof Bun?.build !== "function") return
  try {
    const result = await Bun.build({
      entrypoints: [file],
      target: "bun",
      format: "esm",
      outdir: outDir,
      naming: "entry.js",
      minify: false,
    })
    if (!result.success) {
      log.warn("plugin bundle failed", { file, logs: result.logs.map((item) => String(item)) })
      return
    }
    return result.outputs[0]?.path
  } catch (error) {
    log.warn("plugin bundle threw", { file, error })
  }
}

// Bundling is preferred because it inlines the plugin's local imports, so an edit to a helper
// module is picked up too. When bundling is unavailable we fall back to a plain copy: the copy is
// still needed because the *original* path stays cached, but it only reflects edits to the entry
// file itself (its relative imports resolve to the cached originals).
function copy(file: string, outFile: string) {
  try {
    mkdirSync(path.dirname(outFile), { recursive: true })
    const extension = path.extname(file)
    const target = outFile.replace(/\.js$/, extension)
    writeFileSync(target, readFileSync(file))
    return target
  } catch (error) {
    log.warn("plugin copy fallback failed", { file, error })
  }
}

export async function materialize(entry: string): Promise<Materialized> {
  const file = entry.startsWith("file://") ? new URL(entry) : undefined
  if (!file || file.protocol !== "file:") return { specifier: entry, hash: "", bundled: false }

  const local = file.pathname.replace(/^\/([A-Za-z]:)/, "$1")
  if (!existsSync(local)) return { specifier: entry, hash: "", bundled: false }

  const hash = createHash("sha256")
    .update(readFileSync(local))
    .update(fingerprint(local))
    .digest("hex")
    .slice(0, 16)

  const outDir = path.join(Global.Path.cache, "plugin-artifacts", hash)
  const outFile = path.join(outDir, "entry.js")
  if (existsSync(outFile)) return { specifier: pathToFileURL(outFile).href, hash, bundled: true }

  const materialized = (await bundle(local, outDir)) ?? copy(local, outFile)
  if (!materialized) return { specifier: entry, hash, bundled: false }
  return { specifier: pathToFileURL(materialized).href, hash, bundled: true }
}
