import { For, Show } from "solid-js"
import { mcpTone, modeLabel, type AgentRow, type McpProblem } from "./config"
import { ChevronIcon, PluginIcon } from "./icons"
import type { PluginEntry } from "./nav"
import {
  isFormFillable,
  methodFields,
  methodLabel,
  type AuthMethod,
  type SettingsSection,
  type SettingsSectionKey,
} from "./settings"

/**
 * Le panneau de réglages — il **gère** la configuration.
 *
 * Deux colonnes : les sections à gauche, leur contenu à droite. La navigation est **verticale**
 * (cf. `CIBLE.md` §13) : c'est la convention des panneaux de réglages, et la seule forme qui ne
 * change pas quand une section s'ajoute. Une barre horizontale tiendrait à cinq et **casserait à
 * douze**.
 *
 * Une section ne charge ses données qu'à sa sélection — `GET /provider` (6,7 Mo) n'est jamais appelé.
 */

export function SettingsSheet(props: {
  sections: SettingsSection[]
  active: SettingsSectionKey
  onSelect: (key: SettingsSectionKey) => void
  onClose: () => void
  /** Ce qui vient d'être écrit — affiché une fois, jamais en permanence. */
  notice?: string
  error?: string
  busy?: string
  children?: unknown
}) {
  return (
    <>
      <div class="sheet-scrim" onClick={() => props.onClose()} />
      <aside class="sheet settings" role="dialog" aria-label="réglages">
        <header class="sheet-head">
          <span class="sheet-title">réglages</span>
          <button class="ghost" title="Fermer (Échap)" onClick={() => props.onClose()}>
            ✕
          </button>
        </header>

        <div class="sheet-main">
          <nav class="sheet-nav">
            <For each={props.sections}>
              {(section) => (
                <button
                  class="sheet-tab"
                  classList={{ active: section.key === props.active }}
                  title={section.hint}
                  onClick={() => props.onSelect(section.key)}
                >
                  {section.label}
                </button>
              )}
            </For>
          </nav>

          <div class="sheet-body">
            <Show when={props.notice}>
              <p class="sheet-ok">{props.notice}</p>
            </Show>
            <Show when={props.error}>
              <p class="sheet-err">{props.error}</p>
            </Show>
            {props.children as never}
          </div>
        </div>
      </aside>
    </>
  )
}

/**
 * Une ligne de réglage — la grammaire du panneau.
 *
 * Le libellé est à gauche et porte l'information ; le contrôle est à droite et s'aligne ; la
 * description tient **sous le libellé**, parce qu'elle explique le libellé, pas le contrôle.
 * L'utilisateur balaie ainsi une colonne de libellés, pas un tas de champs.
 */
export function SettingRow(props: { label: string; desc?: string; children?: unknown }) {
  return (
    <div class="set-row">
      <div class="set-text">
        <span class="set-label">{props.label}</span>
        <Show when={props.desc}>
          <span class="set-desc">{props.desc}</span>
        </Show>
      </div>
      <div class="set-control">{props.children as never}</div>
    </div>
  )
}

