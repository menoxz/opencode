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
 *
 * **Langue** : les libellés d'écran sont en anglais (c'est la langue source de la copie d'interface,
 * cf. la commande `translate`) ; les commentaires restent en français, comme le reste du dépôt.
 */

import type { SettingIconName } from "./icons"

export type SettingsSectionKey =
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
  icon: SettingIconName
}

/**
 * L'ordre suit la fréquence d'usage, comme le rail : on change de modèle bien plus souvent qu'on
 * n'ajoute un plugin.
 *
 * **`models` a disparu** — sa clé, sa section, sa branche de chargement. Ce n'était pas une
 * catégorie mais un **objet** : `model`, `small_model` et `default_agent` ne règlent pas « les
 * modèles », ils règlent **ce qu'une nouvelle session prend par défaut**. Une section nommée d'après
 * la chose au lieu du moment range le réglage à côté de la question qu'il répond ; les trois clés
 * vivent maintenant dans `general`, sous « Defaults ».
 *
 * Six sections + `general` — et c'est possible **parce que** la navigation est verticale : une
 * colonne s'allonge sans rien casser, là où une barre horizontale aurait produit deux rangées
 * (CIBLE §13).
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "general", icon: "general", label: "General", hint: "defaults, workspace, identity" },
  { key: "behavior", icon: "behavior", label: "Behavior", hint: "what the harness does without asking" },
  { key: "tools", icon: "tools", label: "Tools", hint: "formatter and language server" },
  { key: "providers", icon: "providers", label: "Providers", hint: "model provider keys and connections" },
  { key: "agents", icon: "agents", label: "Agents", hint: "model and state of each agent" },
  { key: "mcp", icon: "mcp", label: "MCP servers", hint: "status and authentication" },
  { key: "plugins", icon: "plugins", label: "Plugins", hint: "add or remove a plugin" },
]

/* =============================================================================
   Les réglages, **déclarés comme données**.

   Pourquoi des données et pas du JSX : un réglage se décrit par cinq choses — sa clé dans
   `Config`, son libellé d'écran, ce qu'il fait, le contrôle qui le porte, et le bloc où il se lit.
   Écrit en JSX, chacun de ces points se re-décide à chaque ligne, et les libellés divergent. Écrit
   en données, ils se relisent d'un coup, et le composant ne fait que rendre.

   Mesuré : `Config` a **37 clés**. Quelques-unes sont réglables simplement (chaîne, booléen, liste)
   et quelques-unes sont des énumérations. Les autres sont des structures (cartes d'agents, de
   fournisseurs, de serveurs MCP) — elles ont leur propre section, parce qu'elles ne se règlent pas
   sur une ligne. `logLevel` et `experimental` ne sont **pas** exposés : ce sont des réglages de
   diagnostic, et les exposer sans les expliquer serait exactement le défaut qu'on corrige.

   `group` est ce qui donne une forme lisible à `general`, qui porte désormais cinq réglages de trois
   natures : deux lignes de suite sans titre se lisent comme une liste, trois blocs nommés se lisent
   comme une page.
   ============================================================================= */

export type SettingKind = "text" | "toggle" | "select"

/**
 * Une **source de choix** : une liste que le serveur connaît déjà.
 *
 * C'est la règle qui a manqué à la première version de cette page. Un champ de texte pour un modèle
 * demande à l'utilisateur d'aller chercher `opencode-go/deepseek-v4.1-flash` ailleurs et de le
 * recopier sans faute : l'interface connaît la réponse et la fait porter au clavier. Quand l'ensemble
 * des valeurs valides est connu, le contrôle est un **choix**, jamais une saisie.
 *
 * Les trois sources, et ce qui les sert (poids mesurés 2026-10-13) :
 *
 *   models  `GET /config/providers`   531 ko,  49 ms, 7 fournisseurs, 696 modèles
 *   agents  `GET /agent`             1,27 Mo,  37 ms, 34 agents → les primaires seuls
 *   shells  `GET /pty/shells`         353 o, 110 ms, 4 interpréteurs trouvés
 *
 * `GET /provider` (6,7 Mo, 1 198 ms) fait le même travail pour douze fois le prix : il n'est pas
 * utilisé. `GET /pty/shells` n'est **pas dans le SDK** (mesuré : « Request is not supported by this
 * version of OpenCode Server ») — il s'appelle donc en `fetch` direct, et `/pty` est proxifié.
 */
