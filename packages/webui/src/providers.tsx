import { For, Show, createMemo, createSignal } from "solid-js"
import { Picker } from "./picker"
import {
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
      </div>

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
}) {
  const [query, setQuery] = createSignal("")
  const shown = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return props.models
    return props.models.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle),
    )
  })

  return (
    <div class="prov-detail">
      <button class="prov-back" onClick={() => props.onBack()}>
        ← Providers <span class="prov-back-sep">/</span> <span class="prov-back-name">{props.summary.name}</span>
      </button>

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
                <div class="prov-model">
                  <span class="prov-model-name">{model.label}</span>
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
        />
      }
    >
      {(id) => (
        <ProviderDetail
          summary={
            current() ??
            fromCatalog() ?? { id: id(), name: id(), models: props.models.length, ready: false }
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
        />
      )}
    </Show>
  )
}
