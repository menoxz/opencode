import { describe, expect, test } from "bun:test"
import {
  attestVersion,
  isVersionMismatch,
  readServerVersion,
  versionNotice,
} from "../../../src/cli/cmd/tui/server-version"

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

describe("tui.server-version", () => {
  test("classe un couple aligné, un couple different et une version absente", () => {
    expect(attestVersion("2.4.15", "2.4.15")).toBe("same")
    expect(attestVersion("2.4.15", "2.4.13")).toBe("different")
    expect(attestVersion("2.4.15", "2.4.16")).toBe("different")
    // Une version absente n'est jamais une correspondance : c'est une absence de reponse.
    expect(attestVersion("2.4.15", undefined)).toBe("unknown")
    expect(attestVersion("2.4.15", "")).toBe("unknown")
  })

  test("ne signale rien quand les versions sont alignées ou inconnues", () => {
    expect(versionNotice("2.4.15", "2.4.15")).toBeUndefined()
    expect(versionNotice("2.4.15", undefined)).toBeUndefined()
  })

  // C'est la ligne qui rend une mise a jour silencieusement inoperante visible.
  test("nomme les deux versions quand le serveur qui sert n'est pas le binaire deploye", () => {
    const notice = versionNotice("2.4.15", "2.4.13")
    expect(notice).toContain("2.4.13")
    expect(notice).toContain("2.4.15")
    expect(isVersionMismatch("2.4.15", "2.4.13")).toBe(true)
    expect(isVersionMismatch("2.4.15", "2.4.15")).toBe(false)
  })

  test("lit la version publiee par /global/health", async () => {
    const seen: string[] = []
    const version = await readServerVersion({
      url: "http://localhost:4096",
      fetch: (async (url: string) => {
        seen.push(String(url))
        return jsonResponse({ healthy: true, version: "2.4.13" })
      }) as unknown as typeof fetch,
    })
    expect(version).toBe("2.4.13")
    expect(seen).toEqual(["http://localhost:4096/global/health"])
  })

  test("toute lecture ratee vaut unknown plutot qu'une correspondance", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => jsonResponse({}, false),
      async () => jsonResponse({ healthy: true }),
      async () => jsonResponse({ healthy: true, version: 42 }),
      async () => jsonResponse(null),
      async () => {
        throw new Error("injoignable")
      },
      async () => {
        return {
          ok: true,
          json: async () => {
            throw new Error("corps illisible")
          },
        } as unknown as Response
      },
    ]
    for (const call of cases) {
      expect(await readServerVersion({ url: "http://localhost:4096", fetch: call as unknown as typeof fetch })).toBeUndefined()
    }
  })
})