export type SettingSource = "models" | "agents" | "shells"

export type SettingSpec = {
  /** La clé exacte dans `Config`. */
  key: string
  label: string
  desc: string
  kind: SettingKind
  /** Bloc d'appartenance. Des réglages consécutifs de même `group` se rendent sous un seul titre. */
  group?: string
  /** Pour un `select` **dont les choix viennent du serveur** : le nom de la source. */
  source?: SettingSource
  /** Pour un `select` aux choix **fixes** : les choix, avec leur libellé d'écran. */
  options?: Array<{ value: string; label: string }>
  /** Ce qui s'affiche quand la clé est absente — jamais un champ vide sans repère. */
  placeholder?: string
}

/* =============================================================================
   Les choix — ce que le serveur sait, projeté pour un `<select>`.

   `Choice` est ce qu'un contrôle consomme : la valeur écrite dans `Config`, et ce que l'utilisateur
   lit. Une liste plate, sans regroupement : le libellé porte tout ce qu'il faut pour identifier la
   valeur, et un `optgroup` n'ajouterait qu'un titre au-dessus d'une information déjà là — les noms de
   fournisseurs apparaissent seuls dans une barre de sélection native, et beaucoup de navigateurs ne
   les cherchent pas au clavier.
   ============================================================================= */

export type Choice = { value: string; label: string }

/**
 * **Le libellé doit identifier la valeur à lui seul**, parce que fermé, un `<select>` n'affiche que
 * lui.
 *
 * Mesuré : **696 modèles pour 509 libellés distincts** — 141 libellés sont portés par plusieurs
 * modèles, soit 187 options en trop. Et les deux modèles réellement configurés sur cette machine
 * partagent tous les deux « DeepSeek V4.1 Flash » avec trois autres. Un libellé sans fournisseur
 * afficherait donc la même chose pour cinq valeurs différentes, et l'utilisateur ne pourrait pas
 * dire ce qu'il a choisi — le défaut même qu'on vient de retirer du champ de texte.
 *
 * D'où la forme `Nom · Fournisseur`, **toujours**. Un libellé qui change de forme selon ses voisins
 * se lit moins bien qu'un libellé un peu plus long, et une liste où toutes les lignes se ressemblent
 * se balaie plus vite qu'une liste où deux formats alternent.
 */
export function choice(value: string, name: string, provider: string): Choice {
  return { value, label: `${name} · ${provider}` }
}

/** Tri par libellé : les modèles homonymes se retrouvent côte à côte, là où l'ambiguïté se voit. */
function sorted(choices: Choice[]): Choice[] {
  return [...choices].sort((left, right) => left.label.localeCompare(right.label))
}

/**
 * Les modèles que le serveur sait faire tourner, projetés **sans jamais toucher au reste**.
 *
 * **`GET /config/providers` porte des secrets.** Mesuré : 7 champs `key`/`apiKey` en clair et six
 * chaînes `sk-…`. Les trois routes de modèles en portent (`/api/model` en porte **580** — la route
 * « sans secrets » n'existe pas). La projection ci-dessous ne lit que `name`, `id` et le nom du
 * fournisseur ; le reste de la charge est **abandonné ici** et n'entre jamais dans un signal, donc
 * jamais dans le DOM, un journal ou une infobulle. Le correctif de fond est côté serveur — une route
 * qui ne renvoie pas les clés — et il est consigné comme tel.
 *
 * La valeur est `provider/modèle` : c'est la forme que `Config.model` attend, et celle que
 * `config.ts:modelLabel` relit des deux côtés (chaîne ou objet).
 */
