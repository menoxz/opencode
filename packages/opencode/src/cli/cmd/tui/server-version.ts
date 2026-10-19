/**
 * Attestation de version entre le binaire lancé (le client) et le serveur qui le sert.
 *
 * Après un déploiement, l'ancien serveur détaché répond toujours : `ensureServer` le réutilisait sans
 * regarder ce qu'il sert, donc la mise à jour restait sans effet et rien ne le disait. Le serveur
 * publie pourtant sa version (`GET /global/health`), et le client doit la lire. La convention
 * retenue est de la **rapporter**, jamais d'arrêter un serveur qui peut détenir une session vivante.
 */

/** `different` : le serveur qui sert ce client n'est pas de la même version que lui. */
export type VersionAttestation = "same" | "different" | "unknown"

export function attestVersion(client: string, server: string | undefined): VersionAttestation {
  if (typeof server !== "string" || server.length === 0) return "unknown"
  return server === client ? "same" : "different"
}

export function isVersionMismatch(client: string, server: string | undefined): boolean {
  return attestVersion(client, server) === "different"
}

/**
 * La ligne imprimée avant que l'interface démarre, ou `undefined` quand il n'y a rien à signaler :
 * un couple aligné, ou un serveur qui n'atteste pas de version (plus ancien, ou étranger).
 */
export function versionNotice(client: string, server: string | undefined): string | undefined {
  if (!isVersionMismatch(client, server)) return undefined
  return `Server ${server} is serving this client (${client}) — restart it to run the deployed build.`
}

/**
 * Lit la version que tourne réellement le serveur à `url`. Tout échec — injoignable, auth, corps
 * illisible, champ absent — vaut `unknown` : l'appelant ne doit jamais lire une absence comme une
 * correspondance.
 */
export async function readServerVersion(input: {
  url: string
  headers?: RequestInit["headers"]
  fetch?: typeof fetch
  timeoutMs?: number
}): Promise<string | undefined> {
  const doFetch = input.fetch ?? fetch
  try {
    const response = await doFetch(`${input.url}/global/health`, {
      headers: input.headers,
      signal: AbortSignal.timeout(input.timeoutMs ?? 1500),
    })
    if (!response.ok) return undefined
    const body: unknown = await response.json()
    if (!body || typeof body !== "object") return undefined
    const version = (body as { version?: unknown }).version
    return typeof version === "string" && version.length > 0 ? version : undefined
  } catch {
    return undefined
  }
}
