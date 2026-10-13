import { describe, expect, test } from "vitest"
import {
  SETTINGS_SECTIONS,
  authBody,
  authMethods,
  isFormFillable,
  methodFields,
  methodLabel,
  providerIDs,
  type AuthMethod,
  type ProviderAuth,
} from "./settings"

/** Relevé tel quel sur `GET /provider/auth` (8 fournisseurs). */
const AUTH: ProviderAuth = {
  openai: [
    { type: "oauth", label: "ChatGPT Pro/Plus (browser)" },
    { type: "oauth", label: "ChatGPT Pro/Plus (headless)" },
    { type: "api", label: "Manually enter API Key" },
  ],
  gitlab: [
    { type: "oauth", label: "GitLab OAuth", prompts: [] },
    {
      type: "api",
      label: "GitLab Personal Access Token",
      prompts: [
        { type: "text", key: "token", message: "Personal Access Token", placeholder: "glpat-xxxxxxxxxxxxxxxxxxxx" },
      ],
    },
  ],
}

describe("sections", () => {
  test("cinq sections, dans l'ordre de fréquence d'usage", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual([
      "general",
      "providers",
      "agents",
      "mcp",
      "plugins",
    ])
  })

  test("chaque section porte un libellé d'écran et une raison d'être", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0)
      expect(section.hint.length).toBeGreaterThan(0)
    }
  })
})

describe("méthodes d'authentification", () => {
  test("les fournisseurs sont triés et sans doublon", () => {
    expect(providerIDs(AUTH)).toEqual(["gitlab", "openai"])
  })

  test("un fournisseur sans méthode ne produit pas de ligne", () => {
    expect(providerIDs({ vide: [], plein: [{ type: "api" }] })).toEqual(["plein"])
  })

  test("une réponse absente ou malformée rend une liste vide, jamais une erreur", () => {
    expect(providerIDs(undefined)).toEqual([])
    expect(authMethods(undefined, "openai")).toEqual([])
    expect(authMethods(AUTH, "inconnu")).toEqual([])
  })

  test("le libellé du serveur est préféré à tout libellé inventé", () => {
    const method: AuthMethod = { type: "api", label: "GitLab Personal Access Token" }
    expect(methodLabel(method)).toBe("GitLab Personal Access Token")
  })

  test("sans libellé du serveur, on en donne un qui dit ce qui se passe", () => {
    expect(methodLabel({ type: "api" })).toBe("clé d'API")
    expect(methodLabel({ type: "oauth" })).toBe("se connecter")
  })
})

describe("formulaires", () => {
  test("oauth ne se remplit pas : il se connecte", () => {
    // Un formulaire sur oauth serait un mensonge : il n'y a rien à saisir.
    const oauth: AuthMethod = { type: "oauth", label: "GitLab OAuth" }
    expect(isFormFillable(oauth)).toBe(false)
    expect(methodFields(oauth)).toEqual([])
    expect(authBody(oauth, { token: "x" })).toBeUndefined()
  })

  test("les champs déclarés par le serveur sont repris tels quels", () => {
    const [field] = methodFields(AUTH.gitlab[1])
    expect(field.key).toBe("token")
    expect(field.label).toBe("Personal Access Token")
    expect(field.placeholder).toBe("glpat-xxxxxxxxxxxxxxxxxxxx")
    expect(field.secret).toBe(true)
  })

  test("un serveur muet n'est pas deviné : le contrat dit le champ", () => {
    // openai : « Manually enter API Key » ne déclare aucun prompt ; ApiAuth attend `key`.
    const fields = methodFields(AUTH.openai[2])
    expect(fields).toEqual([{ key: "key", label: "clé d'API", secret: true }])
  })

  test("un nom d'utilisateur ne se masque pas, un jeton si", () => {
    const [user] = methodFields({ type: "api", prompts: [{ key: "username", message: "Utilisateur" }] })
    const [token] = methodFields({ type: "api", prompts: [{ key: "apiKey", message: "Clé" }] })
    expect(user.secret).toBe(false)
    expect(token.secret).toBe(true)
  })

  test("le corps envoyé respecte la forme ApiAuth", () => {
    expect(authBody(AUTH.gitlab[1], { token: "glpat-abc" })).toEqual({ type: "api", key: "glpat-abc" })
    expect(authBody(AUTH.openai[2], { key: "sk-abc" })).toEqual({ type: "api", key: "sk-abc" })
  })

  test("un champ vide n'écrit rien : écrire une clé vide écraserait une clé valide", () => {
    expect(authBody(AUTH.gitlab[1], { token: "   " })).toBeUndefined()
    expect(authBody(AUTH.openai[2], {})).toBeUndefined()
  })

  test("les espaces autour d'une clé collée sont retirés", () => {
    expect(authBody(AUTH.openai[2], { key: "  sk-abc  " })).toEqual({ type: "api", key: "sk-abc" })
  })
})