export function modelCatalog(payload: unknown): Choice[] {
  const providers = (payload as { providers?: unknown } | undefined)?.providers
  if (!Array.isArray(providers)) return []
  const choices: Choice[] = []
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") continue
    const provider = entry as { id?: unknown; name?: unknown; models?: unknown }
    if (typeof provider.id !== "string" || !provider.id) continue
    const models = provider.models
    if (!models || typeof models !== "object") continue
    const providerTitle =
      typeof provider.name === "string" && provider.name.trim() ? provider.name.trim() : provider.id
    for (const [id, model] of Object.entries(models as Record<string, unknown>)) {
      const name = model && typeof model === "object" ? (model as { name?: unknown }).name : undefined
      const title = typeof name === "string" && name.trim() ? name.trim() : id
      choices.push(choice(`${provider.id}/${id}`, title, providerTitle))
    }
  }
  return sorted(choices)
}

/**
 * La fenêtre de contexte de chaque modèle, indexée par `providerID/modelID`.
 *
 * Le remplissage du contexte est le seul chiffre de la barre de statistiques qui a besoin d'une
 * **limite** : les jetons d'une étape ne disent pas à quel point la fenêtre est pleine sans elle. On
 * la projette donc en nombres pendant que la charge des fournisseurs passe — la charge brute, elle,
 * ne survit pas à la projection (elle porte les clés des fournisseurs en clair).
 */
export function modelContextLimits(payload: unknown): Record<string, number> {
  const providers = (payload as { providers?: unknown } | undefined)?.providers
  if (!Array.isArray(providers)) return {}
  const limits: Record<string, number> = {}
  for (const entry of providers) {
    if (!entry || typeof entry !== "object") continue
    const provider = entry as { id?: unknown; models?: unknown }
    if (typeof provider.id !== "string" || !provider.id) continue
    if (!provider.models || typeof provider.models !== "object") continue
    for (const [id, model] of Object.entries(provider.models as Record<string, unknown>)) {
      const limit = model && typeof model === "object" ? (model as { limit?: unknown }).limit : undefined
      const context = limit && typeof limit === "object" ? (limit as { context?: unknown }).context : undefined
      if (typeof context === "number" && context > 0) limits[`${provider.id}/${id}`] = context
    }
  }
  return limits
}

/**
 * Un choix de modèle `providerID/modelID` relu en `{ providerID, modelID }`.
 *
 * La coupe se fait sur le **premier** `/` : un identifiant de modèle peut en contenir (`a/b/c`), un
 * identifiant de fournisseur non. Une valeur vide n'est pas un modèle — c'est « défaut du serveur »,
 * donc `undefined`, et l'envoi n'ajoute alors aucune contrainte.
 */
export function parseModelChoice(value: string): { providerID: string; modelID: string } | undefined {
  const trimmed = value.trim()
  const cut = trimmed.indexOf("/")
  if (cut <= 0 || cut === trimmed.length - 1) return undefined
  return { providerID: trimmed.slice(0, cut), modelID: trimmed.slice(cut + 1) }
}

/**
 * Les agents proposables comme défaut.
 *
 * Le schéma est explicite — `default_agent` « must be a primary agent » — donc on ne propose que les
 * primaires, et jamais un agent masqué (le serveur les marque internes : `compaction`, `eval-runner`).
 * Proposer un sous-agent serait proposer une valeur que le serveur refuse ou ignore.
 *
 * Pas de fournisseur dans le libellé : un agent se nomme seul (la carte `Config.agent` est indexée
 * par son nom, donc les noms sont uniques par construction).
 *
 * `GET /agent` pèse 1,27 Mo pour 34 agents dont six primaires : c'est cher pour six noms, et c'est
 * assumé — l'appel est déjà nécessaire à la section « Agents », il est donc payé une fois, et 37 ms
 * ne se voient pas.
 */
export function agentChoices(payload: unknown): Choice[] {
  if (!Array.isArray(payload)) return []
  const choices: Choice[] = []
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue
    const agent = entry as { name?: unknown; mode?: unknown; hidden?: unknown }
    if (typeof agent.name !== "string" || !agent.name.trim()) continue
    if (agent.mode !== "primary" || agent.hidden === true) continue
    choices.push({ value: agent.name, label: agent.name })
  }
  return sorted(choices)
}

