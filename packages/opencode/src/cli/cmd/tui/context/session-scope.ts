/**
 * How the session list is scoped: which folders it shows, and how old a session may be to still show.
 *
 * The sidebar opens on the folder the user is working in, and only widens when they add a folder on
 * purpose. Age is a hard bound on the listing, so a folder that accumulated months of sessions does
 * not push the recent ones out of view. Kept free of UI so the sync layer and the sidebar share one
 * rule instead of two that drift apart.
 */

/** Sessions updated before the cut-off are not listed. */
export const SESSION_MAX_AGE_DAYS = 7

/** Ceiling on sessions fetched per folder, so one busy folder cannot flood the list. */
export const SESSION_FETCH_LIMIT = 200

/** The `start` bound handed to the session list: sessions older than this are not requested. */
export function sessionAgeCutoff(now: number, days = SESSION_MAX_AGE_DAYS): number {
  return now - days * 24 * 60 * 60 * 1000
}

/**
 * Adds a folder to the watched list. The folder is expected to be absolute (the picker normalizes
 * what the user types), so this only drops an empty input and refuses to add the same folder twice;
 * comparison is case-insensitive because the paths come from a case-insensitive filesystem.
 */
export function addDirectory(list: readonly string[], directory: string): string[] {
  const candidate = directory.trim()
  if (!candidate) return [...list]
  if (list.some((item) => item.toLowerCase() === candidate.toLowerCase())) return [...list]
  return [...list, candidate]
}

/** Drops a folder from the watched list, so it can also leave the view it was added to. */
export function removeDirectory(list: readonly string[], directory: string): string[] {
  const target = directory.trim().toLowerCase()
  return list.filter((item) => item.toLowerCase() !== target)
}

/**
 * Identity of a folder, so the two spellings Windows produces for one path — a different case, or a
 * separator flipped between `\` and `/` — collapse to a single key. A session stores whatever string
 * it was created with, and both forms already coexist in the store (the DB holds `C:\jeanluc` and
 * `C:/jeanluc` side by side), so every place that groups or de-duplicates folders must agree on this
 * key; anything less renders one folder as two, or as an empty duplicate.
 */
export function folderKey(directory: string | undefined | null): string {
  return (directory ?? "").trim().replace(/[\\/]+/g, "/").replace(/\/+$/g, "").toLowerCase()
}

/** The folders the list watches: the current one, plus the ones the user added, in that order. */
export function watchedDirectories(current: string | undefined, added: readonly string[]): string[] {
  const all = current ? [current, ...added] : [...added]
  const seen = new Set<string>()
  return all.filter((directory) => {
    const key = folderKey(directory)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The kv keys and the default the bar's scope is read from, so one change flips every call site.
 *
 * The name deliberately differs from the `session_directory_scope` an earlier version wrote: `kv.get`
 * returns a stored value before any default, so a kv that already holds the old `"project"` would keep
 * forcing the machine-wide listing no matter what default is passed. A fresh key lets the new default
 * take effect on every existing install; the stale entry is simply never read again.
 */
export const SESSION_DIRECTORY_SCOPE_KEY = "session_directory_scope_v2"
export const SESSION_EXTRA_DIRECTORIES_KEY = "session_extra_directories"
/** The default scope is the folder the user works in, not every folder on the machine. */
export const DEFAULT_DIRECTORY_SCOPE: "project" | "directory" = "directory"

/**
 * Whether a session is recent enough to be listed. The cut-off is inclusive, so a session updated
 * exactly on the boundary stays: the bound must never drop a session it just barely kept in range.
 */
export function isRecentSession(session: { time: { updated: number } }, cutoff: number): boolean {
  return session.time.updated >= cutoff
}
