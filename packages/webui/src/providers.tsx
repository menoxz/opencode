import { For, Show, createMemo, createSignal } from "solid-js"
import { Picker } from "./picker"
import {
  DEFAULT_NPM,
  isFormFillable,
  methodFields,
  methodLabel,
  type AuthMethod,
  type Choice,
  type ProviderSummary,
} from "./settings"

/**
 * La page `Providers` — **une collection, puis le détail d'un de ses éléments**.
 *
 * Elle remplace huit formulaires repliables empilés. Ce n'était pas seulement trop de formulaires :
 * c'est que la relation qui donne sa raison d'être à l'objet était **absente**. Un fournisseur existe
 * pour ses modèles, et aucun modèle n'était visible nulle part. La décomposition en 1 → n n'est donc
 * pas une décoration : c'est ce qui manquait à l'écran.
 *
 * Deux états, jamais trois :
 *
 *   - la **grille** au repos — ce qu'on a, et on ne cherche le catalogue qu'en tapant ;
 *   - le **détail** d'un fournisseur — ses identifiants (le « 1 »), ses modèles (le « n »).
 *
 * Le détail **remplace** la grille au lieu de s'ouvrir à côté : le rail est déjà une colonne, une
 * deuxième en ferait trois, et la place se paierait sur le contenu.
 *
 * **Ce que la page écrit.** Un écran qui ne saurait qu'afficher ne servirait à rien : la page
 * *déclare* un fournisseur (`provider.<id>`), règle son adresse (`options.baseURL`, `npm`), active la
 * découverte, ajoute un modèle à la main et en exclut un. Chacune de ces écritures a son bouton, et
 * une seule est **sans retour** — c'est écrit à l'écran plutôt que découvert.
 */

/** L'état d'un fournisseur, en un mot. Jamais par la couleur seule : un point qui ne se lit pas est un point qui ne dit rien. */
function ProviderState(props: { ready: boolean; configured: boolean }) {
  return (
    <span class="prov-state" classList={{ "is-ready": props.ready, "is-missing": !props.ready }}>
      <span class="prov-dot" />
      {props.ready ? "ready" : props.configured ? "no key" : "not configured"}
    </span>
  )
}

/**
 * La grille — le « n ».
 *
 * Au repos elle montre **ce qu'on a** (sept fournisseurs), pas les 228 du catalogue : le fréquent
 * passe en premier et sans clic, le rare se cherche. C'est la règle de fréquence appliquée à un
 * contrôle qui a deux populations — et elle vaut mieux qu'un choix binaire affiché en permanence.
 */