/**
 * Les interpréteurs que le serveur a trouvés.
 *
 * La valeur est le **nom** (`pwsh`), pas le chemin : `Shell.preferred` → `resolve` essaie un chemin
 * absolu s'il est enraciné, et `which(nom)` sinon — les deux marchent, et le nom survit à une
 * réinstallation qui change le chemin. `acceptable: false` est écarté : le serveur dit lui-même que
 * cet interpréteur ne peut pas exécuter de commande.
 *
 * **Limite assumée** : le serveur ne cherche que `pwsh`, `powershell`, git-bash et `COMSPEC`. Un
 * interpréteur présent mais hors de cette liste (`nu`, `fish`, WSL) n'est pas proposé ; il reste
 * atteignable en éditant la configuration à la main. Une liste de choix ferme une porte que le champ
 * de texte laissait ouverte — c'est le prix, et il est plus petit que celui de la saisie à l'aveugle.
 */
export function shellChoices(payload: unknown): Choice[] {
  if (!Array.isArray(payload)) return []
  const choices: Choice[] = []
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue
    const shell = entry as { name?: unknown; path?: unknown; acceptable?: unknown }
    if (shell.acceptable === false) continue
    const name = typeof shell.name === "string" && shell.name.trim() ? shell.name.trim() : undefined
    const path = typeof shell.path === "string" && shell.path.trim() ? shell.path.trim() : undefined
    const value = name ?? path
    if (!value) continue
    choices.push({ value, label: name ?? value })
  }
  return sorted(choices)
}

/**
 * Ajoute la valeur courante en tête si la liste ne la contient pas.
 *
 * Sans cela, un réglage que le serveur accepte mais ne publie pas — un modèle d'un fournisseur non
 * configuré, un interpréteur hors des quatre trouvés — disparaîtrait de l'écran au premier rendu :
 * le contrôle afficherait **une autre valeur que celle réellement écrite**, et l'utilisateur croirait
 * lire sa configuration. On l'affiche telle quelle, une fois, plutôt que de la taire.
 */
export function withValue(choices: Choice[], current: string): Choice[] {
  const value = current.trim()
  if (!value) return choices
  if (choices.some((entry) => entry.value === value)) return choices
  return [{ value, label: value }, ...choices]
}

/**
 * La clé d'un identifiant **en cours de saisie**, propre à un fournisseur.
 *
 * Sans le préfixe, une clé tapée pour l'un s'afficherait dans le champ de l'autre : les méthodes
 * d'authentification déclarent les mêmes noms de champ (`key`, `apiKey`) pour tous les fournisseurs,
 * donc une carte plate n'a rien pour les distinguer. C'est un défaut silencieux — l'écran reste
 * cohérent, il montre simplement la mauvaise valeur.
 */
export function scopeKey(providerID: string, key: string): string {
  return `${providerID}:${key}`
}

/** Les identifiants d'**un** fournisseur, extraits de la carte plate. */
export function scopedValues(values: Record<string, string>, providerID: string): Record<string, string> {
  const prefix = `${providerID}:`
  const scoped: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = value
  }
  return scoped
}

/* =============================================================================
   Les fournisseurs — la collection, puis le détail.

   Un écran de réglages décompose sa donnée en **1 → n** : un fournisseur existe **pour ses modèles**.
   Ces trois projections servent les deux niveaux, et la première règle qu'elles respectent est celle
   de la charge : `/config/providers` porte les clés **en clair** (7 champs `key`/`apiKey` mesurés), donc
   aucun résumé ne lit une valeur de secret — il n'en retient que la **présence**. Ce qui entre dans un
   signal est ce qui s'affiche, et rien d'autre.
   ============================================================================= */

export type ProviderSummary = {
  id: string
  name: string
  /** Le nombre de modèles que ce fournisseur déclare. */
  models: number
  /** Un identifiant est enregistré. C'est **le fait**, jamais la valeur. */
  ready: boolean
}

/** La présence d'un identifiant, sans jamais le lire. */
function hasCredentials(entry: Record<string, unknown>): boolean {
  for (const value of [entry.key, entry.apiKey]) {
    if (typeof value === "string" && value.trim()) return true
  }
  for (const value of [entry.keys, entry.apiKeys]) {
    if (Array.isArray(value) && value.length > 0) return true
  }
  const options = entry.options
  if (options && typeof options === "object") {
    const nested = options as Record<string, unknown>
    if (typeof nested.apiKey === "string" && nested.apiKey.trim()) return true
    if (Array.isArray(nested.apiKeys) && nested.apiKeys.length > 0) return true
  }
  return false
}

