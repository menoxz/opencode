import { describe, expect, test } from "vitest"
import {
  GENERAL_SETTINGS,
  SETTINGS_SECTIONS,
  SETTING_SPECS,
  agentChoices,
  agentDisabled,
  agentModel,
  agentPatch,
  authBody,
  authMethods,
  isFormFillable,
  methodFields,
  methodLabel,
  modelCatalog,
  providerIDs,
  settingDisplay,
  settingGroups,
  settingValue,
  shellChoices,
  withValue,
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
  test("sept sections, dans l'ordre de fréquence d'usage", () => {
    // **Sept**, et non huit : `models` n'est plus une section. Ce n'était pas une catégorie mais un
    // objet — les trois clés qu'elle portait règlent ce qu'une nouvelle session prend par défaut,
    // donc elles vivent dans `general`. Une section nommée d'après la chose range le réglage à côté
    // de la question qu'il répond.
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual([
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

  test("chaque section porte une icône, et deux sections ne partagent pas la même", () => {
    // Sept libellés dans une colonne se retrouvent en relisant la colonne ; sept formes se
    // reconnaissent sans être lues. Une icône dupliquée annulerait exactement ce gain.
    const icons = SETTINGS_SECTIONS.map((section) => section.icon)
    expect(icons).toEqual(["general", "behavior", "tools", "providers", "agents", "mcp", "plugins"])
    expect(new Set(icons).size).toBe(icons.length)
  })

  test("les libellés d'écran sont en anglais — c'est la langue de l'interface", () => {
    for (const section of SETTINGS_SECTIONS) expect(section.label).not.toMatch(/[àâäéèêëîïôöùûüç]/i)
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
    expect(methodLabel({ type: "api" })).toBe("API key")
    expect(methodLabel({ type: "oauth" })).toBe("Connect")
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
    expect(fields).toEqual([{ key: "key", label: "API key", secret: true }])
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
        // Un `select` a ses choix **dans la donnée** (fixes) ou **chez le serveur** (une source) :
        // l'un des deux, jamais aucun — sinon le contrôle serait un menu vide.
        if (spec.kind === "select") expect(Boolean(spec.source) || (spec.options ?? []).length > 1).toBe(true)
      }
    }
  })

  test("les quatre réglages à ensemble fini déclarent une source, et pas des choix en dur", () => {
    // Modèles, agent par défaut, interpréteur : leurs valeurs valides sont publiées par le serveur.
    // Les écrire dans la donnée les figerait au jour où on les recopie.
    const sourced = GENERAL_SETTINGS.filter((spec) => spec.source).map((spec) => [spec.key, spec.source])
    expect(sourced).toEqual([
      ["model", "models"],
      ["small_model", "models"],
      ["default_agent", "agents"],
      ["shell", "shells"],
    ])
    for (const spec of GENERAL_SETTINGS.filter((s) => s.source)) {
      expect(spec.kind).toBe("select")
      expect(spec.options).toBeUndefined()
    }
    // `username` reste un champ : il n'a pas d'ensemble fini.
    expect(GENERAL_SETTINGS.find((spec) => spec.key === "username")?.kind).toBe("text")
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

  test("les trois sections à réglages simples sont couvertes", () => {
    expect(Object.keys(SETTING_SPECS).sort()).toEqual(["behavior", "general", "tools"])
  })
})

describe("la page General", () => {
  test("elle a absorbé les trois réglages de l'ancienne section « models »", () => {
    // L'exigence, telle qu'elle a été posée : tout ce qui était dans Models vit dans General.
    const keys = GENERAL_SETTINGS.map((spec) => spec.key)
    expect(keys).toEqual(expect.arrayContaining(["model", "small_model", "default_agent"]))
  })

  test("les trois défauts forment le premier bloc, sous un seul titre", () => {
    // En tête de page : c'est ce qu'on vient changer le plus souvent dans tout le panneau.
    const blocks = settingGroups(GENERAL_SETTINGS)
    expect(blocks[0].title).toBe("Defaults")
    expect(blocks[0].specs.map((spec) => spec.key)).toEqual(["model", "small_model", "default_agent"])
  })

  test("settingGroups garde l'ordre du fichier et ne fusionne que des voisins", () => {
    const specs: SettingSpec[] = [
      { key: "a", label: "A", desc: "d", kind: "text", group: "One" },
      { key: "b", label: "B", desc: "d", kind: "text", group: "One" },
      { key: "c", label: "C", desc: "d", kind: "text", group: "Two" },
      { key: "d", label: "D", desc: "d", kind: "text" },
    ]
    const blocks = settingGroups(specs)
    expect(blocks.map((block) => block.title)).toEqual(["One", "Two", undefined])
    expect(blocks[0].specs.map((spec) => spec.key)).toEqual(["a", "b"])
    expect(blocks[2].specs.map((spec) => spec.key)).toEqual(["d"])
  })

  test("un groupe qui réapparaît plus loin ne remonte pas : l'ordre d'écran est celui du fichier", () => {
    // Trier par groupe ferait passer « Environment » au-dessus de « Defaults ».
    const specs: SettingSpec[] = [
      { key: "a", label: "A", desc: "d", kind: "text", group: "One" },
      { key: "b", label: "B", desc: "d", kind: "text", group: "Two" },
      { key: "c", label: "C", desc: "d", kind: "text", group: "One" },
    ]
    expect(settingGroups(specs).map((block) => block.title)).toEqual(["One", "Two", "One"])
  })

  test("tout libellé affiché est en anglais", () => {
    for (const specs of Object.values(SETTING_SPECS)) {
      for (const spec of specs ?? []) {
        expect(spec.label).not.toMatch(/[àâäéèêëîïôöùûüç]/i)
        expect(spec.desc).not.toMatch(/[àâäéèêëîïôöùûüç]/i)
        for (const option of spec.options ?? []) expect(option.label).not.toMatch(/[àâäéèêëîïôöùûüç]/i)
      }
    }
  })
})

/* =============================================================================
   Les listes de choix.

   La correction qui a motivé ce bloc : un champ de texte pour un modèle oblige à aller chercher
   `opencode-go/deepseek-v4.1-flash` ailleurs et à le recopier sans faute, alors que le serveur
   publie la liste. Quand l'ensemble des valeurs valides est connu, le contrôle est un **choix**.
   ============================================================================= */

describe("la projection des modèles", () => {
  test("le libellé porte le fournisseur, la valeur est `provider/modèle`", () => {
    const catalog = modelCatalog({
      providers: [
        {
          id: "opencode-go",
          name: "OpenCode Go",
          models: { "deepseek-v4.1-flash": { name: "DeepSeek V4.1 Flash" }, zeta: {} },
        },
      ],
    })
    expect(catalog).toEqual([
      { value: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash · OpenCode Go" },
      { value: "opencode-go/zeta", label: "zeta · OpenCode Go" },
    ])
  })

  test("un même nom chez deux fournisseurs donne **deux libellés distincts**", () => {
    // Le défaut mesuré : 696 modèles pour **509 libellés distincts** — et les deux modèles
    // réellement configurés partageaient tous deux « DeepSeek V4.1 Flash » avec trois autres. Fermé,
    // un `<select>` n'affiche que le libellé : sans le fournisseur, cinq valeurs différentes
    // s'écriraient pareil, et l'utilisateur ne pourrait pas dire ce qu'il a choisi.
    const catalog = modelCatalog({
      providers: [
        { id: "opencode-go", name: "OpenCode Go", models: { "deepseek-v4.1-flash": { name: "DeepSeek V4.1 Flash" } } },
        { id: "nvidia", name: "Nvidia", models: { "deepseek-ai/deepseek-v4.1-flash": { name: "DeepSeek V4.1 Flash" } } },
      ],
    })
    expect(catalog.map((entry) => entry.label)).toEqual([
      "DeepSeek V4.1 Flash · Nvidia",
      "DeepSeek V4.1 Flash · OpenCode Go",
    ])
    expect(new Set(catalog.map((entry) => entry.label)).size).toBe(catalog.length)
  })

  test("sans libellé de modèle, l'identifiant fait office de nom", () => {
    expect(modelCatalog({ providers: [{ id: "p", models: { "m-1": {} } }] })).toEqual([
      { value: "p/m-1", label: "m-1 · p" },
    ])
  })

  test("**les clés des fournisseurs ne passent pas la projection**", () => {
    // Mesuré : `GET /config/providers` porte 7 champs `key`/`apiKey` en clair et six chaînes `sk-…`.
    // La projection ne lit que `name`, `id` et le nom du fournisseur — ce test est ce qui l'empêche de
    // dériver, parce qu'une charge porteuse de secrets ne doit jamais approcher un signal.
    const catalog = modelCatalog({
      providers: [
        {
          id: "orcarouter",
          name: "OrcaRouter",
          key: "sk-orca-SECRET",
          keys: ["sk-orca-SECRET"],
          options: {},
          models: { "grok/grok-4.3": { id: "grok/grok-4.3", name: "Grok 4.3", apiKey: "sk-nested-SECRET" } },
        },
      ],
    })
    expect(catalog).toEqual([{ value: "orcarouter/grok/grok-4.3", label: "Grok 4.3 · OrcaRouter" }])
    expect(JSON.stringify(catalog)).not.toContain("sk-")
    expect(JSON.stringify(catalog)).not.toContain("SECRET")
  })

  test("une réponse absente ou malformée rend une liste vide, jamais une erreur", () => {
    expect(modelCatalog(undefined)).toEqual([])
    expect(modelCatalog({})).toEqual([])
    expect(modelCatalog({ providers: "non" })).toEqual([])
    expect(modelCatalog({ providers: [null, 42, { id: "sans-modeles" }] })).toEqual([])
  })
})

describe("la projection des agents", () => {
  test("seuls les primaires non masqués sont proposés", () => {
    // Le schéma est explicite : `default_agent` doit être un agent **primaire**. Proposer un
    // sous-agent serait proposer une valeur que le serveur refuse.
    expect(
      agentChoices([
        { name: "build", mode: "primary" },
        { name: "zx", mode: "primary" },
        { name: "general", mode: "subagent" },
        { name: "compaction", mode: "primary", hidden: true },
        { name: "sans-mode" },
      ]),
    ).toEqual([
      { value: "build", label: "build" },
      { value: "zx", label: "zx" },
    ])
  })

  test("une réponse absente rend une liste vide", () => {
    expect(agentChoices(undefined)).toEqual([])
    expect(agentChoices([{ mode: "primary" }])).toEqual([])
  })
})

describe("la projection des interpréteurs", () => {
  test("la valeur est le **nom**, et un interpréteur inacceptable est écarté", () => {
    // `Shell.preferred` → `resolve` essaie `which(nom)` : un nom survit à une réinstallation qui
    // change le chemin. `acceptable: false` veut dire que le serveur ne peut pas exécuter avec.
    expect(
      shellChoices([
        { name: "pwsh", path: "C:\\Program Files\\PowerShell\\7\\pwsh.EXE", acceptable: true },
        { name: "cmd", path: "C:\\WINDOWS\\system32\\cmd.exe", acceptable: true },
        { name: "casse", path: "C:\\casse.exe", acceptable: false },
      ]),
    ).toEqual([
      { value: "cmd", label: "cmd" },
      { value: "pwsh", label: "pwsh" },
    ])
  })

  test("sans nom, le chemin fait la valeur — jamais une option vide", () => {
    expect(shellChoices([{ path: "C:\\nu.exe" }])).toEqual([{ value: "C:\\nu.exe", label: "C:\\nu.exe" }])
  })

  test("une réponse absente rend une liste vide", () => {
    expect(shellChoices(undefined)).toEqual([])
    expect(shellChoices("non")).toEqual([])
  })
})

describe("withValue", () => {
  test("la valeur courante absente de la liste s'affiche quand même", () => {
    // Sans cela, un réglage que le serveur accepte mais ne publie pas disparaîtrait de l'écran, et
    // le contrôle afficherait **une autre valeur que celle réellement écrite**.
    expect(withValue([{ value: "p/a", label: "a" }], "p/inconnu")).toEqual([
      { value: "p/inconnu", label: "p/inconnu" },
      { value: "p/a", label: "a" },
    ])
  })

  test("aucun doublon quand elle y est déjà", () => {
    const choices = [{ value: "p/a", label: "a" }]
    expect(withValue(choices, "p/a")).toEqual(choices)
  })

  test("une valeur vide n'ajoute rien : l'option vide est déjà là", () => {
    const choices = [{ value: "p/a", label: "a" }]
    expect(withValue(choices, "")).toEqual(choices)
    expect(withValue(choices, "   ")).toEqual(choices)
  })
})

describe("l'affichage d'un modèle écrit en objet", () => {
  test("`{ providerID, modelID }` se lit « provider/modèle », jamais « [object Object] »", () => {
    // Le SDK déclare les deux formes pour `model` ; sans ce cas, le contrôle affichait le résultat de
    // `String(objet)`.
    const spec: SettingSpec = { key: "model", label: "m", desc: "d", kind: "select", source: "models" }
    expect(settingDisplay(spec, { providerID: "opencode-go", modelID: "deepseek-v4.1-flash" })).toBe(
      "opencode-go/deepseek-v4.1-flash",
    )
    expect(settingDisplay(spec, { id: "seul-id" })).toBe("seul-id")
    expect(settingDisplay(spec, {})).toBe("")
  })
})