export function ProviderGrid(props: {
  /** Les fournisseurs configurés. */
  providers: ProviderSummary[]
  /** Le catalogue, vide tant qu'on n'a pas cherché — il pèse 6,7 Mo. */
  catalog: ProviderSummary[]
  query: string
  onQuery: (query: string) => void
  onOpen: (id: string) => void
  catalogPending?: boolean
  /** Déclarer ce que le catalogue ne contient pas — un serveur maison, un revendeur : c'est **rare**, donc replié. */
  addOpen?: boolean
  draft?: Record<string, string>
  onDraft?: (key: string, value: string) => void
  onCreate?: () => void
  onCancelAdd?: () => void
}) {
  const mine = createMemo(() => new Set(props.providers.map((entry) => entry.id)))

  const rows = createMemo(() => {
    const needle = props.query.trim().toLowerCase()
    if (!needle) return props.providers
    const pool = props.catalog.length > 0 ? props.catalog : props.providers
    const matched = pool.filter(
      (entry) => entry.name.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle),
    )
    // Ce qu'on a passe devant : on cherche le plus souvent parmi ses propres fournisseurs.
    return matched.sort((left, right) => Number(mine().has(right.id)) - Number(mine().has(left.id)))
  })

  return (
    <div class="prov">
      <div class="prov-search">
        <input
          class="set-input"
          type="text"
          placeholder="search providers"
          aria-label="search providers"
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
        <span class="prov-count">
          {rows().length} of {props.query.trim() ? "the catalog" : "yours"}
        </span>
        <button class="ghost" onClick={() => props.onCancelAdd?.()} title="Declare a provider the catalog does not know">
          {props.addOpen ? "cancel" : "+ add provider"}
        </button>
      </div>

      {/* Le formulaire de déclaration : trois champs, et une chose à dire — l'ajout est **sans retour**
          par l'API (aucun `DELETE` sur les routes de configuration), donc seul le fichier retire. */}
      <Show when={props.addOpen}>
        <div class="prov-add">
          <div class="set-control">
            <input
              class="set-input"
              type="text"
              placeholder="id, e.g. my-gateway"
              aria-label="provider id"
              value={props.draft?.id ?? ""}
              onInput={(event) => props.onDraft?.("id", event.currentTarget.value)}
            />
            <input
              class="set-input"
              type="text"
              placeholder="npm package"
              aria-label="npm package"
              title="The adapter that speaks to this provider"
              value={props.draft?.npm ?? DEFAULT_NPM}
              onInput={(event) => props.onDraft?.("npm", event.currentTarget.value)}
            />
            <input
              class="set-input"
              type="text"
              placeholder="base URL, e.g. https://api.example.com/v1"
              aria-label="base URL"
              value={props.draft?.baseURL ?? ""}
              onInput={(event) => props.onDraft?.("baseURL", event.currentTarget.value)}
            />
            <button class="ghost bordered" onClick={() => props.onCreate?.()}>
              create
            </button>
          </div>
          <p class="set-note">
            The id becomes the key of <strong>provider.&lt;id&gt;</strong>, and the left half of every
            `model` reference. An id normalises to lower case, without spaces — a key nothing could cite
            is a key nothing could use. Removing it again is a job for the config file: the API has no
            delete.
          </p>
        </div>
      </Show>

      <Show
        when={rows().length > 0}
        fallback={
          <p class="set-note">
            {props.catalogPending ? "searching the catalog…" : "no provider matches — nothing to show"}
          </p>
        }
      >
        <div class="prov-grid">
          <For each={rows()}>
            {(entry) => (
              <button class="prov-tile" onClick={() => props.onOpen(entry.id)}>
                <span class="prov-tile-name">{entry.name}</span>
                <span class="prov-tile-models">
                  {entry.models} {entry.models === 1 ? "model" : "models"}
                </span>
                <ProviderState ready={entry.ready} configured={mine().has(entry.id)} />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

/**
 * Le détail — le « 1 », puis son « n ».
 *
 * Les identifiants en haut (la clé, sa sauvegarde), les modèles en bas. Le modèle par défaut est **du
 * fournisseur** à l'écran mais son effet est **global** — `Config.model` est une seule clé, il n'existe
 * pas de défaut par fournisseur (mesuré : la route et le schéma ne le portent pas). Le contrôle le dit
 * donc au lieu de le promettre : un réglage qui mentit sur sa portée est pire qu'un réglage absent.
 */
export function ProviderDetail(props: {
  summary: ProviderSummary
  methods: AuthMethod[]
  /** Les identifiants en cours de saisie, propres à **ce** fournisseur. */
  values: Record<string, string>
  busy?: boolean
  onInput: (key: string, value: string) => void
  onSubmit: (method: AuthMethod) => void
  models: Choice[]
  defaultModel: string
  defaultModelChoices: Choice[]
  onDefaultModel: (value: string) => void
  onBack: () => void
  /** La connexion telle que le **fichier** la porte — les deux magasins ne se confondent pas. */
  connection: Record<string, string>
  onConnection: (key: string, value: string) => void
  onConnectionSave: () => void
  discover: boolean
  onDiscover: (on: boolean) => void
  /** Les modèles retirés de la liste disponible (`blacklist` du fournisseur). */
  excluded: string[]
  onAddModel: (modelID: string) => void
  onExclude: (modelID: string, excluded: boolean) => void
}) {
  const [query, setQuery] = createSignal("")
  const [draft, setDraft] = createSignal("")
  const shown = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return props.models
    return props.models.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle),
    )
  })
  const isExcluded = (modelID: string) => props.excluded.includes(modelID)

  return (
    <div class="prov-detail">
      <button class="prov-back" onClick={() => props.onBack()}>
        ← Providers <span class="prov-back-sep">/</span> <span class="prov-back-name">{props.summary.name}</span>
      </button>

      {/* La connexion : **le second magasin**. La clé est un identifiant (`PUT /auth/{id}`), l'adresse
          est de la configuration (`provider.<id>.options.baseURL`) — deux écritures, deux endroits,
          donc deux contrôles séparés plutôt qu'un bouton qui ferait semblant d'écrire une fois. */}
      <section class="prov-pane">
        <h2 class="prov-pane-title">
          Connection <span class="prov-pane-hint">{props.summary.id}</span>
        </h2>
        <div class="set-control">
          <input
            class="set-input"
            type="text"
            placeholder="base URL"
            aria-label="base URL"
            value={props.connection.baseURL ?? ""}
            onInput={(event) => props.onConnection("baseURL", event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onConnectionSave()
            }}
          />
          <input
            class="set-input"
            type="text"
            placeholder="npm package"
            aria-label="npm package"
            title="The adapter that speaks to this provider"
            value={props.connection.npm ?? ""}
            onInput={(event) => props.onConnection("npm", event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onConnectionSave()
            }}
          />
          <button class="ghost bordered" disabled={props.busy} onClick={() => props.onConnectionSave()}>
            {props.busy ? "…" : "Save"}
          </button>
        </div>
        <label class="prov-switch">
          <input
            type="checkbox"
            checked={props.discover}
            onChange={(event) => props.onDiscover(event.currentTarget.checked)}
          />
          <span>Fetch this provider's model list from its own endpoint</span>
        </label>
        {/* Dire *quand*, parce que la case ne fait pas ce qu'on croit : le serveur appelle la
            découverte en **chargeant** ses fournisseurs, pas à chaque requête. */}
        <p class="set-note">
          The server reads its own <strong>/models</strong> endpoint when it loads providers — new models
          appear at the next server start, not the moment this box is ticked.
        </p>
      </section>

      <section class="prov-pane">
        <h2 class="prov-pane-title">
          {props.summary.name} <ProviderState ready={props.summary.ready} configured={true} />
        </h2>

        <For each={props.methods}>
          {(method) => (
            <div class="prov-method">
              <span class="prov-method-label">{methodLabel(method)}</span>
              <Show
                when={isFormFillable(method)}
                fallback={<span class="set-note">connect in the browser — nothing to type here</span>}
              >
                <div class="set-control">
                  <For each={methodFields(method)}>
                    {(field) => (
                      <input
                        class="set-input"
                        type={field.secret ? "password" : "text"}
                        placeholder={field.placeholder ?? field.label}
                        title={field.label}
                        value={props.values[field.key] ?? ""}
                        onInput={(event) => props.onInput(field.key, event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") props.onSubmit(method)
                        }}
                      />
                    )}
                  </For>
                  <button class="ghost bordered" disabled={props.busy} onClick={() => props.onSubmit(method)}>
                    {props.busy ? "…" : "Save"}
                  </button>
                </div>
              </Show>
            </div>
          )}
        </For>

        {/* Les huit fournisseurs qui déclarent une méthode sont une minorité : quand il n'y en a
            aucune, il faut le dire — sinon la section disparaît et l'écran a l'air cassé. */}
        <Show when={props.methods.length === 0}>
          <p class="set-note">
            The server declares no sign-in method for this provider — its key comes from the config or
            the environment, not from this screen.
          </p>
        </Show>
      </section>

      <section class="prov-pane">
        <div class="prov-models-head">
          <h2 class="prov-pane-title">
            {props.models.length} {props.models.length === 1 ? "model" : "models"}
          </h2>
          <input
            class="set-input prov-models-filter"
            type="text"
            placeholder="search these models"
            aria-label="search these models"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>

        {/* Un modèle que la découverte ne sait pas décrire s'écrit **à la main** : l'entrée déclarée
            survit à la découverte, qui ne fait qu'ajouter ce qui manque. */}
        <div class="set-control prov-model-add">
          <input
            class="set-input"
            type="text"
            placeholder="model id, e.g. kimi-k2"
            aria-label="model id"
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft().trim()) {
                props.onAddModel(draft().trim())
                setDraft("")
              }
            }}
          />
          <button
            class="ghost bordered"
            disabled={!draft().trim()}
            onClick={() => {
              props.onAddModel(draft().trim())
              setDraft("")
            }}
          >
            add model
          </button>
        </div>

        <Show
          when={shown().length > 0}
          fallback={
            <p class="set-note">
              {props.models.length === 0
                ? "this provider declares no models — writing a key is what registers it"
                : "no model in this provider matches"}
            </p>
          }
        >
          <div class="prov-models">
            <For each={shown()}>
              {(model) => (
                <div class="prov-model" classList={{ "is-excluded": isExcluded(model.value) }}>
                  <span class="prov-model-name">{model.label}</span>
                  {/* L'action se révèle au survol **de la ligne qui porte le libellé** : une colonne
                      d'actions prendrait la place du texte, et un libellé est l'information. */}
                  <button
                    class="prov-model-action"
                    title={isExcluded(model.value) ? "put back in the available list" : "keep out of the available list"}
                    onClick={() => props.onExclude(model.value, !isExcluded(model.value))}
                  >
                    {isExcluded(model.value) ? "restore" : "exclude"}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="prov-default">
          <span class="set-label">Default for new sessions</span>
          <Picker
            choices={props.defaultModelChoices}
            value={props.defaultModel}
            placeholder="server default"
            label="Default for new sessions"
            onChange={(value) => props.onDefaultModel(value)}
          />
          <p class="set-note">
            This setting is global: the server keeps one default, not one per provider.
          </p>
        </div>
      </section>
    </div>
  )
}