function providerSummary(entry: unknown): ProviderSummary | undefined {
  if (!entry || typeof entry !== "object") return undefined
  const record = entry as Record<string, unknown>
  const id = record.id
  if (typeof id !== "string" || !id) return undefined
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : id
  const models = record.models && typeof record.models === "object" ? Object.keys(record.models).length : 0
  return { id, name, models, ready: hasCredentials(record) }
}

/** Les fournisseurs **configurés** — la grille au repos, celle qu'on règle. */
export function providerSummaries(payload: unknown): ProviderSummary[] {
  const providers = (payload as { providers?: unknown } | undefined)?.providers
  if (!Array.isArray(providers)) return []
  const out: ProviderSummary[] = []
  for (const entry of providers) {
    const summary = providerSummary(entry)
    if (summary) out.push(summary)
  }
  return out
}

/**
 * Le catalogue du serveur — 228 fournisseurs, 8 775 modèles, 6,7 Mo.
 *
 * Il n'est demandé qu'**au premier caractère tapé** dans la recherche : la grille au repos montre ce
 * qu'on a, et on ne cherche dans le catalogue que pour ajouter ce qu'on n'a pas. Le poids suit donc
 * l'intention au lieu de précéder l'écran.
 */
export function catalogSummaries(payload: unknown): ProviderSummary[] {
  const root = payload as { all?: unknown; providers?: unknown } | undefined
  const list = Array.isArray(root?.all) ? root.all : Array.isArray(root?.providers) ? root.providers : []
  const out: ProviderSummary[] = []
  for (const entry of list) {
    const summary = providerSummary(entry)
    if (summary) out.push(summary)
  }
  return out
}

/**
 * Les modèles d'**un** fournisseur — le « n » de la relation.
 *
 * Le libellé perd son suffixe de fournisseur, contrairement à celui d'un contrôle global : ici le
 * fournisseur **est** le contexte, donc le répéter sur chaque ligne redirait ce que l'en-tête vient de
 * dire. La règle « un libellé identifie sa valeur à lui seul » vaut pour un choix global.
 */
export function providerModelChoices(payload: unknown, providerID: string): Choice[] {
  const providers = (payload as { providers?: unknown } | undefined)?.providers
  if (!Array.isArray(providers)) return []
  const entry = providers.find((candidate) => (candidate as { id?: unknown } | undefined)?.id === providerID)
  const models = (entry as { models?: unknown } | undefined)?.models
  if (!models || typeof models !== "object") return []
  const out: Choice[] = []
  for (const [id, raw] of Object.entries(models as Record<string, unknown>)) {
    const name = raw && typeof raw === "object" ? (raw as { name?: unknown }).name : undefined
    out.push({ value: id, label: typeof name === "string" && name.trim() ? name.trim() : id })
  }
  out.sort((left, right) => left.label.localeCompare(right.label))
  return out
}

/* =============================================================================
   Les écritures — ce qu'on envoie à `/global/config`.

   Un écran qui ne peut qu'afficher ne sert à rien : le fournisseur se **déclare**, se **règle** et
   se **peuple** par la configuration. Les constructeurs ci-dessous sont la seule porte de sortie —
   ils sont purs, donc éprouvables hors navigateur, et c'est là que se joue la correction : ce qui
   part vers le fichier de configuration de l'utilisateur ne se rattrape pas d'un clic.

   Deux règles qu'ils tiennent, et qu'un `...spread` ne tiendrait pas :

     - **un champ vide ne s'écrit pas.** `config.ts:513` retire la clé quand la valeur est une chaîne
       vide : écrire `""` n'est donc pas « ne rien changer », c'est **effacer**. Un formulaire laissé
       vide détruirait un réglage existant.
     - **le patch est partiel et fusionne.** `PATCH /global/config` fusionne les cartes (mesuré) ;
       n'écrire que ce qui change est ce qui rend l'écriture sûre. Mais la fusion **ne retire pas**
       une entrée : ajouter un fournisseur est un aller sans retour par l'API (aucun `PUT`, aucun
       `DELETE` sur `/config` ni `/global/config`) — l'écran doit donc le dire, pas le promettre.

   `discover` s'exécute quand le serveur **charge** ses fournisseurs (`provider.ts:1570`), pas à la
   requête : cocher la case ne fait pas apparaître les modèles dans la seconde.
   ============================================================================= */

