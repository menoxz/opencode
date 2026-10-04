#!/usr/bin/env bun
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.OPENCODE_MODELS_URL || "https://models.dev"
export const modelsData = process.env.MODELS_DEV_API_JSON
  ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  : await fetch(`${modelsUrl}/api.json`, { signal: AbortSignal.timeout(5000) }).then((x) => {
      if (!x.ok) throw new Error(`HTTP ${x.status}: ${x.statusText}`)
      return x.text()
    }).catch((e) => {
      console.warn(`Failed to load models.dev snapshot: ${e.message}. Using empty data.`)
      return "{}"
    })
console.log("Loaded models.dev snapshot")
