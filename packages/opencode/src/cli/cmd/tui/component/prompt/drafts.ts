import type { PromptInfo } from "./history"

export type Draft = { prompt: PromptInfo; cursor: number }

/** Key for the composer that is not attached to a session yet. */
export const NEW_SESSION = "new"

const key = (sessionID: string | undefined) => sessionID ?? NEW_SESSION

/**
 * One prompt draft per session, so working on several sessions at once never loses
 * what was typed. Kept outside the prompt store because that single store is reused
 * across a session switch instead of being recreated.
 */
export function createDraftStore() {
  const store = new Map<string, Draft>()
  return {
    read(sessionID: string | undefined) {
      return store.get(key(sessionID))
    },
    stash(sessionID: string | undefined, draft: Draft) {
      store.set(key(sessionID), draft)
    },
    drop(sessionID: string | undefined) {
      store.delete(key(sessionID))
    },
    /** Leave `from` for `to`: keep the draft being left and return the one to restore. */
    swap(from: string | undefined, current: Draft | undefined, to: string | undefined) {
      if (current?.prompt.input) store.set(key(from), current)
      else store.delete(key(from))
      return store.get(key(to))
    },
    get size() {
      return store.size
    },
  }
}

export type DraftStore = ReturnType<typeof createDraftStore>

export const drafts = createDraftStore()