/** L'adaptateur par défaut d'une passerelle compatible OpenAI — c'est lui qui parle `GET /models`. */
export const DEFAULT_NPM = "@ai-sdk/openai-compatible"

/**
 * L'état initial du formulaire de déclaration.
 *
 * Le paquet npm n'est pas un ornement : sans lui, le serveur n'a **aucun adaptateur** pour parler à
 * ce fournisseur. Le champ l'affiche donc **et** le draft le porte — sinon l'écran montrerait une
 * valeur qui ne part jamais. Défaut mesuré sur l'instance isolée : un fournisseur créé avec sa seule
 * `baseURL`, donc déclaré et inutilisable.
 */
export function newProviderDraft(): Record<string, string> {
  return { npm: DEFAULT_NPM }
}

/**
 * Un identifiant tel que la configuration le porte : `provider.<id>`.
 *
 * Un identifiant est une **clé de fichier** et la moitié gauche d'une référence `provider/modèle`
 * (`Config.model`). Il ne peut donc pas contenir d'espace ni de majuscule sans rendre la référence
 * intapable — on normalise à la saisie plutôt que d'écrire une clé que personne ne pourra citer.
 */
export function providerId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Déclarer ou régler un fournisseur : `provider.<id>` dans `/global/config`.
 *
 * C'est ce qui rend possible ce que le catalogue ne contient pas — une passerelle maison, un
 * serveur local compatible OpenAI, un revendeur : le serveur accepte **n'importe quel** identifiant
 * (`config.ts:241` : `provider` est une carte libre), mais il lui faut un `npm` pour parler, et une
 * `baseURL` pour savoir à qui.
 */
export function providerPatch(
  id: string,
  fields: { baseURL?: string; npm?: string },
): Record<string, unknown> | undefined {
  const key = providerId(id)
  if (!key) return undefined
  const npm = fields.npm?.trim()
  const baseURL = fields.baseURL?.trim()
  const entry: Record<string, unknown> = {}
  if (npm) entry.npm = npm
  if (baseURL) entry.options = { baseURL }
  if (Object.keys(entry).length === 0) return undefined
  return { provider: { [key]: entry } }
}

/**
 * Ajouter un modèle **à la main** : `provider.<id>.models.<modelID>`.
 *
 * Un modèle découvert (`discover`) reçoit des valeurs prudentes — `limit.context` lu de l'endpoint,
 * sortie à 32 768, aucune capacité. Un modèle déclaré porte ce qu'on lui donne, et il est **conservé**
 * quand la découverte passe : on ajoute donc exactement pour ce que la découverte ne sait pas dire.
 *
 * Le `name` est toujours écrit — même réduit à l'identifiant. La raison est mécanique : `mergeDeep`
 * fusionne une carte, et rien ne garantit qu'une entrée réduite à `{}` matérialise la clé. Un libellé
 * est de toute façon ce que la liste affiche.
 */
export function modelPatch(id: string, modelID: string, name?: string): Record<string, unknown> | undefined {
  const key = providerId(id)
  const model = modelID.trim()
  if (!key || !model) return undefined
  const label = name?.trim()
  return { provider: { [key]: { models: { [model]: { name: label || model } } } } }
}

/**
 * La découverte des modèles : `discover` fait lire `GET {baseURL}/models` **par le serveur**.
 *
 * L'appel part du serveur, donc aucun problème d'origine (CORS) et la clé n'a pas à descendre dans le
 * navigateur. Fail-open côté serveur : une erreur réseau rend zéro modèle au lieu de casser le
 * fournisseur.
 */
export function discoverPatch(id: string, on: boolean): Record<string, unknown> | undefined {
  const key = providerId(id)
  if (!key) return undefined
  return { provider: { [key]: { discover: on } } }
}

