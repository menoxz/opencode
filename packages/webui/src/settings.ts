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

export type SettingsSectionKey = "general" | "providers" | "agents" | "mcp" | "plugins"

export type SettingsSection = {
  key: SettingsSectionKey
  label: string
  hint: string
}

/**
 * L'ordre suit la fréquence d'usage, comme le rail : on règle son modèle bien plus souvent qu'on
 * n'ajoute un plugin.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "general", label: "général", hint: "modèle, petit modèle, utilisateur, agent par défaut" },
  { key: "providers", label: "fournisseurs", hint: "clés et connexions des fournisseurs de modèles" },
  { key: "agents", label: "agents", hint: "modèle, mode et options de chaque agent" },
  { key: "mcp", label: "serveurs MCP", hint: "état et authentification" },
  { key: "plugins", label: "plugins", hint: "ajouter ou retirer un plugin" },
]

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
