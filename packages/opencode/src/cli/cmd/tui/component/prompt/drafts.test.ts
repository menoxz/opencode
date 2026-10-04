import { describe, expect, test } from "bun:test"
import { NEW_SESSION, createDraftStore, type Draft } from "./drafts"

const draft = (input: string, cursor = 0): Draft => ({ prompt: { input, parts: [] }, cursor })

describe("TUI per-session prompt drafts", () => {
  test("keeps a separate draft per session", () => {
    const store = createDraftStore()
    store.stash("ses_a", draft("about A"))
    store.stash("ses_b", draft("about B"))
    expect(store.read("ses_a")?.prompt.input).toBe("about A")
    expect(store.read("ses_b")?.prompt.input).toBe("about B")
  })

  test("keys the unattached composer separately from any session", () => {
    const store = createDraftStore()
    store.stash(undefined, draft("home"))
    store.stash("ses_a", draft("A"))
    expect(store.read(undefined)?.prompt.input).toBe("home")
    expect(store.read(NEW_SESSION)?.prompt.input).toBe("home")
    expect(store.read("ses_a")?.prompt.input).toBe("A")
  })

  test("restores the draft of the session entered and preserves the one left", () => {
    const store = createDraftStore()
    store.stash("ses_a", draft("draft A", 3))
    expect(store.swap("ses_a", draft("typed in A"), "ses_b")).toBeUndefined()
    expect(store.read("ses_a")?.prompt.input).toBe("typed in A")
    expect(store.swap("ses_b", draft("typed in B"), "ses_a")?.prompt.input).toBe("typed in A")
    expect(store.read("ses_b")?.prompt.input).toBe("typed in B")
  })

  test("does not keep an empty draft", () => {
    const store = createDraftStore()
    store.stash("ses_a", draft("old"))
    expect(store.swap("ses_a", draft(""), "ses_b")).toBeUndefined()
    expect(store.read("ses_a")).toBeUndefined()
  })

  test("treats a missing draft as an empty composer when entering it", () => {
    const store = createDraftStore()
    expect(store.swap("ses_a", draft("something"), "ses_b")).toBeUndefined()
    expect(store.read("ses_a")?.prompt.input).toBe("something")
    expect(store.size).toBe(1)
  })

  test("round-trips cursor and parts on restore", () => {
    const store = createDraftStore()
    const withParts: Draft = { prompt: { input: "hello", parts: [], mode: "shell" }, cursor: 7 }
    store.stash("ses_a", withParts)
    expect(store.swap(undefined, undefined, "ses_a")).toEqual(withParts)
  })

  test("drops a draft on demand", () => {
    const store = createDraftStore()
    store.stash("ses_a", draft("gone"))
    store.drop("ses_a")
    expect(store.read("ses_a")).toBeUndefined()
    expect(store.size).toBe(0)
  })
})
