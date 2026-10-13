import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import {
  buildFilePart,
  filePartLabel,
  fileSizeLabel,
  isImageMime,
  validateAttachment,
  type Attachment,
} from "./attachments"
import { client, credentials, fetchHealth, rememberCredentials, serverUrl, type Health } from "./client"
import {
  DETAILS_DEFAULT,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  effectiveSidebarPreference,
} from "./columns"
import {
  ContextInjections,
  FileChip,
  PermissionSheet,
  PluginButton,
  Reasoning,
  SessionRow,
  ShowMore,
  ToolLine,
  Turn,
  UserPrompt,
  WorkspaceGroup,
} from "./components"
import {
  AgentsSection,
  GeneralSection,
  McpSection,
  PluginsSection,
  SettingsSheet,
} from "./settings-sheet"
import { ProvidersSection } from "./providers"
import {
  SETTINGS_SECTIONS,
  SETTING_SPECS,
  agentChoices,
  agentDisabled,
  agentModel,
  agentPatch,
  authBody,
  authMethods,
  modelCatalog,
  catalogSummaries,
  providerModelChoices,
  providerSummaries,
  scopeKey,
  scopedValues,
  type ProviderSummary,
  settingDisplay,
  settingGroups,
  settingValue,
  shellChoices,
  type AuthMethod,
  type Choice,
  type ProviderAuth,
  type SettingSpec,
  type SettingsSectionKey,
} from "./settings"
import {
  agentCounts,
  agentRows,
  agentSummary,
  filterAgents,
  mcpConnectedCount,
  mcpProblems,
  type Agent,
  type McpState,
} from "./config"
import { parseInjections } from "./injections"
import { pluginEntries, type PluginList } from "./nav"
import { SESSION_LIMIT, groupByDirectory, sessionDetails, splitSessions, type SessionSummary } from "./sessions"
import { subscribeEvents, type EventStreamState } from "./events"
import { sessionTimestamp } from "./time"
import {
  dropPermission,
  isVisiblePart,
  reducePermissions,
  type PermissionReply,
  type PermissionRequest,
  type ToolState,
} from "./view-model"

type Part =
  | { type: "text"; id?: string; text?: string }
  | { type: "reasoning"; id: string; text?: string }
  | { type: "tool"; id: string; tool: string; state: ToolState }
  | { type: "file"; mime?: string; filename?: string; url?: string }
  | { type: string; text?: string; id?: string }

type Message = { info: { id: string; role: string }; parts: Part[] }

const DIR_KEY = "oc.webui.directory"

/**
 * L'écran, en cinq zones : rail des sessions, fil, saisie, et un tiroir droit qui n'apparaît que
 * lorsqu'une décision est attendue. Tout le reste a été retiré — un agent généraliste produit des
 * choses très diverses, et c'est la **conversation** qui absorbe cette variété, pas le mobilier.
 */
