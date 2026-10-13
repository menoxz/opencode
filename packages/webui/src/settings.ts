/**
 * Les réglages — la couche qui **gère** la configuration.
 *
 * Le module `config.ts` consulte ; celui-ci écrit. La distinction n'est pas cosmétique : elle vient
 * d'une erreur corrigée. J'avais conclu « aucun point d'écriture côté serveur » parce que je
 * n'avais regardé que les routes GET que je consommais. Le serveur écrit depuis le début :
 *
 *   PATCH /config | PATCH /global/config   corps `Config` (37 clés)
 *   PUT   /auth/{providerID}               corps `Auth` = OAuth | ApiAuth | WellKnownAuth
 *   POST  /auth/{providerID}/keys          ajouter une clé
 *   POST  /mcp/{name}/auth (+ callback)    authentifier un serveur MCP
 *   POST  /plugin | DELETE /plugin/{spec}  corps `{ spec }`
 *
 * `GET /provider/auth` rend, pour chaque fournisseur, ses méthodes **réellement** disponibles avec
 * leurs champs. Les formulaires se déduisent de cette réponse : on n'invente pas les champs.
 */

export type SettingsSectionKey =
  | "models"
  | "general"
  | "behavior"
  | "tools"
  | "providers"
  | "agents"
  | "mcp"
  | "plugins"

export type SettingsSection = {
  key: SettingsSectionKey
  label: string
  hint: string
}

/**
 * L'ordre suit la fréquence d'usage, comme le rail : on change de modèle bien plus souvent qu'on
 * n'ajoute un plugin.
 *
 * Huit sections — et c'est possible **parce que** la navigation est verticale : une colonne
 * s'allonge sans rien casser, là où une barre horizontale aurait produit deux rangées (CIBLE §13).
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "models", label: "modèles", hint: "les modèles des sessions et des tâches courtes" },
  { key: "general", label: "général", hint: "identité et environnement" },
  { key: "behavior", label: "comportement", hint: "ce que le harnais fait sans demander" },
  { key: "tools", label: "outils", hint: "formateur et serveur de langage" },
  { key: "providers", label: "fournisseurs", hint: "clés et connexions des fournisseurs de modèles" },
  { key: "agents", label: "agents", hint: "modèle et état de chaque agent" },
  { key: "mcp", label: "serveurs MCP", hint: "état et authentification" },
  { key: "plugins", label: "plugins", hint: "ajouter ou retirer un plugin" },
]

/* =============================================================================
   Les réglages, **déclarés comme données**.

   Pourquoi des données et pas du JSX : un réglage se décrit par quatre choses — sa clé dans
   `Config`, son libellé d'écran, ce qu'il fait, et le contrôle qui le porte. Écrit en JSX, chacun
   de ces quatre points se re-décide à chaque ligne, et les libellés divergent. Écrit en données, ils
   se relisent d'un coup, et le composant ne fait que rendre.

   Mesuré : `Config` a **37 clés**. Onze sont réglables simplement (chaîne, booléen, nombre, liste)
   et quelques-unes sont des énumérations. Les autres sont des structures (cartes d'agents, de
   fournisseurs, de serveurs MCP) — elles ont leur propre section, parce qu'elles ne se règlent pas
   sur une ligne. `logLevel` et `experimental` ne sont **pas** exposés : ce sont des réglages de
   diagnostic, et les exposer sans les expliquer serait exactement le défaut qu'on corrige.
   ============================================================================= */

export type SettingKind = "text" | "toggle" | "select"

export type SettingSpec = {
  /** La clé exacte dans `Config`. */
  key: string
  label: string
  desc: string
  kind: SettingKind
  /** Pour un `select` : les choix, avec leur libellé d'écran. */
  options?: Array<{ value: string; label: string }>
  /** Ce qui s'affiche quand la clé est absente — jamais un champ vide sans repère. */
  placeholder?: string
}

/** Les modèles : trois clés, une seule question — « avec quoi travailler ». */
export const MODEL_SETTINGS: SettingSpec[] = [
  {
    key: "model",
    label: "modèle par défaut",
    desc: "le modèle qu'utilise une nouvelle session",
    kind: "text",
    placeholder: "provider/modèle",
  },
  {
    key: "small_model",
    label: "petit modèle",
    desc: "les tâches courtes : titres, résumés, recherches",
    kind: "text",
    placeholder: "défaut du serveur",
  },
  {
    key: "default_agent",
    label: "agent par défaut",
    desc: "l'agent qu'incarne une nouvelle session",
    kind: "text",
    placeholder: "défaut du serveur",
  },
]

/** L'identité et l'environnement. */
export const GENERAL_SETTINGS: SettingSpec[] = [
  {
    key: "username",
    label: "utilisateur",
    desc: "le nom qui signe les messages",
    kind: "text",
    placeholder: "non renseigné",
  },
  {
    key: "shell",
    label: "interpréteur",
    desc: "le shell qui exécute les commandes",
    kind: "text",
    placeholder: "défaut du système",
  },
]

