/**
 * Bounds the session list in time, and gives a folder a stable identity so the same folder seen under
 * two spellings stays one entry.
 *
 * The list itself is never scoped to a folder: every folder of the machine is shown, so there is no
 * per-folder allow-list to keep here. Kept free of UI so the sync layer and the sidebar share one
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
 * The identity of a folder, blind to case and to the slash used, so two sessions of the same folder
 * written `C:\x` and `C:/x` group together instead of showing as two directories. Comparison is
 * case-insensitive because the paths come from a case-insensitive filesystem.
 */
export function folderKey(directory: string | undefined | null): string {
  return (directory ?? "").trim().replace(/[\\/]+/g, "/").replace(/\/+$/g, "").toLowerCase()
}

/**
 * Whether a session is recent enough to be listed. The cut-off is inclusive, so a session updated
 * exactly on the boundary stays: the bound must never drop a session it just barely kept in range.
 */
export function isRecentSession(session: { time: { updated: number } }, cutoff: number): boolean {
  return session.time.updated >= cutoff
}