export default function App() {
  const [health, setHealth] = createSignal<Health | undefined>()
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [active, setActive] = createSignal<string | undefined>()
  const [messages, setMessages] = createSignal<Message[]>([])
  const [stream, setStream] = createSignal<EventStreamState>({ connected: false, reconnects: 0 })
  const [draft, setDraft] = createSignal("")
  const [error, setError] = createSignal<string | undefined>()
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const [directory, setDirectory] = createSignal(localStorage.getItem(DIR_KEY) ?? "")
  const [serverPath, setServerPath] = createSignal<string | undefined>()
  /** Le dossier de configuration du serveur — c'est là que les réglages sont réellement écrits. */
  const [configPath, setConfigPath] = createSignal<string | undefined>()
  /**
   * Les workspaces que le serveur connaît déjà — la complétion du champ de dossier du **rail**.
   *
   * Elle vit sur le champ, pas dans la feuille de réglages : la complétion accompagne l'action, et
   * l'action est au premier plan. `GET /project` pèse 962 octets, donc elle se lit au montage.
   */
  const [projects, setProjects] = createSignal<string[]>([])
  /**
   * Les choix que le serveur publie, déjà projetés. **Jamais les charges brutes** : celle des
   * modèles porte les clés des fournisseurs, et elle est abandonnée dès la projection.
   */
  const [modelOptions, setModelOptions] = createSignal<Choice[]>([])
  const [shellOptions, setShellOptions] = createSignal<Choice[]>([])
  const [query, setQuery] = createSignal("")
  const [renaming, setRenaming] = createSignal<string | undefined>()
  const [renameDraft, setRenameDraft] = createSignal("")
  // Confirmation en ligne : un `window.confirm` natif ne se style pas et bloque tout pilotage.
  const [confirming, setConfirming] = createSignal<string | undefined>()
  // Deux replis indépendants : un dossier entier, et une ligne de session (son détail).
  const [groupsOpen, setGroupsOpen] = createSignal<Record<string, boolean>>({})
  const [detailsOpen, setDetailsOpen] = createSignal<Record<string, boolean>>({})

  // Configuration : lue seulement quand la feuille s'ouvre. Rien de tout cela ne s'affiche au repos.
  const [configOpen, setConfigOpen] = createSignal(false)
  const [config, setConfig] = createSignal<{
    model?: unknown
    small_model?: unknown
    username?: unknown
    instructions?: unknown
    /** La carte `Record<nom, AgentConfig>` — lue pour **configurer** les agents, pas seulement les lister. */
    agent?: Record<string, unknown>
    /** Les réglages déclarés (`SETTING_SPECS`) lisent leur clé ici : la signature d'index est
     *  nécessaire, sinon chaque clé devrait être nommée dans ce type — et un réglage ajouté aux
     *  données cesserait de compiler. */
    [key: string]: unknown
  }>({})
  const [agents, setAgents] = createSignal<Agent[]>([])
  const [mcp, setMcp] = createSignal<Record<string, McpState>>({})

  // Réglages : une section ne charge ses données **qu'à sa sélection**. `GET /provider` (6,7 Mo)
  // n'est jamais appelé ; `/provider/auth` suffit et ne pèse que quelques kilo-octets.
  const [settingsSection, setSettingsSection] = createSignal<SettingsSectionKey>("general")
  const [providerAuth, setProviderAuth] = createSignal<ProviderAuth | undefined>()
  const [providerValues, setProviderValues] = createSignal<Record<string, string>>({})
  /**
   * Les fournisseurs **résumés**, et leurs modèles.
   *
   * Ce sont les deux seules choses qui sortent de la charge de `/config/providers`, laquelle porte les
   * clés **en clair** (7 champs `key`/`apiKey` mesurés). Le résumé retient `ready: boolean` — le fait
   * qu'un identifiant existe, jamais sa valeur. La projection se fait au chargement, et la charge
   * n'entre dans aucun signal.
   */
  const [providerRows, setProviderRows] = createSignal<ProviderSummary[]>([])
  const [providerModels, setProviderModels] = createSignal<Record<string, Choice[]>>({})
  /** Le catalogue (228 fournisseurs, 6,7 Mo) — vide tant qu'on n'a pas cherché. */
  const [providerCatalog, setProviderCatalog] = createSignal<ProviderSummary[]>([])
  const [catalogPending, setCatalogPending] = createSignal(false)
  const [providerQuery, setProviderQuery] = createSignal("")
  const [pluginSpec, setPluginSpec] = createSignal("")
  /** Les valeurs saisies, par clé de réglage — avant enregistrement. */
  const [specDrafts, setSpecDrafts] = createSignal<Record<string, string>>({})
  const [settingsNotice, setSettingsNotice] = createSignal<string | undefined>()
  const [settingsError, setSettingsError] = createSignal<string | undefined>()
  const [settingsBusy, setSettingsBusy] = createSignal<string | undefined>()
  /** Les modèles saisis par agent, avant enregistrement. */
  const [agentDrafts, setAgentDrafts] = createSignal<Record<string, string>>({})
  /** La recherche d'agents : 34 lignes ne se parcourent pas, l'utilisateur sait ce qu'il cherche. */
  const [agentQuery, setAgentQuery] = createSignal("")
  /** Un seul fournisseur ouvert à la fois : huit formulaires concurrents, c'est huit décisions. */
  const [providerSelected, setProviderSelected] = createSignal<string | undefined>()

  // Plugins : les seuls accès hors session. Lus au montage — 708 octets, donc sans coût.
  const [plugins, setPlugins] = createSignal<PluginList | undefined>()
  // « voir plus » par dossier : replier est l'état par défaut, déplier est un geste explicite.
  const [moreOpen, setMoreOpen] = createSignal<Record<string, boolean>>({})

  /**
   * Les identifiants du serveur — **lus** ici, écrits par le bloc `Server` de `General`.
   *
   * Ils vivent dans `localStorage` (`oc.webui.auth`), pas dans `Config` : c'est un réglage de **ce
   * navigateur**, pas du serveur. Le formulaire n'a plus de popover : il n'a pas d'état d'ouverture.
   */
  const [authUser, setAuthUser] = createSignal(credentials?.username ?? "")
  const [authPass, setAuthPass] = createSignal(credentials?.password ?? "")

  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [attachError, setAttachError] = createSignal<string | undefined>()

  /** Horloge figée par rendu : évite que chaque ligne recalcule un temps différent. */
  const now = () => Date.now()

  // ---- Charpente : solveur de concession de DSH (`columns.ts`) ----
  // Les préférences sont l'état ; les largeurs rendues sont **dérivées**. C'est ce qui rend la
  // restauration au ré-élargissement automatique : rien n'est réécrit pendant une concession.
  const [viewport, setViewport] = createSignal(typeof window === "undefined" ? 1440 : window.innerWidth)
  const [sidebarPref, setSidebarPref] = createSignal(SIDEBAR_DEFAULT)
  const [narrowExpanded, setNarrowExpanded] = createSignal(false)

  const columns = () =>
    computeColumns(viewport(), effectiveSidebarPreference(viewport(), sidebarPref(), narrowExpanded()), DETAILS_DEFAULT)

  /**
   * Le tiroir droit n'a qu'une raison d'exister : une demande d'accord. Pas de panneau vide, pas
   * d'onglets, pas de journal d'événements — la piste reste à 0 tant qu'on n'a rien à décider.
   */
  const detailsWidth = () => (permissions().length > 0 ? columns().details : 0)

  const layoutStyle = () => ({
    "grid-template-columns": `${columns().sidebar}px minmax(0, 1fr) ${detailsWidth()}px`,
  })

  /**
   * Glissement de la frontière rail/conversation. DSH précise que cette frontière est une **bande
   * de préhension invisible**, là où celle des détails garde une pilule visible.
   */
  const startSidebarDrag = (event: PointerEvent) => {
    event.preventDefault()
    const depart = event.clientX
    const largeurDepart = columns().sidebar
    const onMove = (move: PointerEvent) => {
      setSidebarPref(clampWidth(largeurDepart + (move.clientX - depart), SIDEBAR_MIN, SIDEBAR_MAX))
      // Un glissement manuel sous le seuil vaut ré-expansion explicite (`narrowExpanded` chez DSH).
      if (viewport() < 1024) setNarrowExpanded(true)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  /** Repli/dépli manuel : sous le seuil, un dépli explicite pose `narrowExpanded`. */
  const toggleSidebar = () => {
    if (sidebarPref() === 0) {
      setSidebarPref(SIDEBAR_DEFAULT)
      setNarrowExpanded(true)
      return
    }
    setSidebarPref(0)
    setNarrowExpanded(false)
  }

  /**
   * Every SDK method takes `directory` as a query parameter, so switching the working directory
   * needs no client rebuild — the value is threaded into each call instead.
   */
  const scope = () => (directory().trim() ? { directory: directory().trim() } : {})

  const loadPath = async () => {
    const result = await client.path.get(scope()).catch(() => undefined)
    // Observed shape: { home, state, config, worktree, directory } — not `cwd`/`root`.
    const data = (result as { data?: { directory?: string; worktree?: string; config?: string } } | undefined)?.data
    setServerPath(data?.directory ?? data?.worktree)
    setConfigPath(data?.config)
  }

  /**
   * Les workspaces connus — la complétion du champ de dossier du rail.
   *
   * `/` est un projet maison du serveur, pas un lieu de travail : il n'aide pas la saisie.
   */
  const loadProjects = async () => {
    const result = await client.project.list({}).catch(() => undefined)
    const data = (result as { data?: Array<{ worktree?: string }> } | undefined)?.data
    if (!Array.isArray(data)) return
    setProjects(data.map((project) => project.worktree).filter((path): path is string => Boolean(path) && path !== "/"))
  }

  /**
   * Les interpréteurs installés. `GET /pty/shells` pèse **353 octets** et n'est **pas dans le SDK**
   * — mesuré : « Request is not supported by this version of OpenCode Server ». On l'appelle donc
   * directement, par le même chemin que le reste : `/pty` est proxifié vers le serveur, et en
   * production l'UI est servie par lui (même origine).
   */
  const fetchShells = async () => {
    const response = await fetch(`${serverUrl}/pty/shells`).catch(() => undefined)
    if (!response?.ok) return undefined
    return (await response.json().catch(() => undefined)) as unknown
  }

  const loadSessions = async () => {
    const search = query().trim()
    const result = await client.session
      .list({ ...scope(), ...(search ? { search } : {}) })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    const data = (result as { data?: SessionSummary[] } | undefined)?.data
    if (Array.isArray(data)) setSessions(data)
  }

  const loadMessages = async (sessionID: string) => {
    const result = await client.session.messages({ sessionID, ...scope() }).catch(() => undefined)
    const data = (result as { data?: Message[] } | undefined)?.data
    setMessages(Array.isArray(data) ? data : [])
  }

  const loadPermissions = async () => {
    const result = await client.permission.list(scope()).catch(() => undefined)
    const data = (result as { data?: PermissionRequest[] } | undefined)?.data
    if (Array.isArray(data)) setPermissions(data)
  }

  /**
   * Configuration : trois appels, tous facultatifs. Un serveur qui n'expose pas l'un d'eux ne
   * casse pas la feuille — la section correspondante reste vide, ce qui est exact.
   *
   * `GET /provider` n'est **pas** appelé : il rend 6,7 Mo (228 fournisseurs, 8 775 modèles) pour
   * deux nombres qui ne changent aucune décision. Mesuré : c'est lui qui gelait l'ouverture.
   */
  /**
   * Les réglages — une section à la fois.
   *
   * C'est ce qui répond à « éviter de charger la page de settings » : chaque section ne lit que ce
   * qu'elle montre. `GET /agent` (1,27 Mo) n'est lu que si l'on ouvre « agents » ; `GET /provider`
   * (6,7 Mo) n'est **jamais** lu, `/provider/auth` donne les méthodes pour quelques kilo-octets.
   */
  const loadSettings = async (section: SettingsSectionKey) => {
    setSettingsNotice(undefined)
    setSettingsError(undefined)

    /**
     * Les sections déclarées — `general`, `behavior`, `tools`. Elles ne lisent que la configuration.
     *
     * `general` lit **en plus** les trois listes de choix, parce que quatre de ses cinq réglages sont
     * des `select` : modèles, agents, interpréteurs. Le prix est mesuré et assumé :
     *
     *   config           19 ko     4 ms
     *   config/providers 531 ko   49 ms   → 7 fournisseurs, 696 modèles
     *   agent           1,27 Mo   37 ms   → 34 agents, six primaires
     *   pty/shells       353 o   110 ms   → 4 interpréteurs
     *
     * soit ~1,8 Mo, **une fois**, à l'ouverture de la page. `GET /provider` (6,7 Mo, 1 198 ms) n'est
     * jamais appelé : il fait le même travail pour douze fois le prix.
     *
     * `models` a disparu de cette liste avec la section : ses trois clés vivent dans `general`.
     */
    if (section === "general" || section === "behavior" || section === "tools") {
      const general = section === "general"
      /**
       * **Cache de session.** La page relisait 531 ko de modèles **et** 1,27 Mo d'agents à chaque
       * ouverture — 1,8 Mo pour deux listes qui ne changent que si l'on écrit quelque chose. On ne
       * les redemande donc que si on ne les a pas.
       *
       * L'invalidation est faite par le **writer** qui peut les changer, et par lui seul :
       * `saveProvider` (authentifier un fournisseur change les modèles qu'il propose) et `saveAgent`.
       * C'est ce qui rend le cache sûr : sans un point d'invalidation nommé, il montrerait une liste
       * incomplète jusqu'au redémarrage — le piège qu'on cherche à ne pas poser.
       *
       * Les interpréteurs ne sont **pas** cachés : 353 octets, il n'y a rien à économiser.
       */
      const needModels = general && modelOptions().length === 0
      const needAgents = general && agents().length === 0
      const [configResult, providersResult, shellsResult, agentResult] = await Promise.all([
        client.global.config.get().catch(() => undefined),
        needModels ? client.config.providers().catch(() => undefined) : Promise.resolve(undefined),
        general ? fetchShells() : Promise.resolve(undefined),
        needAgents ? client.app.agents(scope()).catch(() => undefined) : Promise.resolve(undefined),
      ])
      const data = (configResult as { data?: Record<string, unknown> } | undefined)?.data
      if (data) {
        setConfig(data)
        // Les saisies en cours sont abandonnées : la config relue est la vérité.
        setSpecDrafts({})
      }
      if (general) {
        // **Projection immédiate.** La charge de `/config/providers` porte les clés des fournisseurs
        // en clair ; elle ne survit pas à cette ligne et n'entre dans aucun signal.
        if (needModels) setModelOptions(modelCatalog((providersResult as { data?: unknown } | undefined)?.data))
        setShellOptions(shellChoices(shellsResult))
        const agentData = (agentResult as { data?: Agent[] } | undefined)?.data
        if (Array.isArray(agentData)) setAgents(agentData)
      }
      return
    }

    if (section === "providers") {
      // La grille a besoin des **noms**, du compte de modèles et de l'état de chaque fournisseur :
      // `/provider/auth` ne les porte pas. On lit donc `/config/providers` (531 ko, 49 ms) — le même
      // appel que `General` — et on projette aussitôt, parce que la charge porte les clés en clair.
      const need = providerRows().length === 0
      const [authResult, providersResult] = await Promise.all([
        client.provider.auth(scope()).catch(() => undefined),
        need ? client.config.providers().catch(() => undefined) : Promise.resolve(undefined),
      ])
      setProviderAuth((authResult as { data?: ProviderAuth } | undefined)?.data)
      const payload = (providersResult as { data?: unknown } | undefined)?.data
      if (payload) {
        // **Projection immédiate** : rien de ce qui suit ne garde la charge. `ready` est un booléen,
        // jamais la clé qui le rend vrai.
        const rows = providerSummaries(payload)
        setProviderRows(rows)
        const index: Record<string, Choice[]> = {}
        for (const row of rows) index[row.id] = providerModelChoices(payload, row.id)
        setProviderModels(index)
      }
      return
    }

    if (section === "agents") {
      // La config est relue **ici aussi** : la carte `agent` vit dedans, et configurer un agent sans
      // l'avoir lue écraserait les entrées existantes au lieu de les modifier.
      const [configResult, agentResult] = await Promise.all([
        client.global.config.get().catch(() => undefined),
        client.app.agents(scope()).catch(() => undefined),
      ])
      const configData = (configResult as { data?: Record<string, unknown> } | undefined)?.data
      if (configData) setConfig(configData)
      const agentData = (agentResult as { data?: Agent[] } | undefined)?.data
      if (Array.isArray(agentData)) setAgents(agentData)
      return
    }

    if (section === "mcp") {
      const result = await client.mcp.status(scope()).catch(() => undefined)
      const data = (result as { data?: Record<string, McpState> } | undefined)?.data
      if (data) setMcp(data)
      return
    }

    await loadPlugins()
  }

  /** Le modèle déclaré pour un agent, lu dans la carte de configuration. */
  const agentModelOf = (name: string) => agentModel(config().agent?.[name])

  /** Un agent est-il désactivé ? */
  const agentDisabledOf = (name: string) => agentDisabled(config().agent?.[name])

  /**
   * Configurer un agent — `PATCH /global/config` avec la carte `agent` **entière**.
   *
   * Envoyer seulement l'agent modifié écraserait les 33 autres si le serveur **remplace** la carte
   * au lieu de la fusionner. On ne connaît pas cette sémantique, donc on n'en dépend pas : la carte
   * complète donne le même résultat dans les deux cas.
   */
  const saveAgent = async (name: string, changes: Record<string, unknown>, label: string) => {
    setSettingsBusy(`agent:${name}`)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.global.config
      .update({
        // Le schéma généré nomme les 21 champs d'`AgentConfig` ; notre carte reste délibérément
        // `Record<string, unknown>` — on ne recopie pas le schéma à la main, il divergerait au
        // premier changement. Le cast est étroit : il ne porte que sur cette carte.
        config: { agent: agentPatch(config().agent, name, changes) as Record<string, never> },
      })
      .catch((cause: unknown) => {
        setSettingsError(String(cause))
        return undefined
      })
    setSettingsBusy(undefined)
    if (result) {
      setAgentDrafts((current) => ({ ...current, [name]: "" }))
      // Le modèle ou l'état d'un agent vient de changer : le cache d'agents devient faux.
      setAgents([])
      await loadSettings("agents")
      setSettingsNotice(`${label} saved`)
    }
  }

  const toggleAgent = (name: string, disabled: boolean) =>
    void saveAgent(name, { disable: disabled }, `agent ${name}`)

  const openConfig = () => {
    setConfigOpen(true)
    void loadSettings(settingsSection())
  }

  const selectSection = (key: SettingsSectionKey) => {
    setSettingsSection(key)
    void loadSettings(key)
  }

  /**
   * Les réglages **déclarés** (modèles, général, comportement, outils) se rendent d'un seul bloc :
   * le composant ne fait que rendre, la donnée dit quoi montrer. Ajouter un réglage, c'est ajouter
   * une entrée dans `SETTING_SPECS` — pas une ligne de JSX.
   */
  const specDraft = (spec: SettingSpec) => specDrafts()[spec.key] ?? settingDisplay(spec, config()[spec.key])
  const setSpecDraft = (key: string, value: string) =>
    setSpecDrafts((current) => ({ ...current, [key]: value }))

  /**
   * Les choix d'un réglage déclaré — l'aiguillage par **source**, une seule fois.
   *
   * Un réglage ne sait pas d'où vient sa liste, et le contrôle non plus : les deux reçoivent des
   * `Choice`. C'est ici, et seulement ici, que « models » veut dire `/config/providers`.
   */
  const optionsOf = (spec: SettingSpec): Choice[] => {
    if (spec.source === "models") return modelOptions()
    if (spec.source === "shells") return shellOptions()
    if (spec.source === "agents") return agentChoices(agents())
    return []
  }
  const commitSpec = (spec: SettingSpec, raw: string | boolean) =>
    void saveConfig({ [spec.key]: settingValue(spec, raw) }, spec.label)

  /** Les identifiants du fournisseur ouvert, extraits de la carte plate et préfixée. */
  const providerValuesFor = (id: string) => scopedValues(providerValues(), id)

  /**
   * Chercher un fournisseur — le **seul** moment où le catalogue se paie.
   *
   * `GET /provider` rend 6,7 Mo en 1 198 ms (228 fournisseurs, 8 775 modèles). La grille au repos
   * montre les sept qu'on a ; on ne cherche dans le catalogue que pour ajouter ce qu'on n'a pas, donc
   * le poids suit l'intention au lieu de précéder l'écran. Une fois par session : le catalogue ne
   * change pas sous nos pieds, et un rechargement le vide.
   */
  const searchProviders = (value: string) => {
    setProviderQuery(value)
    if (!value.trim() || providerCatalog().length > 0 || catalogPending()) return
    setCatalogPending(true)
    void client.provider
      .list(scope())
      .then((result) => setProviderCatalog(catalogSummaries((result as { data?: unknown } | undefined)?.data)))
      .catch(() => setProviderCatalog([]))
      .finally(() => setCatalogPending(false))
  }

  /** Le réglage `model` — le contrôle « default for new sessions » du détail d'un fournisseur. */
  const modelSpec = () => (SETTING_SPECS.general ?? []).find((spec) => spec.key === "model")

  /**
   * Le pied de la page General — **deux faits** qu'aucun autre écran ne donne : où les réglages sont
   * réellement écrits, et quelle version du serveur les sert.
   *
   * Le fichier est `opencode.jsonc` et non `config.json` : mesuré, c'est le `.jsonc` qui gagne sur le
   * `.json`, quel que soit le mtime (`config.ts:578-580`), et c'est là que le TUI écrit. Dire
   * « enregistré » sans dire où est exactement le défaut qui coûte une heure de recherche.
   */
  const generalFootnote = () => {
    const facts: string[] = []
    const dir = configPath()
    const version = health()?.version
    if (dir) facts.push(`written to ${dir}\\opencode.jsonc`)
    if (version) facts.push(`server ${version}`)
    return facts.length > 0 ? facts.join(" · ") : undefined
  }

  /**
   * Écrire la configuration — **globale**, et en forme **imbriquée**.
   *
   * Deux défauts corrigés ici, tous deux silencieux :
   *
   *   1. **La forme.** Le SDK attend `{ config: { … } }` (`{ key: "config", map: "body" }`) et non
   *      un patch à plat. Envoyer `{ model: "…" }` faisait chercher `parameters.config`, ne rien
   *      trouver, et envoyer un **corps vide** — donc un `200` pour une écriture nulle.
   *   2. **La cible.** `PATCH /config` écrit la config **du projet** : mesuré, il **matérialise un
   *      `config.json` à la racine du dépôt** là où il n'y en avait aucun. Un panneau de réglages
   *      configure l'outil, pas un dépôt — c'est `/global/config` qui convient, et il ne dépose
   *      rien dans l'arbre de travail.
   */
  const saveConfig = async (patch: Record<string, unknown>, label: string) => {
    setSettingsBusy(label)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.global.config
      .update({ config: patch })
      .catch((cause: unknown) => {
        setSettingsError(String(cause))
        return undefined
      })
    setSettingsBusy(undefined)
    if (result) {
      // Le rechargement **avant** la notice : `loadSettings` commence par effacer les messages, donc
      // poser la notice d'abord la faisait disparaître aussitôt — un succès qui ne se voyait jamais.
      await loadSettings("general")
      setSettingsNotice(`${label} saved`)
    }
  }

  /**
   * Enregistrer une clé : `PUT /auth/{providerID}`, corps `ApiAuth`.
   *
   * `authBody` rend `undefined` sur un champ vide — et on n'écrit alors **rien** : écrire une clé
   * vide écraserait une clé valide.
   */
  const saveProvider = async (providerID: string, method: AuthMethod) => {
    const body = authBody(method, providerValuesFor(providerID))
    if (!body) {
      setSettingsError("empty field — nothing was written")
      return
    }
    setSettingsBusy(`provider:${providerID}`)
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.auth.set({ providerID, ...body }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      // Une clé ajoutée change les modèles que ce fournisseur propose : le cache devient faux.
      setModelOptions([])
      setSettingsNotice(`${providerID} saved`)
      setProviderValues({})
    }
  }

  /** Ajouter un plugin : `POST /plugin`, corps `{ spec }`. */
  const addPlugin = async () => {
    const spec = pluginSpec().trim()
    if (!spec) return
    setSettingsBusy("plugin")
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.plugin.add({ spec, ...scope() }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      setSettingsNotice("plugin added")
      setPluginSpec("")
      await loadPlugins()
    }
  }

  /** Retirer un plugin : `DELETE /plugin/{spec}`. */
  const removePlugin = async (spec: string) => {
    setSettingsBusy("plugin")
    setSettingsError(undefined)
    setSettingsNotice(undefined)
    const result = await client.plugin.remove({ spec, ...scope() }).catch((cause: unknown) => {
      setSettingsError(String(cause))
      return undefined
    })
    setSettingsBusy(undefined)
    if (result) {
      setSettingsNotice("plugin removed")
      await loadPlugins()
    }
  }

  const selectSession = async (sessionID: string) => {
    setActive(sessionID)
    setError(undefined)
    await loadMessages(sessionID)
  }

  const createSession = async () => {
    const result = await client.session.create(scope()).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    const created = (result as { data?: SessionSummary } | undefined)?.data
    await loadSessions()
    if (created?.id) await selectSession(created.id)
  }

  const startRename = (session: SessionSummary) => {
    setRenaming(session.id)
    setRenameDraft(session.title ?? "")
  }

  const commitRename = async () => {
    const sessionID = renaming()
    if (!sessionID) return
    const title = renameDraft().trim()
    setRenaming(undefined)
    if (!title) return
    await client.session.update({ sessionID, title, ...scope() }).catch((cause: unknown) => setError(String(cause)))
    await loadSessions()
  }

  const removeSession = async (session: SessionSummary) => {
    setConfirming(undefined)
    await client.session.delete({ sessionID: session.id, ...scope() }).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    if (active() === session.id) {
      setActive(undefined)
      setMessages([])
    }
    await loadSessions()
  }

  const replyPermission = async (request: PermissionRequest, reply: PermissionReply) => {
    // Optimistic removal: the server also emits `permission.replied`, which is authoritative.
    setPermissions((current) => dropPermission(current, request.id))
    const result = await client.permission
      .reply({ requestID: request.id, reply, ...scope() })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (!result) await loadPermissions()
    const sessionID = active()
    if (sessionID) await loadMessages(sessionID)
  }

  /**
   * Lit un fichier en data URL — la forme que `FilePartInput.url` attend, relevée dans le SDK et
   * confirmée par l'usage de l'app existante (`build-request-parts.ts:190`, `url: attachment.dataUrl`).
   */
  const readAsDataUrl = (file: File, mime: string) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener("error", () => resolve(""))
      reader.addEventListener("load", () => {
        const value = typeof reader.result === "string" ? reader.result : ""
        const separator = value.indexOf(",")
        resolve(separator === -1 ? "" : `data:${mime};base64,${value.slice(separator + 1)}`)
      })
      reader.readAsDataURL(file)
    })

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setAttachError(undefined)
    const accepted: Attachment[] = []
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream"
      const problem = validateAttachment({ size: file.size, mime, filename: file.name })
      if (problem) {
        setAttachError(problem)
        continue
      }
      const dataUrl = await readAsDataUrl(file, mime)
      if (!dataUrl) {
        setAttachError(`Lecture impossible : « ${file.name} »`)
        continue
      }
      accepted.push({
        id: `${file.name}:${file.size}:${accepted.length}`,
        mime,
        filename: file.name,
        dataUrl,
        size: file.size,
      })
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted])
  }

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id))

  const send = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault()
    const sessionID = active()
    const text = draft().trim()
    const files = attachments()
    if (!sessionID || (!text && files.length === 0)) return
    setDraft("")
    setAttachments([])
    setAttachError(undefined)
    const parts = [...(text ? [{ type: "text" as const, text }] : []), ...files.map(buildFilePart)]
    const result = await client.session
      .promptAsync({ sessionID, parts, ...scope() })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (result) await loadMessages(sessionID)
  }

  const applyDirectory = (value: string) => {
    setDirectory(value)
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(DIR_KEY, trimmed)
    else localStorage.removeItem(DIR_KEY)
    setActive(undefined)
    setMessages([])
    void loadPath()
    void loadSessions()
    void loadPermissions()
  }

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }))

  /** Un dossier est ouvert par défaut : on replie pour dégager, on ne déplie pas pour découvrir. */
  const groupOpen = (key: string) => groupsOpen()[key] !== false
  const toggleGroup = (key: string) => setGroupsOpen((current) => ({ ...current, [key]: current[key] === false }))
  const toggleDetail = (id: string) => setDetailsOpen((current) => ({ ...current, [id]: !current[id] }))

  /**
   * Les plugins seulement — les seuls accès hors session.
   *
   * Ils se lisent au montage : `GET /plugin` pèse **708 octets**. Les commandes ne sont plus lues :
   * la section qui les listait a été retirée, parce qu'une route qui existe n'est pas une raison
   * d'afficher — `GET /command` pesait 736 669 octets compressés pour un catalogue qu'on ne
   * consulte pas (un skill s'injecte, il ne se parcourt pas).
   */
  const loadPlugins = async () => {
    const result = await client.plugin.list(scope()).catch(() => undefined)
    setPlugins((result as { data?: PluginList } | undefined)?.data)
  }

  /** Déplier les sessions cachées d'un dossier. */
  const toggleMore = (key: string) => setMoreOpen((current) => ({ ...current, [key]: !current[key] }))

  /** Le fil suit son propre bas : un tour ajouté est toujours visible. */
  let scroller: HTMLDivElement | undefined
  createEffect(() => {
    messages()
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  })

  onMount(async () => {
    setHealth(await fetchHealth())
    await loadPath()
    await loadProjects()
    await loadSessions()
    await loadPermissions()
    await loadPlugins()

    const healthTimer = setInterval(async () => setHealth(await fetchHealth()), 10_000)
    // La charpente suit la largeur de fenêtre : le solveur est pur, donc rien à mémoriser ici.
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener("resize", onResize)
    // Échap ferme la feuille de configuration — un panneau modal qui ne se ferme qu'à la souris
    // piège celui qui l'a ouvert au clavier.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfigOpen(false)
    }
    window.addEventListener("keydown", onKey)
    // Debounced search: the list endpoint takes `search`, so the server does the filtering.
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    createEffect(() => {
      query()
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => void loadSessions(), 250)
    })

    // Tracks transitions so a recovered stream can re-sync what it missed while down.
    let wasConnected = false

    const unsubscribe = subscribeEvents({
      onEvent: (event) => {
        if (event.type === "permission.asked" || event.type === "permission.replied") {
          setPermissions((current) => reducePermissions(current, event))
        }
        if (event.type === "session.created" || event.type === "session.deleted") void loadSessions()

        const sessionID = active()
        if (sessionID && JSON.stringify(event.properties ?? {}).includes(sessionID)) void loadMessages(sessionID)
      },
      onState: (state) => {
        setStream(state)
        // A dropped stream means events were missed while it was down. Without this re-sync, a
        // permission asked during the outage would never surface — observed in P5: the pill read
        // "SSE connecté" while a pending request stayed invisible until a manual reload.
        if (state.connected && !wasConnected) {
          wasConnected = true
          void loadPermissions()
          void loadSessions()
        }
        if (!state.connected) wasConnected = false
      },
    })

    onCleanup(() => {
      clearInterval(healthTimer)
      clearTimeout(searchTimer)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("keydown", onKey)
      unsubscribe()
    })
  })

  const renderPart = (part: Part, role: string) => {
    // Les parties de protocole (`step-start`, `step-finish`, `snapshot`…) ne portent rien pour
    // l'utilisateur : elles ne s'affichent pas — un nom de type interne n'est pas une information.
    if (!isVisiblePart(part)) return null
    if (part.type === "text") {
      const text = part.text ?? ""
      // Le bloc d'injections arrive en texte brut, dans le même message que le prompt. On le lit
      // comme une structure et il ne s'affiche **pas** comme si l'utilisateur l'avait écrit.
      const injections = parseInjections(text)
      if (injections) {
        const id = part.id ?? "injections"
        return (
          <ContextInjections
            injections={injections}
            open={Boolean(expanded()[id])}
            onToggle={() => toggle(id)}
          />
        )
      }
      if (role === "user") return <UserPrompt text={text} />
      return <p class="part text">{text}</p>
    }
    if (part.type === "file") {
      const file = part as Extract<Part, { type: "file" }>
      return <FileChip label={filePartLabel(file)} thumb={isImageMime(file.mime ?? "") ? file.url : undefined} />
    }
    if (part.type === "reasoning") {
      const thought = part as { id: string; text: string }
      return (
        <Reasoning text={thought.text} open={Boolean(expanded()[thought.id])} onToggle={() => toggle(thought.id)} />
      )
    }

    const toolPart = part as Extract<Part, { type: "tool" }>
    return (
      <ToolLine
        tool={toolPart.tool}
        state={toolPart.state}
        open={Boolean(expanded()[toolPart.id])}
        onToggle={() => toggle(toolPart.id)}
      />
    )
  }

  /**
   * Ce qui est sain ne s'affiche pas. Le bandeau n'existe que si quelque chose est cassé, et
   * disparaît dès que c'est réparé — l'absence est le meilleur indicateur.
   */
  const notice = () => {
    if (!health()?.healthy) return { text: "server unreachable", bad: true }
    if (!stream().connected) return { text: "stream interrupted", bad: false }
    return undefined
  }

  return (
    <div class="layout" style={layoutStyle()}>
      <aside class="rail">
        <div class="grip" onPointerDown={startSidebarDrag} />

        {/* Le nom du produit. Le nom est en discussion — « opencodev2 » évoque un agent de codage,
            pas un généraliste : on garde la place, sans inventer de marque. */}
        <div class="rail-head">
          <span class="wordmark">opencodev2</span>
        </div>

        {/* 1 — Le geste le plus fréquent, donc en premier et sans clic. */}
        <div class="rail-new">
          <button class="new-session" title="Start an empty conversation" onClick={() => void createSession()}>
            <span class="new-session-plus">+</span>
            <span>New session</span>
          </button>
        </div>

        {/* 2 — Les plugins : un bouton par plugin. La section **n'existe pas** s'il n'y en a aucun. */}
        <Show when={pluginEntries(plugins()).length > 0}>
          <div class="rail-plugins">
            <span class="rail-label">plugins</span>
            <For each={pluginEntries(plugins())}>
              {(entry) => <PluginButton label={entry.label} hint={entry.hint} />}
            </For>
          </div>
        </Show>

        {/* B — Workspaces : la seule partie qui défile. */}
        <div class="rail-workspaces">
          <input
            class="search"
            type="search"
            placeholder="Search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />

          <div class="rows">
          <For each={groupByDirectory(sessions())}>
              {(group) => {
                const split = () => splitSessions(group.sessions, Boolean(moreOpen()[group.key]))
                return (
                <>
                  <WorkspaceGroup
                  label={group.label}
                  hint={group.hint}
                  count={group.sessions.length}
                  open={groupOpen(group.key)}
                  onToggle={() => toggleGroup(group.key)}
                />
                <Show when={groupOpen(group.key)}>
                    <For each={split().shown}>
                    {(session) => (
                      <Show
                        when={renaming() === session.id}
                        fallback={
                          <SessionRow
                            title={session.title || "(untitled)"}
                            hint={[
                              session.title || "(untitled)",
                              ...sessionDetails(session).map((line) => `${line.label} : ${line.value}`),
                            ].join("\n")}
                            time={sessionTimestamp(session)}
                            now={now()}
                            active={session.id === active()}
                            open={Boolean(detailsOpen()[session.id])}
                            details={sessionDetails(session)}
                            onSelect={() => void selectSession(session.id)}
                            onToggle={() => toggleDetail(session.id)}
                          >
                            <span class="row-actions">
                              <button
                                class="ghost"
                                title="Rename"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  startRename(session)
                                }}
                              >
                                ✎
                              </button>
                              <Show
                                when={confirming() === session.id}
                                fallback={
                                  <button
                                    class="ghost"
                                    title="Delete"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setConfirming(session.id)
                                    }}
                                  >
                                    ✕
                                  </button>
                                }
                              >
                                <button
                                  class="ghost"
                                  title="Confirm delete"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void removeSession(session)
                                  }}
                                >
                                  delete
                                </button>
                                <button
                                  class="ghost"
                                  title="Cancel"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setConfirming(undefined)
                                  }}
                                >
                                  cancel
                                </button>
                              </Show>
                            </span>
                          </SessionRow>
                        }
                      >
                        <input
                          class="rename"
                          autofocus
                          value={renameDraft()}
                          onInput={(event) => setRenameDraft(event.currentTarget.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void commitRename()
                            if (event.key === "Escape") setRenaming(undefined)
                          }}
                        />
                      </Show>
                    )}
                  </For>
                  <Show when={split().hidden > 0}>
                    <ShowMore hidden={split().hidden} expanded={false} onToggle={() => toggleMore(group.key)} />
                  </Show>
                  <Show when={Boolean(moreOpen()[group.key]) && group.sessions.length > SESSION_LIMIT}>
                    <ShowMore hidden={0} expanded={true} onToggle={() => toggleMore(group.key)} />
                  </Show>
                </Show>
              </>
                )
              }}
          </For>
          </div>
        </div>

        {/* 4 — Settings : le dossier de travail, et l'accès à la configuration. */}
        <div class="rail-foot">
          <label class="folder" title="Working directory — the rail lists sessions from here">
            <span>⌂</span>
            <input
              type="text"
              list="oc-workspaces"
              placeholder={serverPath() ?? "server directory"}
              value={directory()}
              onChange={(event) => applyDirectory(event.currentTarget.value)}
            />
          </label>
          {/* La complétion accompagne **l'action**, et l'action est ici. Elle était dans les
              réglages : on ne va pas chercher un chemin là où l'on va changer une préférence. */}
          <datalist id="oc-workspaces">
            <For each={projects()}>{(path) => <option value={path} />}</For>
          </datalist>
          {/* Une seule chose ici : l'accès au panneau. Les identifiants sont descendus dans `General`
              (bloc *Server*) — réglés **une fois par serveur**, ils tenaient un bouton et un badge
              permanents, c'est-à-dire de la place pour rien. Même règle que le dossier de travail,
              dans l'autre sens : lui est quotidien, donc il reste. */}
          <span class="foot-row">
            <button class="ghost" title="Settings: defaults, providers, agents, MCP" onClick={openConfig}>
              settings
            </button>
          </span>
        </div>
      </aside>

      <main class="thread">
        <Show when={columns().sidebar === 0 || notice()}>
          <div class="thread-head">
            <Show when={columns().sidebar === 0}>
              <button class="ghost" title="Show sessions" onClick={toggleSidebar}>
                ☰
              </button>
            </Show>
            <Show when={notice()}>
              {(state) => (
                <span class="notice" classList={{ bad: state().bad }}>
                  {state().text}
                </span>
              )}
            </Show>
          </div>
        </Show>

        <Show when={active()} fallback={<p class="empty">Pick a session, or start one.</p>}>
          <div class="scroll" ref={scroller}>
            <div class="transcript">
              <Show when={error()}>
                <p class="error">{error()}</p>
              </Show>
              <For each={messages()}>
                {(message) => (
                  <Turn role={message.info.role}>
                    <For each={message.parts}>{(part) => renderPart(part, message.info.role)}</For>
                  </Turn>
                )}
              </For>
            </div>
          </div>

          <form class="composer" onSubmit={send}>
            <div class="composer-inner">
              <Show when={attachments().length > 0}>
                <ul class="pending">
                  <For each={attachments()}>
                    {(item) => (
                      <li>
                        <FileChip
                          label={item.filename}
                          thumb={isImageMime(item.mime) ? item.dataUrl : undefined}
                          size={fileSizeLabel(item.size)}
                          onRemove={() => removeAttachment(item.id)}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={attachError()}>{(message) => <p class="error">{message()}</p>}</Show>
              <textarea
                rows="2"
                placeholder="Describe a task, paste context, attach a file…"
                value={draft()}
                onInput={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void send()
                  }
                }}
              />
              <div class="composer-bar">
                <label class="attach" title="Attach files">
                  +
                  <input
                    class="hidden-input"
                    type="file"
                    multiple
                    onChange={(event) => {
                      void addFiles(event.currentTarget.files)
                      // Remis à zéro pour qu'attacher deux fois le même fichier soit possible.
                      event.currentTarget.value = ""
                    }}
                  />
                </label>
                <span class="spacer" />
                <button class="primary" type="submit" disabled={!draft().trim() && attachments().length === 0}>
                  Send
                </button>
              </div>
            </div>
          </form>
        </Show>
      </main>

      <aside class="side" classList={{ open: permissions().length > 0 }}>
        <div class="side-inner">
          <For each={permissions()}>
            {(request) => (
              <PermissionSheet request={request} onReply={(reply) => void replyPermission(request, reply)} />
            )}
          </For>
        </div>
      </aside>

      <Show when={configOpen()}>
        <SettingsSheet
          sections={SETTINGS_SECTIONS}
          active={settingsSection()}
          onSelect={selectSection}
          onClose={() => setConfigOpen(false)}
          notice={settingsNotice()}
          error={settingsError()}
          busy={settingsBusy()}
        >
          {/* Les réglages **déclarés** — general, behavior, tools — d'un seul bloc.
              Ajouter un réglage, c'est ajouter une entrée dans `SETTING_SPECS`, pas une ligne ici.
              `general` reçoit en plus le dossier de travail et le pied de page : c'est la seule page
              qui porte autre chose que des clés de `Config`. */}
          <Show when={SETTING_SPECS[settingsSection()]}>
            <GeneralSection
              blocks={settingGroups(SETTING_SPECS[settingsSection()] ?? [])}
              choicesOf={optionsOf}
              draftOf={specDraft}
              checkedOf={(spec) => config()[spec.key] === true}
              busy={settingsBusy()}
              onInput={(spec, value) => setSpecDraft(spec.key, value)}
              onCommit={commitSpec}
              footnote={settingsSection() === "general" ? generalFootnote() : undefined}
              server={
                settingsSection() === "general"
                  ? {
                      address: serverUrl || undefined,
                      username: authUser(),
                      password: authPass(),
                      stored: Boolean(credentials),
                      onChange: (field, value) => (field === "username" ? setAuthUser(value) : setAuthPass(value)),
                      // `rememberCredentials` réécrit le stockage puis recharge la page : le client
                      // SDK et le flux SSE sont bâtis au démarrage, donc rien moins qu'un
                      // redémarrage ne peut prendre les nouveaux en-têtes.
                      onSave: () => rememberCredentials({ username: authUser(), password: authPass() }),
                      onForget: () => rememberCredentials(undefined),
                    }
                  : undefined
              }
            />
          </Show>

          <Show when={settingsSection() === "providers"}>
            {/* La section choisit elle-même entre la grille et le détail : une page qui décide de sa
                mise en page se teste sans monter la moitié de l'application. */}
            <Show
              when={providerRows().length > 0 || providerSelected()}
              fallback={<p class="set-note">loading providers…</p>}
            >
              <ProvidersSection
                providers={providerRows()}
                catalog={providerCatalog()}
                query={providerQuery()}
                onQuery={searchProviders}
                catalogPending={catalogPending()}
                selected={providerSelected()}
                onSelect={setProviderSelected}
                methods={authMethods(providerAuth(), providerSelected() ?? "")}
                values={providerValuesFor(providerSelected() ?? "")}
                busy={settingsBusy() === `provider:${providerSelected()}`}
                onInput={(key, value) =>
                  setProviderValues((current) => ({ ...current, [scopeKey(providerSelected() ?? "", key)]: value }))
                }
                onSubmit={(method) => void saveProvider(providerSelected() ?? "", method)}
                models={providerModels()[providerSelected() ?? ""] ?? []}
                defaultModel={modelSpec() ? specDraft(modelSpec() as SettingSpec) : ""}
                defaultModelChoices={modelOptions()}
                onDefaultModel={(value) => {
                  const spec = modelSpec()
                  if (spec) commitSpec(spec, value)
                }}
              />
            </Show>
          </Show>

          <Show when={settingsSection() === "agents"}>
            <AgentsSection
              agents={filterAgents(agentRows(agents()), agentQuery())}
              total={agentRows(agents()).length}
              summary={agentSummary(agentCounts(agentRows(agents())))}
              query={agentQuery()}
              onQuery={setAgentQuery}
              modelOf={agentModelOf}
              disabledOf={agentDisabledOf}
              drafts={agentDrafts()}
              busy={settingsBusy()}
              onDraft={(name, value) => setAgentDrafts((current) => ({ ...current, [name]: value }))}
              onSave={(name) => void saveAgent(name, { model: agentDrafts()[name] ?? "" }, `agent ${name}`)}
              onToggle={toggleAgent}
            />
          </Show>

          <Show when={settingsSection() === "mcp"}>
            <McpSection
              total={Object.keys(mcp()).length}
              connected={mcpConnectedCount(mcp())}
              problems={mcpProblems(mcp())}
            />
          </Show>

          <Show when={settingsSection() === "plugins"}>
            <PluginsSection
              plugins={pluginEntries(plugins())}
              spec={pluginSpec()}
              busy={settingsBusy() === "plugin"}
              onSpec={setPluginSpec}
              onAdd={() => void addPlugin()}
              onRemove={(spec) => void removePlugin(spec)}
            />
          </Show>
        </SettingsSheet>
      </Show>
    </div>
  )
}