/**
 * Retirer un modèle de la liste disponible : `blacklist` du fournisseur.
 *
 * Ce n'est **pas** un statut de modèle : `ModelStatus` vaut `alpha|beta|deprecated|active` — il n'y a
 * pas de `disabled`. Le levier que le serveur offre est la liste `blacklist` (ou `whitelist`), et elle
 * remplace l'ancienne : un tableau est **remplacé**, jamais concaténé par la fusion de configuration.
 */
export function blacklistPatch(id: string, disabled: string[]): Record<string, unknown> | undefined {
  const key = providerId(id)
  if (!key) return undefined
  return { provider: { [key]: { blacklist: disabled } } }
}

/** Cocher/décocher un modèle dans une liste d'exclusions, sans jamais laisser de doublon. */
export function toggleModel(current: string[] | undefined, modelID: string, disabled: boolean): string[] {
  const list = Array.isArray(current) ? current.filter((entry): entry is string => typeof entry === "string") : []
  const kept = list.filter((entry) => entry !== modelID)
  return disabled ? [...kept, modelID] : kept
}

/**
 * Les fournisseurs **déclarés dans la configuration**, rendus comme les autres.
 *
 * Sans cette fusion, un fournisseur qu'on vient de créer par l'écran **disparaîtrait aussitôt** : la
 * grille se construit sur `/config/providers`, que le serveur bâtit à partir des fournisseurs qu'il a
 * **chargés** — et il ne recharge pas parce qu'un fichier a changé. L'écran dirait donc « créé », puis
 * ne montrerait rien : le pire des deux mensonges, parce qu'il décourage de recommencer.
 *
 * Le compte des modèles vient de la configuration déclarée (`models` de l'entrée), pas de la
 * découverte : c'est ce que l'écrivain vient d'écrire, donc ce qu'il doit relire.
 */
export function mergeDeclared(rows: ProviderSummary[], config: unknown): ProviderSummary[] {
  const providers = (config as { provider?: unknown } | undefined)?.provider
  if (!providers || typeof providers !== "object") return rows
  const known = new Set(rows.map((row) => row.id))
  const declared: ProviderSummary[] = []
  for (const [id, raw] of Object.entries(providers as Record<string, unknown>)) {
    if (known.has(id)) continue
    const models = raw && typeof raw === "object" ? (raw as { models?: unknown }).models : undefined
    const count = models && typeof models === "object" ? Object.keys(models as object).length : 0
    declared.push({ id, name: id, models: count, ready: false })
  }
  declared.sort((left, right) => left.id.localeCompare(right.id))
  return [...rows, ...declared]
}

/**
 * Le général — l'identité, l'environnement, et **les défauts**.
 *
 * `model`, `small_model` et `default_agent` viennent de l'ancienne section « models ». Le premier
 * bloc est donc « Defaults » : c'est la question qu'ils répondent tous les trois, et c'est aussi ce
 * qu'on touche le plus souvent dans tout le panneau.
 *
 * **Quatre des cinq réglages sont des choix, pas des saisies** — et c'est la correction d'une erreur :
 * un champ de texte pour un modèle oblige à aller chercher `opencode-go/deepseek-v4.1-flash` ailleurs
 * et à le recopier sans faute, alors que le serveur publie la liste. Le champ de texte reste pour ce
 * qui n'a **pas** d'ensemble fini : un nom d'utilisateur.
 *
 * Le `placeholder` d'un `select` alimenté par une source n'est pas un texte grisé : c'est le libellé
 * de l'option **vide**, celle qui remet le réglage au défaut du serveur. Vide est un état, pas une
 * absence — mesuré : `config.ts:513` retire la clé quand la valeur est la chaîne vide.
 */
