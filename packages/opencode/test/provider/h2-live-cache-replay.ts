#!/usr/bin/env bun
/**
 * H2 §8.5 — rejeu LIVE contre l'endpoint RÉEL `opencode-go/deepseek-v4.1-flash`.
 *
 * C'est la SEULE preuve admissible de §7.2 : un serveur scripté fabrique lui-même le
 * `cached_tokens` qu'il est censé observer et ne tranche rien (§8.3, plomberie).
 *
 * Critère §7.2 (écart ABSOLU) :
 *   `cached_tokens(2ᵉ) > 0`  ET  `uncached(2ᵉ) < uncached(1ᵉ)`,
 *   où `uncached = prompt_tokens − cached_tokens`.
 * Sinon (cached_tokens reste à 0) ⇒ §7.2 requalifié en `cached_2 === 0` documenté
 * et H2 se réduit à H3 (stabilité de préfixe).
 *
 * Ce fichier n'est PAS collecté par `bun test` (aucun `.test.` dans le nom → hors suite).
 * Il consomme de VRAIS tokens sur le provider de l'opérateur : 4 appels courts.
 *
 * Usage (depuis packages/opencode) :
 *   bun run test/provider/h2-live-cache-replay.ts
 *
 * Variables d'environnement (à défaut, lues depuis la config locale) :
 *   OPENCODE_GO_BASE_URL  base URL de l'API (…/v1)
 *   OPENCODE_GO_API_KEY   clé d'API
 *   H2_MODEL              défaut : deepseek-v4.1-flash
 *   H2_FIELD              champ de clé envoyé : `promptCacheKey` (défaut : ce que le client
 *                         émet dans providerOptions, tel quel) ou `prompt_cache_key` (variante snake)
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const env = process.env

function readConfigBaseURL(): string | undefined {
  const path = env.OPENCODE_CONFIG ?? join(homedir(), ".config", "opencodev2", "opencode.jsonc")
  try {
    // JSONC : on retire les commentaires de ligne avant de parser.
    const json = JSON.parse(
      readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    )
    const provider = json?.provider?.["opencode-go"]
    return provider?.options?.baseURL ?? provider?.options?.baseUrl
  } catch {
    return undefined
  }
}

function readAuthKey(): string | undefined {
  const path = join(homedir(), ".local", "share", "opencodev2", "auth.json")
  try {
    const json = JSON.parse(readFileSync(path, "utf8"))
    const entry = json?.["opencode-go"]
    return entry?.key ?? entry?.access
  } catch {
    return undefined
  }
}

const baseURL = (env.OPENCODE_GO_BASE_URL ?? readConfigBaseURL() ?? "").replace(/\/+$/, "")
const apiKey = env.OPENCODE_GO_API_KEY ?? readAuthKey()
const model = env.H2_MODEL ?? "deepseek-v4.1-flash"
const field = env.H2_FIELD ?? "promptCacheKey"

if (!baseURL || !apiKey) {
  console.error("H2 §8.5 live replay — impossible de continuer : identifiants absents.")
  console.error("  baseURL :", baseURL || "MANQUANT → exporter OPENCODE_GO_BASE_URL")
  console.error("  api key :", apiKey ? "présente (non affichée)" : "MANQUANTE → exporter OPENCODE_GO_API_KEY")
  process.exit(2)
}

// Préfixe stable et long : la plupart des serveurs n'activent un cache de préfixe
// qu'au-delà d'un seuil (souvent ~1024 tokens). ~180 lignes identiques ≈ 2k tokens.
const PREFIX = [
  "You are a careful assistant. Follow the project rules exactly.",
  ...Array.from({ length: 180 }, (_, i) => `Rule ${i + 1}: keep answers terse, cite file:line, never guess.`),
].join("\n")

const sessionID = `h2-replay-${Date.now()}`

type Probe = { tag: string; status: number; prompt: number; cached: number; reply: string | null }

async function call(withKey: boolean, tag: string): Promise<Probe> {
  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: PREFIX },
      { role: "user", content: "Reply with the single word: ok" },
    ],
    max_tokens: 8,
    temperature: 0,
  }
  if (withKey) body[field] = sessionID

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 400) }
  }
  const usage = json?.usage ?? {}
  const prompt = usage.prompt_tokens ?? 0
  // `prompt_tokens_details.cached_tokens` (OpenAI-compatible) ou les champs DeepSeek natifs.
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0
  const reply = json?.choices?.[0]?.message?.content ?? null
  console.log(
    JSON.stringify({
      tag,
      status: res.status,
      prompt_tokens: prompt,
      cached_tokens: cached,
      uncached: prompt - cached,
      reply,
      error: res.ok ? undefined : json,
    }),
  )
  return { tag, status: res.status, prompt, cached, reply }
}

console.log(`# H2 §8.5 live replay | endpoint=${baseURL} | model=${model} | key field=${field}`)
console.log("# A = sans clé (contrôle négatif BASELINE) ; B = avec clé (patch actif)")

const a1 = await call(false, "A1-no-key")
const a2 = await call(false, "A2-no-key")
const b1 = await call(true, "B1-with-key")
const b2 = await call(true, "B2-with-key")

const uncached = (p: Probe) => p.prompt - p.cached
const rejected = [a1, a2, b1, b2].find((p) => p.status === 400)

if (rejected) {
  console.log("# §7.2 : REJETÉ (HTTP 400) — la voie « émettre un champ de cache » est fermée ⇒ H2 se réduit à H3.")
} else if (b2.cached > 0 && uncached(b2) < uncached(b1)) {
  console.log(`# §7.2 : OUI — cache mord (cached_2=${b2.cached} > 0, uncached_2=${uncached(b2)} < uncached_1=${uncached(b1)})`)
} else {
  console.log(
    `# §7.2 : NON — cached_tokens reste à 0 (cached_2=${b2.cached}) ⇒ requalifier §7.2 en cached_2===0 et H2 se réduit à H3.`,
  )
}
console.log(`# contrôle négatif A (sans clé) : cached_1=${a1.cached} cached_2=${a2.cached}`)
