/**
 * Authentification de l'UI web envers le serveur.
 *
 * Deux canaux, et c'est une contrainte du serveur, pas un choix :
 *
 *  - `Authorization: Basic <base64(user:pass)>` — le canal principal, utilisé par le client SDK
 *    (il accepte `headers`) et par les appels `fetch` maison.
 *  - `?auth_token=<base64(user:pass)>` — repli **explicitement prévu** par le serveur
 *    (`server/routes/instance/httpapi/middleware/authorization.ts:74-83` : « the query fallback
 *    exists for clients that cannot set headers »). C'est le seul canal possible pour
 *    `EventSource`, qui n'expose aucun moyen de poser un en-tête.
 *
 * Le repli par requête est donc employé pour le SSE uniquement, jamais pour les appels
 * ordinaires : un identifiant en paramètre d'URL finit dans les journaux d'accès.
 */

export type Credentials = { username: string; password: string }

/** Défaut du serveur (`server/auth.ts:19`). */
export const DEFAULT_USERNAME = "opencode"

/**
 * Base64 d'une chaîne, sûr en UTF-8.
 *
 * `btoa` seul lève une `InvalidCharacterError` dès qu'un caractère sort de Latin-1 — un mot de
 * passe accentué suffirait à casser l'authentification sans message clair.
 */
export function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Jeton `Basic` tel que le serveur l'attend (`server/auth.ts:41`). */
export function basicToken(credentials: Credentials): string {
  return `Basic ${toBase64(`${credentials.username}:${credentials.password}`)}`
}

/** Vrai si des identifiants sont réellement renseignés — un mot de passe vide n'authentifie rien. */
export function hasCredentials(credentials: Partial<Credentials> | undefined): boolean {
  return Boolean(credentials?.password)
}

/** En-têtes à passer au client SDK. Vide quand le serveur n'exige rien. */
export function authHeaders(credentials: Partial<Credentials> | undefined): Record<string, string> {
  if (!hasCredentials(credentials)) return {}
  const username = credentials?.username?.trim() || DEFAULT_USERNAME
  return { authorization: basicToken({ username, password: credentials!.password! }) }
}

/**
 * Ajoute le jeton d'authentification à une URL, pour les canaux sans en-têtes.
 * Sans identifiants, l'URL est retournée telle quelle.
 */
export function withAuthToken(url: string, credentials: Partial<Credentials> | undefined): string {
  if (!hasCredentials(credentials)) return url
  const username = credentials?.username?.trim() || DEFAULT_USERNAME
  const token = toBase64(`${username}:${credentials!.password!}`)
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}auth_token=${encodeURIComponent(token)}`
}
