import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { authHeaders, type Credentials } from "./auth"

/** Backend the CLI pins in source mode (`packages/opencode/src/dev/source.ts:15`). */
const DEFAULT_PORT = 4096

const STORAGE_KEY = "oc.webui.serverUrl"
const AUTH_KEY = "oc.webui.auth"

/**
 * Resolution order, most specific first:
 *   1. `VITE_OPENCODE_SERVER_URL` — a direct backend, used when the server serves this UI itself.
 *   2. localStorage — the user's explicit choice, persisted across reloads.
 *   3. same-origin — the dev proxy in `vite.config.ts` forwards `/session`, `/event`, … to the
 *      backend, so no CORS configuration is required on the server side.
 */
export function resolveServerUrl(): string {
  const fromEnv = import.meta.env.VITE_OPENCODE_SERVER_URL
  if (fromEnv) return fromEnv
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  return ""
}

export function rememberServerUrl(url: string) {
  if (url) localStorage.setItem(STORAGE_KEY, url)
  else localStorage.removeItem(STORAGE_KEY)
}

export function defaultServerUrl() {
  return `http://127.0.0.1:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? DEFAULT_PORT}`
}

export function readCredentials(): Credentials | undefined {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<Credentials>
    if (!parsed?.password) return undefined
    return { username: parsed.username ?? "", password: parsed.password }
  } catch {
    return undefined
  }
}

/**
 * Saves credentials and reloads. The SDK client and the SSE connection are both built at boot
 * with these values, so a reload is the honest way to apply them — cheaper and clearer than
 * rebuilding two live connections in place.
 */
export function rememberCredentials(credentials: Credentials | undefined) {
  if (credentials?.password) localStorage.setItem(AUTH_KEY, JSON.stringify(credentials))
  else localStorage.removeItem(AUTH_KEY)
  location.reload()
}

export const serverUrl = resolveServerUrl()
export const credentials = readCredentials()

export const client = createOpencodeClient({
  ...(serverUrl ? { baseUrl: serverUrl } : {}),
  headers: authHeaders(credentials),
})

export type Health = { healthy: boolean; version: string }

export async function fetchHealth(): Promise<Health | undefined> {
  const response = await fetch(`${serverUrl}/global/health`, { headers: authHeaders(credentials) }).catch(
    () => undefined,
  )
  if (!response?.ok) return undefined
  return (await response.json()) as Health
}