/**
 * Ce que le harnais fait **sans demander**. C'est le seul groupe où un mauvais réglage a des
 * conséquences visibles par d'autres : `share` publie une conversation, `autoupdate` change le
 * binaire. Les descriptions le disent.
 */
export const BEHAVIOR_SETTINGS: SettingSpec[] = [
  {
    key: "share",
    label: "partage des sessions",
    desc: "publier une conversation, ou demander avant",
    kind: "select",
    options: [
      { value: "manual", label: "demander avant" },
      { value: "auto", label: "publier automatiquement" },
      { value: "disabled", label: "ne jamais publier" },
    ],
  },
  {
    key: "autoshare",
    label: "partage automatique",
    desc: "publier dès qu'une session est créée",
    kind: "toggle",
  },
  {
    key: "autoupdate",
    label: "mise à jour",
    desc: "installer les nouvelles versions",
    kind: "select",
    options: [
      { value: "true", label: "installer automatiquement" },
      { value: "notify", label: "seulement prévenir" },
      { value: "false", label: "ne pas vérifier" },
    ],
  },
  {
    key: "snapshot",
    label: "instantanés",
    desc: "enregistrer l'état des fichiers avant modification, pour pouvoir revenir",
    kind: "toggle",
  },
]

/** Les outils que l'on active ou coupe — `false` les désactive sans les désinstaller. */
export const TOOL_SETTINGS: SettingSpec[] = [
  {
    key: "formatter",
    label: "formateur",
    desc: "mettre en forme le code écrit",
    kind: "toggle",
  },
  {
    key: "lsp",
    label: "serveur de langage",
    desc: "analyse du code : erreurs, définitions, références",
    kind: "toggle",
  },
]

/** Toutes les lignes simples, par section — ce que le composant rend. */
export const SETTING_SPECS: Partial<Record<SettingsSectionKey, SettingSpec[]>> = {
  models: MODEL_SETTINGS,
  general: GENERAL_SETTINGS,
  behavior: BEHAVIOR_SETTINGS,
  tools: TOOL_SETTINGS,
}

/**
 * La valeur à écrire pour une clé, selon son contrôle.
 *
 * Un `toggle` écrit un **booléen**, jamais la chaîne `"true"` : le schéma attend un booléen, et une
 * chaîne serait acceptée par le serveur puis relue comme fausse. Un `select` dont l'option est
 * booléenne écrit le booléen correspondant.
 */
export function settingValue(spec: SettingSpec, raw: string | boolean): unknown {
  if (spec.kind === "toggle") return raw === true || raw === "true"
  if (spec.kind === "select") {
    if (raw === "true") return true
    if (raw === "false") return false
    return String(raw)
  }
  return String(raw).trim()
}

/** Ce qu'un contrôle doit afficher pour une valeur lue dans la configuration. */
export function settingDisplay(spec: SettingSpec, value: unknown): string {
  if (spec.kind === "toggle") return value === true ? "true" : "false"
  if (value === undefined || value === null) {
    // Un `select` sans valeur connue retombe sur son premier choix plutôt que sur du vide.
    return spec.kind === "select" ? (spec.options?.[0]?.value ?? "") : ""
  }
  return String(value)
}

/** Ce que le serveur déclare pour une méthode d'authentification. */
export type AuthPrompt = {
  type?: string
  key?: string
  message?: string
  placeholder?: string
}

export type AuthMethod = {
  type?: string
  label?: string
  prompts?: AuthPrompt[]
}

export type ProviderAuth = Record<string, AuthMethod[]>

/** Un champ de formulaire, prêt à rendre. */
export type AuthField = {
  key: string
  label: string
  placeholder?: string
  /** Un secret ne s'affiche jamais en clair dans le champ. */
  secret: boolean
}

/** `oauth` | `api` | autre — c'est ce qui décide si l'on remplit un formulaire ou si l'on connecte. */
export function methodKind(method: AuthMethod): string {
  return (method.type ?? "").trim() || "inconnu"
}

/**
 * Une méthode `oauth` **ne se remplit pas** : elle ouvre un parcours d'autorisation. Un formulaire
 * y serait un mensonge — il n'y a rien à saisir.
 */
export function isFormFillable(method: AuthMethod): boolean {
  return methodKind(method) === "api"
}

/** Le libellé vient du serveur quand il en donne un : c'est lui qui sait de quoi il parle. */
export function methodLabel(method: AuthMethod): string {
  const label = method.label?.trim()
  if (label) return label
  return isFormFillable(method) ? "clé d'API" : "se connecter"
}

/**
 * Les champs à demander.
 *
 * Le serveur déclare ses champs quand il en a (`gitlab` : `token`, avec son exemple) ; quand il n'en
 * déclare aucun (`openai` : « Manually enter API Key », sans `prompts`), le type `ApiAuth` dit le
 * seul champ attendu — `key`. On ne devine donc jamais : soit le serveur parle, soit le contrat parle.
 */
