import { describe, expect, test } from "vitest"
import { authHeaders, basicToken, DEFAULT_USERNAME, hasCredentials, toBase64, withAuthToken } from "./auth"

describe("toBase64", () => {
  test("produit du base64 valide", () => {
    expect(toBase64("opencode:pass")).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  })

  test("fait l'aller-retour en ASCII", () => {
    expect(atob(toBase64("opencode:secret"))).toBe("opencode:secret")
  })

  test("encode en UTF-8, pas en Latin-1", () => {
    // `btoa` seul leverait ici : « é » sort de Latin-1 une fois encode en UTF-8.
    const bytes = atob(toBase64("é"))
    expect(bytes.charCodeAt(0)).toBe(0xc3)
    expect(bytes.charCodeAt(1)).toBe(0xa9)
    expect(() => toBase64("mot de passe accentué: éàü")).not.toThrow()
  })

  test("correspond au format attendu par le serveur", () => {
    // server/auth.ts:41 construit `Basic ${base64(user:pass)}` avec Buffer (UTF-8).
    expect(basicToken({ username: "opencode", password: "pass" })).toBe(`Basic ${toBase64("opencode:pass")}`)
  })
})

describe("hasCredentials", () => {
  test("un mot de passe vide n'authentifie rien", () => {
    expect(hasCredentials(undefined)).toBe(false)
    expect(hasCredentials({})).toBe(false)
    expect(hasCredentials({ username: "opencode" })).toBe(false)
    expect(hasCredentials({ password: "" })).toBe(false)
    expect(hasCredentials({ password: "x" })).toBe(true)
  })
})

describe("authHeaders", () => {
  test("aucun en-tete quand le serveur n'exige rien", () => {
    expect(authHeaders(undefined)).toEqual({})
    expect(authHeaders({ password: "" })).toEqual({})
  })

  test("en-tete Basic quand un mot de passe est fourni", () => {
    expect(authHeaders({ username: "u", password: "p" })).toEqual({
      authorization: `Basic ${toBase64("u:p")}`,
    })
  })

  test("retombe sur le nom d'utilisateur par defaut du serveur", () => {
    expect(authHeaders({ password: "p" })).toEqual({
      authorization: `Basic ${toBase64(`${DEFAULT_USERNAME}:p`)}`,
    })
    expect(DEFAULT_USERNAME).toBe("opencode")
  })

  test("un nom d'utilisateur en espaces vaut absent", () => {
    expect(authHeaders({ username: "   ", password: "p" })).toEqual({
      authorization: `Basic ${toBase64(`${DEFAULT_USERNAME}:p`)}`,
    })
  })
})

describe("withAuthToken", () => {
  test("sans identifiants, l'URL est inchangee", () => {
    expect(withAuthToken("/event", undefined)).toBe("/event")
    expect(withAuthToken("http://h/event", { password: "" })).toBe("http://h/event")
  })

  test("ajoute le jeton avec un ? quand l'URL n'a pas de requete", () => {
    expect(withAuthToken("/event", { password: "p" })).toBe(
      `/event?auth_token=${encodeURIComponent(toBase64(`${DEFAULT_USERNAME}:p`))}`,
    )
  })

  test("ajoute le jeton avec un & quand l'URL a deja une requete", () => {
    const url = withAuthToken("/event?directory=C%3A%5Ctmp", { password: "p" })
    expect(url.startsWith("/event?directory=C%3A%5Ctmp&auth_token=")).toBe(true)
    expect(url.split("&")).toHaveLength(2)
  })

  test("le jeton est encode pour l'URL", () => {
    // Le base64 contient des « + » et « / » : non encodes, ils cassent la query.
    const token = toBase64(`${DEFAULT_USERNAME}:p+a/b`)
    const url = withAuthToken("/event", { password: "p+a/b" })
    expect(url).toContain(encodeURIComponent(token))
    expect(new URLSearchParams(url.split("?")[1]).get("auth_token")).toBe(token)
  })

  test("le parametre porte exactement le nom attendu par le serveur", () => {
    // authorization.ts:9 — `const AUTH_TOKEN_QUERY = "auth_token"`.
    expect(withAuthToken("/event", { password: "p" })).toContain("auth_token=")
  })
})