/** Un champ large : la recherche d'agents, l'ajout d'un plugin. */
export function SettingWide(props: { placeholder: string; value: string; note?: string; onInput: (v: string) => void; children?: unknown }) {
  return (
    <div class="set-wide">
      <input
        class="set-input"
        type="search"
        placeholder={props.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <Show when={props.note}>
        <span class="set-note">{props.note}</span>
      </Show>
      {props.children as never}
    </div>
  )
}

/**
 * Un fournisseur — **repliable, un seul ouvert à la fois**.
 *
 * Huit fournisseurs ouverts d'un coup, c'est huit formulaires concurrents ; un seul ouvert, c'est
 * une décision à la fois. Le compte des méthodes est dans l'en-tête, donc il n'y a pas de titre de
 * section à redire.
 *
 * Une méthode `oauth` **ne se remplit pas** : elle se connecte. Le composant le dit au lieu de
 * montrer un champ inerte.
 */
export function ProviderBlock(props: {
  id: string
  methods: AuthMethod[]
  open: boolean
  onToggle: () => void
  values: Record<string, string>
  busy?: boolean
  onInput: (key: string, value: string) => void
  onSubmit: (method: AuthMethod) => void
}) {
  return (
    <div class="provider">
      <button class="provider-head" onClick={() => props.onToggle()}>
        <ChevronIcon size={12} open={props.open} />
        <span class="provider-name">{props.id}</span>
        <span class="provider-count">{props.methods.length}</span>
      </button>

      <Show when={props.open}>
        <div class="provider-body">
          <For each={props.methods}>
            {(method) => (
              <div class="provider-method">
                <span class="provider-method-label">{methodLabel(method)}</span>
                <Show
                  when={isFormFillable(method)}
                  fallback={<span class="set-note">connexion à ouvrir depuis le navigateur — aucune saisie</span>}
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
                      {props.busy ? "…" : "enregistrer"}
                    </button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

/**
 * Les agents — **cherchables**, parce qu'ils sont 34.
 *
 * Trente-quatre lignes ne se parcourent pas : l'utilisateur sait quel agent il veut. Le compteur
 * « n / 34 » est le seul endroit qui donne l'échelle, et il ne s'affiche qu'une fois la recherche
 * commencée — au repos, il n'apprend rien.
 */
export function AgentsSection(props: {
  agents: AgentRow[]
  total: number
  /** Ce que le serveur déclare : « 29 principaux · 5 sous-agents ». Donne l'échelle d'un coup d'œil. */
  summary: string
  query: string
  onQuery: (value: string) => void
  modelOf: (name: string) => string
  disabledOf: (name: string) => boolean
  drafts: Record<string, string>
  busy?: string
  onDraft: (name: string, value: string) => void
  onSave: (name: string) => void
  onToggle: (name: string, disabled: boolean) => void
}) {
  return (
    <section class="sheet-section">
      <p class="set-note">{props.summary}</p>
      <SettingWide
        placeholder="Rechercher un agent"
        value={props.query}
        note={props.query.trim() ? `${props.agents.length} / ${props.total}` : undefined}
        onInput={props.onQuery}
      />

      <Show
        when={props.agents.length > 0}
        fallback={<p class="set-note">aucun agent ne correspond à « {props.query} ».</p>}
      >
        <ul class="sheet-agents editable">
          <For each={props.agents}>
            {(agent) => (
              <li class="agent-row" classList={{ off: props.disabledOf(agent.name) }}>
                <SettingRow
                  label={agent.name}
                  desc={[modeLabel(agent.mode), props.disabledOf(agent.name) ? "désactivé" : undefined, agent.description]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <input
                    class="set-input"
                    placeholder={props.modelOf(agent.name) || "modèle par défaut"}
                    title="Modèle de cet agent. Un champ vidé n'est pas un retour au défaut : le serveur fusionne."
                    value={props.drafts[agent.name] ?? ""}
                    onInput={(event) => props.onDraft(agent.name, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") props.onSave(agent.name)
                    }}
                  />
                  {/* Le bouton n'existe que s'il y a quelque chose à enregistrer. */}
                  <Show when={(props.drafts[agent.name] ?? "").trim() !== ""}>
                    <button
                      class="ghost bordered"
                      disabled={props.busy === `agent:${agent.name}`}
                      onClick={() => props.onSave(agent.name)}
                    >
                      {props.busy === `agent:${agent.name}` ? "…" : "enregistrer"}
                    </button>
                  </Show>
                  <button
                    class="ghost agent-toggle"
                    title={props.disabledOf(agent.name) ? "Réactiver cet agent" : "Désactiver cet agent"}
                    disabled={props.busy === `agent:${agent.name}`}
                    onClick={() => props.onToggle(agent.name, !props.disabledOf(agent.name))}
                  >
                    {props.disabledOf(agent.name) ? "activer" : "désactiver"}
                  </button>
                </SettingRow>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

/** Les serveurs MCP : seuls les défauts sont nommés — un serveur connecté ne produit rien. */
export function McpSection(props: { total: number; connected: number; problems: McpProblem[] }) {
  return (
    <section class="sheet-section">
      <p class="set-note">
        {props.connected} serveur{props.connected > 1 ? "s" : ""} connecté{props.connected > 1 ? "s" : ""} sur{" "}
        {props.total}
        {props.problems.length === 0 ? " — aucun défaut" : ""}
      </p>
      <Show when={props.problems.length > 0}>
        <ul class="sheet-list">
          <For each={props.problems}>
            {(server) => (
              <li>
                <span class={`dot ${mcpTone(server.status)}`} />
                <span class="mcp-name" title={server.error}>
                  {server.name}
                </span>
                <span class={`mcp-state ${mcpTone(server.status)}`}>{server.status}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

/** Les plugins : retirer ce qui est chargé, ajouter un spécificateur. */
export function PluginsSection(props: {
  plugins: PluginEntry[]
  spec: string
  busy?: boolean
  onSpec: (value: string) => void
  onAdd: () => void
  onRemove: (spec: string) => void
}) {
  return (
    <section class="sheet-section">
      <Show when={props.plugins.length > 0} fallback={<p class="set-note">aucun plugin chargé.</p>}>
        <ul class="sheet-list">
          <For each={props.plugins}>
            {(plugin) => (
              <li>
                <PluginIcon size={13} />
                <span class="pl-name" title={plugin.hint}>
                  {plugin.label}
                </span>
                <button
                  class="ghost"
                  title={`Retirer ${plugin.label}`}
                  disabled={props.busy}
                  onClick={() => props.onRemove(plugin.hint.split(" · ")[0])}
                >
                  retirer
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <SettingRow label="ajouter un plugin" desc="chemin local, URL de fichier, ou nom de paquet npm">
        <input
          class="set-input"
          placeholder="chemin, file:// ou paquet npm"
          value={props.spec}
          onInput={(event) => props.onSpec(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onAdd()
          }}
        />
        <button class="ghost bordered" disabled={props.busy || !props.spec.trim()} onClick={() => props.onAdd()}>
          {props.busy ? "…" : "ajouter"}
        </button>
      </SettingRow>
    </section>
  )
}
