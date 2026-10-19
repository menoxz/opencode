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
 * Merges a freshly read page into the sessions already held, instead of replacing them.
 *
 * A bootstrap rebuilds the session store from the launch folder, whose page alone would silently
 * empty every folder the user added to the list: those folders are read by their own pass, so the
 * merge keeps their sessions. A repeated id keeps the page's copy, and the result stays sorted by
 * id (the store binary-searches it) and free of duplicates (or the search would meet an id twice).
 */
export function mergeSessions<T extends { id: string }>(existing: readonly T[], page: readonly T[]): T[] {
  const byID = new Map<string, T>()
  for (const session of existing) byID.set(session.id, session)
  for (const session of page) byID.set(session.id, session)
  return [...byID.values()].toSorted((a, b) => a.id.localeCompare(b.id))
}

/**
 * The added folders a hydration pass still has to read: the ones not read yet, minus the current
 * folder. Clearing the read marks is what puts an already-read folder back in this list, so a pass
 * after a disposal re-reads it instead of leaving it at zero sessions.
 */
export function pendingDirectories(
  loaded: ReadonlySet<string>,
  current: string | undefined,
  added: readonly string[],
): string[] {
  const currentKey = folderKey(current)
  return added.filter((directory) => {
    const key = folderKey(directory)
    return key !== "" && key !== currentKey && !loaded.has(key)
  })
}

/**
 * A single-flight runner: while a pass is in flight, a new call queues **one** extra pass after it
 * instead of receiving the pass already running.
 *
 * The TUI bootstrap needs exactly that: a call that arrives after a disposal must not be answered
 * with a pass that started before it, and two passes must never write the session store out of
 * order. The extra pass is shared by every caller that queued, and it reuses the last arguments the
 * queuers passed.
 */
export function createSingleFlight<A extends unknown[], T>(run: (...args: A) => Promise<T>) {
  let inFlight: Promise<T> | undefined
  let followUp: Promise<T> | undefined
  let lastArgs: A | undefined

  function start(args: A): Promise<T> {
    const current = run(...args)
    inFlight = current
    const settle = () => {
      if (inFlight === current) inFlight = undefined
    }
    // Both outcomes clear the slot: a failed pass must not lock the runner out of future calls.
    void current.then(settle, settle)
    return current
  }

  return function call(...args: A): Promise<T> {
    if (!inFlight) return start(args)
    lastArgs = args
    const queued = inFlight
    followUp ??= queued.then(
      () => {
        followUp = undefined
        return call(...((lastArgs ?? args) as A))
      },
      () => {
        followUp = undefined
        return call(...((lastArgs ?? args) as A))
      },
    )
    return followUp
  }
}

/**
 * Une reconnexion du flux doit relire l'etat, une premiere connexion non : `bootstrap` a deja lu
 * tout ce qu'il fallait au montage, et le rejouer a l'ouverture ne ferait que doubler les appels.
 */
export function shouldRebootstrapOnReconnect(previous: number | undefined, next: number): boolean {
  return previous !== undefined && next > previous
}

/** The kv key the folders the user added to the session list are stored under. */
export const SESSION_EXTRA_DIRECTORIES_KEY = "session_extra_directories"

/**
 * Whether a session is recent enough to be listed. The cut-off is inclusive, so a session updated
 * exactly on the boundary stays: the bound must never drop a session it just barely kept in range.
 */
export function isRecentSession(session: { time: { updated: number } }, cutoff: number): boolean {
  return session.time.updated >= cutoff
}

/**
 * The folders the user added to the workspace, mirrored here so the event stream can recognise them.
 *
 * A session that lives in an added folder runs in that folder's own project, so its events carry a
 * project id the launch-project check would drop — the session would open and then show nothing at
 * all. `sync` owns the list (it reads it from kv) and publishes it on every read, which keeps the
 * event path free of both the kv context and the store.
 */
let extraDirectories: readonly string[] = []

/** Publishes the folders the user added to the workspace, for the event stream to match against. */
export function setExtraDirectories(directories: readonly string[]): void {
  extraDirectories = directories
}

/** Whether a folder is one the user added to the workspace, compared by folder identity. */
export function isExtraDirectory(directory: string | undefined | null): boolean {
  if (!directory) return false
  const key = folderKey(directory)
  return extraDirectories.some((item) => folderKey(item) === key)
}
