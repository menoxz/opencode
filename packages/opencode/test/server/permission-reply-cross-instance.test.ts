import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { replyAnywhere } from "../../src/server/routes/instance/httpapi/handlers/permission"

// Regression: the TUI permission panel is fed by the unfiltered global event stream, so it shows
// the requests of every folder, while its reply used to be routed by the client's single
// `directory`. A request belonging to another folder therefore answered 404 PermissionNotFound,
// the client swallowed it, and the panel stayed identical — Allow once, Allow always and Reject
// all did nothing. `replyAnywhere` looks the request up in the ambient instance first, then in
// the other live instances.
function run(input: { skip?: string; directories: string[]; holder: string }) {
  const tried: string[] = []
  return Effect.runPromise(
    replyAnywhere({
      skip: input.skip,
      directories: input.directories,
      apply: (directory) =>
        Effect.sync(() => {
          const key = directory ?? "ambient"
          tried.push(key)
          return key === input.holder ? ("handled" as const) : undefined
        }),
    }).pipe(Effect.map((result) => ({ result, tried }))),
  )
}

describe("replyAnywhere", () => {
  test("answers in the ambient instance without touching the others", async () => {
    const out = await run({ directories: ["/a", "/b"], holder: "ambient" })
    expect(out.result).toBe("handled")
    expect(out.tried).toEqual(["ambient"])
  })

  test("finds the request in another live instance when the client names the wrong folder", async () => {
    const out = await run({ skip: "/a", directories: ["/a", "/b", "/c"], holder: "/c" })
    expect(out.result).toBe("handled")
    // /a is the ambient folder: it was already tried first and is not retried.
    expect(out.tried).toEqual(["ambient", "/b", "/c"])
  })

  test("returns undefined when no instance holds the request", async () => {
    const out = await run({ skip: "/a", directories: ["/a", "/b"], holder: "/none" })
    expect(out.result).toBeUndefined()
    expect(out.tried).toEqual(["ambient", "/b"])
  })

  test("stops at the first instance that holds the request", async () => {
    const out = await run({ directories: ["/a", "/b", "/c"], holder: "/b" })
    expect(out.result).toBe("handled")
    expect(out.tried).toEqual(["ambient", "/a", "/b"])
  })
})