/**
 * La section — elle choisit entre les deux états, et rien de plus.
 *
 * Le choix vit ici plutôt que dans `app.tsx` : une page qui décide de sa propre mise en page se teste
 * sans monter la moitié de l'application.
 */
export function ProvidersSection(props: {
  providers: ProviderSummary[]
  catalog: ProviderSummary[]
  query: string
  onQuery: (query: string) => void
  catalogPending?: boolean
  selected?: string
  onSelect: (id: string | undefined) => void
  methods: AuthMethod[]
  values: Record<string, string>
  busy?: boolean
  onInput: (key: string, value: string) => void
  onSubmit: (method: AuthMethod) => void
  models: Choice[]
  defaultModel: string
  defaultModelChoices: Choice[]
  onDefaultModel: (value: string) => void
  addOpen?: boolean
  draft?: Record<string, string>
  onDraft?: (key: string, value: string) => void
  onCreate?: () => void
  onCancelAdd?: () => void
  connection: Record<string, string>
  onConnection: (key: string, value: string) => void
  onConnectionSave: () => void
  discover: boolean
  onDiscover: (on: boolean) => void
  excluded: string[]
  onAddModel: (modelID: string) => void
  onExclude: (modelID: string, excluded: boolean) => void
}) {
  const current = createMemo(() => props.providers.find((entry) => entry.id === props.selected))
  const fromCatalog = createMemo(() => props.catalog.find((entry) => entry.id === props.selected))

  return (
    <Show
      when={props.selected}
      fallback={
        <ProviderGrid
          providers={props.providers}
          catalog={props.catalog}
          query={props.query}
          onQuery={props.onQuery}
          onOpen={(id) => props.onSelect(id)}
          catalogPending={props.catalogPending}
          addOpen={props.addOpen}
          draft={props.draft}
          onDraft={props.onDraft}
          onCreate={props.onCreate}
          onCancelAdd={props.onCancelAdd}
        />
      }
    >
      {(id) => (
        <ProviderDetail
          summary={
            current() ??
            fromCatalog() ??
            { id: id(), name: id(), models: props.models.length, ready: false }
          }
          methods={props.methods}
          values={props.values}
          busy={props.busy}
          onInput={props.onInput}
          onSubmit={props.onSubmit}
          models={props.models}
          defaultModel={props.defaultModel}
          defaultModelChoices={props.defaultModelChoices}
          onDefaultModel={props.onDefaultModel}
          onBack={() => props.onSelect(undefined)}
          connection={props.connection}
          onConnection={props.onConnection}
          onConnectionSave={props.onConnectionSave}
          discover={props.discover}
          onDiscover={props.onDiscover}
          excluded={props.excluded}
          onAddModel={props.onAddModel}
          onExclude={props.onExclude}
        />
      )}
    </Show>
  )
}