export function methodFields(method: AuthMethod): AuthField[] {
  const declared = Array.isArray(method.prompts)
    ? method.prompts.filter((prompt): prompt is AuthPrompt & { key: string } => Boolean(prompt?.key))
    : []
  if (declared.length > 0) {
    return declared.map((prompt) => ({
      key: prompt.key,
      label: prompt.message?.trim() || prompt.key,
      placeholder: prompt.placeholder,
      // Un jeton ou une clé ne s'affiche pas en clair ; un nom d'utilisateur, si.
      secret: /token|key|secret|password/i.test(prompt.key),
    }))
  }
  if (isFormFillable(method)) {
    return [{ key: "key", label: "clé d'API", secret: true }]
  }
  return []
}

/**
 * Le corps à envoyer à `PUT /auth/{providerID}`.
 *
 * `ApiAuth` attend `{ type: "api", key }`. Une méthode sans champ — ou un champ vide — ne produit
 * **rien** : mieux vaut ne pas écrire qu'écrire une clé vide, qui écraserait une clé valide.
 */
export function authBody(method: AuthMethod, values: Record<string, string>): Record<string, unknown> | undefined {
  if (!isFormFillable(method)) return undefined
  const fields = methodFields(method)
  if (fields.length === 0) return undefined
  const filled: Record<string, string> = {}
  for (const field of fields) {
    const value = values[field.key]?.trim()
    if (!value) return undefined
    filled[field.key] = value
  }
  // Le champ déclaré s'appelle parfois autrement (`token` chez gitlab) ; `ApiAuth` attend `key`.
  const key = filled.key ?? filled[fields[0].key]
  return { type: "api", key }
}

/** Les fournisseurs qui déclarent au moins une méthode. Vide = pas de section. */
export function providerIDs(auth: ProviderAuth | undefined): string[] {
  if (!auth || typeof auth !== "object") return []
  return Object.entries(auth)
    .filter(([, methods]) => Array.isArray(methods) && methods.length > 0)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right))
}

/** Les méthodes d'un fournisseur, ou une liste vide — jamais d'erreur sur une réponse inattendue. */
export function authMethods(auth: ProviderAuth | undefined, providerID: string): AuthMethod[] {
  const methods = auth?.[providerID]
  return Array.isArray(methods) ? methods : []
}

/* =============================================================================
   Les agents — les **configurer**, pas seulement les lister.

   `Config.agent` est une carte `Record<nom, AgentConfig>`. La question qui décide de tout : un
   `PATCH` **fusionne**-t-il ou **remplace**-t-il cette carte ? Je ne le suppose pas — la parade est
   la même dans les deux cas : **envoyer la carte entière**, modifiée. Si le serveur fusionne, le
   résultat est identique ; s'il remplace, aucun agent n'est perdu. Un patch partiel, lui, serait
   destructeur dans le second cas.
   ============================================================================= */

/** Le modèle déclaré pour un agent, ou une chaîne vide s'il n'en déclare pas. */
export function agentModel(entry: unknown): string {
  if (!entry || typeof entry !== "object") return ""
  const model = (entry as { model?: unknown }).model
  return typeof model === "string" ? model : ""
}

/** Un agent désactivé ne se propose plus ; le serveur le note `disable: true`. */
export function agentDisabled(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false
  return (entry as { disable?: unknown }).disable === true
}

/**
 * La carte `agent` **entière**, avec une entrée modifiée.
 *
 * On envoie toujours la carte complète : c'est ce qui rend le correctif sûr sans connaître la
 * sémantique exacte du serveur (fusion ou remplacement). Envoyer `{ agent: { build: { … } } }`
 * écraserait les 33 autres agents si le serveur remplace.
 *
 * **Sémantique mesurée** (2026-10-13) : le serveur **fusionne**. Un agent ajouté persiste ; un agent
 * **omis n'est pas retiré** ; `model: null` est refusé (`400`). Conséquence à ne pas oublier :
 * **il n'existe aucun moyen de retirer une entrée d'agent par l'API** — le fichier de configuration
 * est la seule voie. Et « vider un champ » n'est pas un retour au défaut : c'est un non-changement.
 */
export function agentPatch(
  current: Record<string, unknown> | undefined,
  name: string,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const agents: Record<string, unknown> = { ...(current ?? {}) }
  const existing = agents[name]
  const merged = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {}
  for (const [key, value] of Object.entries(changes)) {
    // Retirer une clé de **notre** charge utile n'a **aucun effet** : mesuré, le serveur *fusionne*
    // la carte agent (un agent omis n'est pas retiré, et `model: null` est refusé en 400). Ce n'est
    // donc pas un « retour au défaut » — c'est une absence de changement. On écrit explicitement,
    // jamais par omission, et l'interface ne propose pas de vider un champ (le bouton n'apparaît
    // qu'avec un brouillon non vide).
    if (value === "" || value === undefined) delete merged[key]
    else merged[key] = value
  }
  agents[name] = merged
  return agents
}