export const GENERAL_SETTINGS: SettingSpec[] = [
  {
    key: "model",
    group: "Defaults",
    label: "Default model",
    desc: "the model a new session starts with",
    kind: "select",
    source: "models",
    placeholder: "server default",
  },
  {
    key: "small_model",
    group: "Defaults",
    label: "Small model",
    desc: "short tasks: titles, summaries, search",
    kind: "select",
    source: "models",
    placeholder: "server default",
  },
  {
    key: "default_agent",
    group: "Defaults",
    label: "Default agent",
    desc: "the agent a new session runs as",
    kind: "select",
    source: "agents",
    placeholder: "build",
  },
  {
    key: "username",
    group: "Identity",
    label: "Username",
    desc: "the name that signs your messages",
    kind: "text",
    placeholder: "not set",
  },
  {
    key: "shell",
    group: "Environment",
    label: "Shell",
    desc: "the shell that runs commands",
    kind: "select",
    source: "shells",
    placeholder: "system default",
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
    label: "Session sharing",
    desc: "publish a conversation, or ask first",
    kind: "select",
    options: [
      { value: "manual", label: "ask first" },
      { value: "auto", label: "publish automatically" },
      { value: "disabled", label: "never publish" },
    ],
  },
  {
    key: "autoshare",
    label: "Auto-share",
    desc: "publish as soon as a session is created",
    kind: "toggle",
  },
  {
    key: "autoupdate",
    label: "Updates",
    desc: "install new versions",
    kind: "select",
    options: [
      { value: "true", label: "install automatically" },
      { value: "notify", label: "notify only" },
      { value: "false", label: "do not check" },
    ],
  },
  {
    key: "snapshot",
    label: "Snapshots",
    desc: "record file state before a change, so it can be undone",
    kind: "toggle",
  },
]

/** Les outils que l'on active ou coupe — `false` les désactive sans les désinstaller. */
export const TOOL_SETTINGS: SettingSpec[] = [
  {
    key: "formatter",
    label: "Formatter",
    desc: "format code as it is written",
    kind: "toggle",
  },
  {
    key: "lsp",
    label: "Language server",
    desc: "code analysis: errors, definitions, references",
    kind: "toggle",
  },
]

/** Toutes les lignes simples, par section — ce que le composant rend. */
export const SETTING_SPECS: Partial<Record<SettingsSectionKey, SettingSpec[]>> = {
  general: GENERAL_SETTINGS,
  behavior: BEHAVIOR_SETTINGS,
  tools: TOOL_SETTINGS,
}

/**
 * Découpe une liste de réglages en blocs consécutifs de même `group`.
 *
 * Consécutifs, et non triés : l'ordre du fichier est l'ordre d'écran, et un regroupement qui
 * réordonnerait ferait remonter « Environment » au-dessus de « Defaults ». Un réglage sans groupe
 * forme son propre bloc sans titre — c'est ce que fait `behavior` et `tools`, où un titre ne
 * séparerait rien.
 */
export function settingGroups(specs: SettingSpec[]): Array<{ title?: string; specs: SettingSpec[] }> {
  const blocks: Array<{ title?: string; specs: SettingSpec[] }> = []
  for (const spec of specs) {
    const last = blocks[blocks.length - 1]
    if (last && last.title === spec.group) last.specs.push(spec)
    else blocks.push({ title: spec.group, specs: [spec] })
  }
  return blocks
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
    // Un `select` sans valeur connue retombe sur son premier choix plutôt que sur du vide. Un
    // `select` alimenté par une source n'a pas de choix statiques : il retombe sur **vide**, qui est
    // l'option « défaut du serveur ».
    return spec.kind === "select" ? (spec.options?.[0]?.value ?? "") : ""
  }
  // `model` accepte une **chaîne** (`provider/modèle`) ou un **objet** `{ providerID, modelID }` — le
  // SDK déclare les deux formes. Sans ce cas, `String(value)` rendait `[object Object]`, et le
  // contrôle affichait cette horreur au lieu du modèle réellement configuré.
  if (typeof value === "object") {
    const object = value as { providerID?: unknown; modelID?: unknown; id?: unknown }
    if (typeof object.providerID === "string" && typeof object.modelID === "string") {
      return `${object.providerID}/${object.modelID}`
    }
    if (typeof object.id === "string") return object.id
    return ""
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
  return (method.type ?? "").trim() || "unknown"
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
  return isFormFillable(method) ? "API key" : "Connect"
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
    return [{ key: "key", label: "API key", secret: true }]
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
