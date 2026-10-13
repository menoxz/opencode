import { describe, expect, test } from "vitest"
import {
  SETTINGS_SECTIONS,
  SETTING_SPECS,
  agentDisabled,
  agentModel,
  agentPatch,
  authBody,
  authMethods,
  isFormFillable,
  methodFields,
  methodLabel,
  providerIDs,
  settingDisplay,
  settingValue,
  type AuthMethod,
  type ProviderAuth,
  type SettingSpec,
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
  test("huit sections, dans l'ordre de fréquence d'usage", () => {
    // Huit — et c'est possible **parce que** la navigation est verticale : une colonne s'allonge
    // sans rien casser, là où une barre horizontale aurait produit deux rangées.
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual([
      "models",
      "general",
      "behavior",
      "tools",
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

describe("configuration d'un agent", () => {
  /** Relevé sur `GET /config` : la carte `agent` porte déjà des entrées. */
  const AGENT_MAP = {
    build: { model: "opencode-go/deepseek-v4.1-flash", temperature: 0.2 },
    plan: { model: "opencode-go/deepseek-v4.1-flash" },
    review: { disable: true },
  }

  test("le modèle d'un agent est lu, et une entrée absente ne casse rien", () => {
    expect(agentModel(AGENT_MAP.build)).toBe("opencode-go/deepseek-v4.1-flash")
    expect(agentModel(undefined)).toBe("")
    expect(agentModel({})).toBe("")
    expect(agentModel({ model: 42 })).toBe("")
  })

  test("la désactivation est lue, et vaut faux par défaut", () => {
    expect(agentDisabled(AGENT_MAP.review)).toBe(true)
    expect(agentDisabled(AGENT_MAP.build)).toBe(false)
    expect(agentDisabled(undefined)).toBe(false)
  })

  test("la carte ENTIÈRE est envoyée : c'est ce qui évite d'écraser les autres agents", () => {
    // Sans cela, un serveur qui REMPLACE la carte perdrait plan et review.
    const patch = agentPatch(AGENT_MAP, "build", { model: "autre/modele" })
    expect(Object.keys(patch).sort()).toEqual(["build", "plan", "review"])
    expect(agentModel(patch.plan)).toBe("opencode-go/deepseek-v4.1-flash")
    expect(agentDisabled(patch.review)).toBe(true)
  })

  test("les autres clés de l'agent modifié survivent", () => {
    const patch = agentPatch(AGENT_MAP, "build", { model: "autre/modele" })
    expect((patch.build as Record<string, unknown>).temperature).toBe(0.2)
    expect(agentModel(patch.build)).toBe("autre/modele")
  })

  test("un agent absent de la carte peut être configuré", () => {
    const patch = agentPatch(AGENT_MAP, "nouveau", { model: "x/y" })
    expect(agentModel(patch.nouveau)).toBe("x/y")
    expect(Object.keys(patch)).toHaveLength(4)
  })

  test("une carte absente ne casse rien", () => {
    const patch = agentPatch(undefined, "build", { model: "x/y" })
    expect(agentModel(patch.build)).toBe("x/y")
  })

  test("un modèle vidé RETIRE la clé au lieu d'écrire un modèle nommé « vide »", () => {
    const patch = agentPatch(AGENT_MAP, "build", { model: "" })
    expect("model" in (patch.build as Record<string, unknown>)).toBe(false)
    expect(agentModel(patch.build)).toBe("")
  })

  test("la carte d'origine n'est pas modifiée en place", () => {
    // Un patch qui mute son entrée est un piège : le signal SolidJS ne verrait aucun changement.
    agentPatch(AGENT_MAP, "build", { model: "autre/modele" })
    expect(agentModel(AGENT_MAP.build)).toBe("opencode-go/deepseek-v4.1-flash")
  })
})

describe("réglages déclarés", () => {
  const TOGGLE: SettingSpec = { key: "snapshot", label: "instantanés", desc: "d", kind: "toggle" }
  const TEXT: SettingSpec = { key: "model", label: "modèle", desc: "d", kind: "text" }
  const SELECT: SettingSpec = {
    key: "share",
    label: "partage",
    desc: "d",
    kind: "select",
    options: [
      { value: "manual", label: "demander avant" },
      { value: "disabled", label: "ne jamais publier" },
    ],
  }

  test("un interrupteur écrit un booléen, jamais la chaîne « true »", () => {
    // Une chaîne serait acceptée par le serveur puis relue comme fausse : le réglage semblerait
    // enregistré sans l'être.
    expect(settingValue(TOGGLE, true)).toBe(true)
    expect(settingValue(TOGGLE, "true")).toBe(true)
    expect(settingValue(TOGGLE, "false")).toBe(false)
    expect(settingValue(TOGGLE, false)).toBe(false)
  })

  test("une liste de choix écrit sa valeur, et un choix booléen écrit le booléen", () => {
    expect(settingValue(SELECT, "manual")).toBe("manual")
    expect(settingValue(SELECT, "notify")).toBe("notify")
    expect(settingValue(SELECT, "true")).toBe(true)
    expect(settingValue(SELECT, "false")).toBe(false)
  })

  test("un champ écrit la chaîne, espaces retirés", () => {
    expect(settingValue(TEXT, "  a/b  ")).toBe("a/b")
  })

  test("l'affichage d'un interrupteur est « true » ou « false »", () => {
    expect(settingDisplay(TOGGLE, true)).toBe("true")
    expect(settingDisplay(TOGGLE, undefined)).toBe("false")
  })

  test("un choix sans valeur connue retombe sur son premier choix, jamais sur du vide", () => {
    expect(settingDisplay(SELECT, undefined)).toBe("manual")
  })

  test("chaque réglage déclaré porte une clé, un libellé et une raison d'être", () => {
    // C'est la règle de la cible : rien n'est exposé sans pouvoir dire pourquoi.
    for (const specs of Object.values(SETTING_SPECS)) {
      for (const spec of specs ?? []) {
        expect(spec.key.length).toBeGreaterThan(0)
        expect(spec.label.length).toBeGreaterThan(0)
        expect(spec.desc.length).toBeGreaterThan(0)
        if (spec.kind === "select") expect((spec.options ?? []).length).toBeGreaterThan(1)
      }
    }
  })

  test("toutes les clés déclarées existent dans le schéma Config mesuré", () => {
    // Mesuré sur GET /doc : Config a 37 clés. Une clé inventée écrirait une valeur que le serveur
    // ignorerait en silence — exactement le défaut qu'on traque.
    const CONFIG_KEYS = [
      "model",
      "small_model",
      "default_agent",
      "username",
      "shell",
      "share",
      "autoshare",
      "autoupdate",
      "snapshot",
      "formatter",
      "lsp",
    ]
    for (const specs of Object.values(SETTING_SPECS)) {
      for (const spec of specs ?? []) expect(CONFIG_KEYS).toContain(spec.key)
    }
  })

  test("les quatre sections à réglages simples sont couvertes", () => {
    expect(Object.keys(SETTING_SPECS).sort()).toEqual(["behavior", "general", "models", "tools"])
  })
})
