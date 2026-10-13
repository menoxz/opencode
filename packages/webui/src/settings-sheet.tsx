import { For, Show } from "solid-js"
import { mcpTone, modeLabel, type AgentRow, type McpProblem } from "./config"
import { PluginIcon } from "./icons"
import type { PluginEntry } from "./nav"
import { methodFields, methodLabel, isFormFillable, type AuthMethod, type SettingsSection, type SettingsSectionKey } from "./settings"

/**
 * Le composant de réglages — il **gère** la configuration.
 *
 * Modèle conventionnel : des sections à gauche, la section active à droite. **Une section ne charge
 * ses données qu'à sa sélection** — c'est ce que demande l'utilisateur (« éviter de charger la page
 * de settings »), et c'est la même règle qui vaut depuis le début : `GET /provider` pèse 6,7 Mo, il
 * n'est jamais appelé.
 *
 * Il est séparé de `components.tsx` parce que c'est une préoccupation à part : le fil, le rail et
 * les permissions racontent une conversation ; celui-ci modifie la machine.
 */

export function SettingsSheet(props: {
  sections: SettingsSection[]
  active: SettingsSectionKey
  onSelect: (key: SettingsSectionKey) => void
  onClose: () => void
  /** Ce qui vient d'être écrit — affiché une fois, jamais en permanence. */
  notice?: string
  error?: string
  /** Section en cours d'écriture : `provider:gitlab`, `plugin:…`. */
  busy?: string
  children?: unknown
}) {
  return (
    <>
      <div class="sheet-scrim" onClick={() => props.onClose()} />
      <aside class="sheet" role="dialog" aria-label="réglages">
        <header class="sheet-head">
          <span class="sheet-title">réglages</span>
          <button class="ghost" title="Fermer (Échap)" onClick={() => props.onClose()}>
            ✕
          </button>
        </header>

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
      </aside>
    </>
  )
}

/** Un champ de réglage : un libellé, une valeur, et le bouton qui l'écrit. */
export function SettingsField(props: {
  label: string
  value: string
  placeholder?: string
  hint?: string
  secret?: boolean
  busy?: boolean
  disabled?: boolean
  onInput: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div class="set-field">
      <label class="set-label" title={props.hint}>
        {props.label}
      </label>
      <div class="set-row">
        <input
          class="set-input"
          type={props.secret ? "password" : "text"}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onSubmit()
          }}
        />
        <button class="ghost bordered" disabled={props.busy || props.disabled} onClick={() => props.onSubmit()}>
          {props.busy ? "…" : "enregistrer"}
        </button>
      </div>
    </div>
  )
}

/**
 * Un fournisseur et ses méthodes **réelles**.
 *
 * Le formulaire se déduit de `GET /provider/auth` : on ne devine pas les champs. Une méthode `oauth`
 * n'en a aucun — elle se **connecte**, elle ne se remplit pas.
 */
export function ProviderBlock(props: {
  id: string
  methods: AuthMethod[]
  values: Record<string, string>
  busy?: boolean
  onInput: (key: string, value: string) => void
  onSubmit: (method: AuthMethod) => void
}) {
  return (
    <section class="set-block">
      <h4 class="set-block-title">{props.id}</h4>
      <For each={props.methods}>
        {(method) => (
          <div class="set-method">
            <span class="set-method-label">{methodLabel(method)}</span>
            <Show
              when={isFormFillable(method)}
              fallback={<span class="set-note">connexion à ouvrir depuis le navigateur — aucune saisie</span>}
            >
              <div class="set-row">
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
    </section>
  )
}

/**
 * Les agents — les **configurer**, pas seulement les lister.
 *
 * Deux gestes : donner un modèle à un agent, et le désactiver. Le bouton « enregistrer » n'existe
 * **que si un brouillon a été saisi** — un formulaire de 34 lignes couvert de boutons inutiles
 * serait du bruit, et le bruit fait perdre de vue ce qu'on est venu régler.
 */
export function AgentsSection(props: {
  agents: AgentRow[]
  summary: string
  /** Le modèle déjà déclaré pour cet agent, ou une chaîne vide. */
  modelOf: (name: string) => string
  disabledOf: (name: string) => boolean
  /** Les saisies en cours, par nom d'agent. */
  drafts: Record<string, string>
  busy?: string
  onDraft: (name: string, value: string) => void
  onSave: (name: string) => void
  onToggle: (name: string, disabled: boolean) => void
}) {
  return (
    <section class="sheet-section">
      <p class="sheet-note">{props.summary}</p>
      <ul class="sheet-agents editable">
        <For each={props.agents}>
          {(agent) => (
            <li class="agent-row" classList={{ off: props.disabledOf(agent.name) }}>
              <div class="agent-head">
                <span class="sa-name" title={agent.full}>
                  {agent.name}
                </span>
                <span class="sa-mode">{modeLabel(agent.mode)}</span>
                <Show when={props.disabledOf(agent.name)}>
                  <span class="sa-off">désactivé</span>
                </Show>
              </div>
              <div class="set-row">
                <input
                  class="set-input"
                  placeholder={props.modelOf(agent.name) || "modèle par défaut"}
                  title="Modèle de cet agent. Un champ vidé n'est pas un retour au défaut : le serveur fusionne, donc vider n'annule rien."
                  value={props.drafts[agent.name] ?? ""}
                  onInput={(event) => props.onDraft(agent.name, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") props.onSave(agent.name)
                  }}
                />
                {/* Le bouton n'apparaît que s'il y a quelque chose à enregistrer. */}
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
              </div>
              <Show when={agent.description}>
                <span class="sa-desc" title={agent.full}>
                  {agent.description}
                </span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

/** Les serveurs MCP : seuls les défauts sont nommés — un serveur connecté ne produit rien. */
export function McpSection(props: { total: number; connected: number; problems: McpProblem[] }) {
  return (
    <section class="sheet-section">
      <p class="sheet-note">
        {props.connected} serveur{props.connected > 1 ? "s" : ""} connecté{props.connected > 1 ? "s" : ""} sur{" "}
        {props.total}
        {props.problems.length === 0 ? " — aucun défaut" : ""}
      </p>
      <Show when={props.problems.length > 0}>
        <ul class="sheet-mcp">
          <For each={props.problems}>
            {(server) => (
              <li>
                <span class={`dot ${mcpTone(server.status)}`} />
                <span class="mcp-name">{server.name}</span>
                <span class="mcp-status" title={server.error}>
                  {server.status}
                </span>
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
      <Show
        when={props.plugins.length > 0}
        fallback={<p class="sheet-note">aucun plugin chargé.</p>}
      >
        <ul class="sheet-plugins">
          <For each={props.plugins}>
            {(plugin) => (
              <li>
                <span class="pl-icon">
                  <PluginIcon size={13} />
                </span>
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

      <div class="set-field">
        <label class="set-label" title="Chemin local, URL de fichier, ou nom de paquet npm">
          ajouter un plugin
        </label>
        <div class="set-row">
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
        </div>
      </div>
    </section>
  )
}
