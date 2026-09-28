/**
 * A session is *stored* under one directory, but every request it makes is executed by whichever
 * instance serves that request. Without an explicit directory the server resolves the request
 * against its own `process.cwd()`, so a session can display one directory and work in another.
 * Every session-scoped request must therefore carry the session's own directory.
 */

/** Header the server reads to pick the instance serving a request. */
export const SESSION_DIRECTORY_HEADER = "x-opencode-directory"

/**
 * The value the header must carry: the path itself, unencoded. The server reads the header value
 * as the directory (`workspace-routing.ts`), and when the client moves the header into the
 * `directory` query parameter for GET/HEAD it encodes it exactly once — pre-encoding here would
 * double-encode it, and the server would look for a directory literally named `C%3A\...`.
 */
export function directoryHeaderValue(directory: string | undefined): string | undefined {
  if (!directory) return undefined
  const trimmed = directory.trim()
  if (!trimmed) return undefined
  return trimmed
}

/**
 * Request options routing a session-scoped call to `directory`. Merged over the client's headers
 * by the generated client (`mergeHeaders(config.headers, options.headers)`), so this overrides
 * the launch directory of the client — which is what makes execution follow the session.
 */
export function directoryRequestOptions(directory: string | undefined): Record<string, unknown> {
  const value = directoryHeaderValue(directory)
  if (!value) return {}
  return { headers: { [SESSION_DIRECTORY_HEADER]: value } }
}

/** The directory a session is stored under, as the TUI displays it. */
export function sessionDirectory(
  sessions: ReadonlyArray<{ id: string; directory?: string }>,
  sessionID: string | undefined,
): string | undefined {
  if (!sessionID) return undefined
  return sessions.find((session) => session.id === sessionID)?.directory || undefined
}

/** Path comparison ignoring separators and case, as Windows resolves a directory. */
export function normalizeDirectoryPath(directory: string): string {
  return directory.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase()
}

/** Whether the directory a session works in is the one it displays. */
export function directoryMatches(
  displayed: string | undefined,
  working: { cwd?: string; root?: string } | undefined,
): boolean {
  const actual = working?.cwd ?? working?.root
  if (!displayed || !actual) return false
  return normalizeDirectoryPath(displayed) === normalizeDirectoryPath(actual)
}
