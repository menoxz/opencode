import { createEffect, For, Show } from "solid-js"
import { mcpTone, modeLabel, type AgentRow, type McpProblem } from "./config"
import { ChevronIcon, PluginIcon, SettingIcon } from "./icons"
import type { PluginEntry } from "./nav"
import {
  isFormFillable,
  methodFields,
  methodLabel,
  withValue,
  type AuthMethod,
  type ChoiceGroup,
  type SettingSpec,
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
 *
 * **Langue** : les libellés d'écran sont en anglais, les commentaires en français.
 */

/** Un bloc de la page : un titre, ses réglages. Le titre est absent quand il ne séparerait rien. */
export type SettingBlock = { title?: string; specs: SettingSpec[] }

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
      <aside class="sheet settings" role="dialog" aria-label="settings">
        <header class="sheet-head">
          <span class="sheet-title">settings</span>
          <button class="ghost" title="Close (Esc)" onClick={() => props.onClose()}>
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
                  aria-current={section.key === props.active ? "page" : undefined}
                  onClick={() => props.onSelect(section.key)}
                >
                  <SettingIcon name={section.icon} />
                  <span class="sheet-tab-label">{section.label}</span>
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
export function SettingWide(props: {
  placeholder: string
  value: string
  note?: string
  onInput: (v: string) => void
  children?: unknown
}) {
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
 * Le contrôle qui porte un réglage — choisi par sa **nature**, pas par sa clé.
 *
 * Un booléen se bascule, une énumération se choisit, une chaîne s'écrit : trois gestes différents,
 * donc trois contrôles. Un champ de texte pour un booléen obligerait à taper « true », ce qui est
 * une façon de faire porter au clavier ce que l'interface sait déjà.
 *
 * Le type d'un réglage ne change pas : l'aiguillage se fait une fois, à la construction.
 */
/**
 * Les choix d'un `select`.
 *
 * Un groupe **titré** se rend en `optgroup` — les modèles, groupés par fournisseur ; un groupe sans
 * titre se rend à plat — les agents, les interpréteurs. Un `optgroup` sans nom n'ajouterait qu'une
 * indentation sans rien dire.
 */
function Options(props: { groups: ChoiceGroup[] }) {
  return (
    <For each={props.groups}>
      {(group) => (
        <Show
          when={group.title}
          fallback={<For each={group.choices}>{(choice) => <option value={choice.value}>{choice.label}</option>}</For>}
        >
          <optgroup label={group.title}>
            <For each={group.choices}>{(choice) => <option value={choice.value}>{choice.label}</option>}</For>
          </optgroup>
        </Show>
      )}
    </For>
  )
}

export function SettingControl(props: {
  spec: SettingSpec
  /** La valeur affichée (chaîne, pour un champ ou une liste de choix). */
  value: string
  /** L'état d'un interrupteur. */
  checked: boolean
  /**
   * Les choix, quand ils viennent du serveur (`spec.source`) : modèles, agents, interpréteurs.
   * Ils arrivent d'ici plutôt que d'être cherchés dans le composant : le contrôle ne sait pas d'où
   * vient une liste, il rend ce qu'on lui donne.
   */
  groups?: ChoiceGroup[]
  busy?: boolean
  onInput: (value: string) => void
  /** Écrit la valeur telle que le contrôle la produit — booléenne pour un interrupteur. */
  onCommit: (raw: string | boolean) => void
}) {
  if (props.spec.kind === "toggle") {
    return (
      <SettingRow label={props.spec.label} desc={props.spec.desc}>
        <label class="switch" title={props.spec.desc}>
          <input
            type="checkbox"
            checked={props.checked}
            disabled={props.busy}
            onChange={(event) => props.onCommit(event.currentTarget.checked)}
          />
          <span class="switch-track" />
        </label>
      </SettingRow>
    )
  }

  if (props.spec.kind === "select") {
    /** Les choix viennent du serveur quand `source` est déclaré — sinon ils sont fixes. */
    const groups = () => (props.spec.source ? withValue(props.groups ?? [], props.value) : [])
    return (
      <SettingRow label={props.spec.label} desc={props.spec.desc}>
        {/*
          La valeur est posée **dans un effet**, pas par l'attribut `value`.

          Un `<select>` à qui l'on donne une valeur qu'aucune `<option>` ne porte encore **retombe
          sur la première** — et il n'y revient plus. Or c'est exactement la séquence réelle : la
          page s'ouvre, `Config` arrive, les listes arrivent après (49 ms pour 696 modèles). Mesuré
          au CDP : `domValue: ""` et `selectedIndex: 0` sur les quatre listes, alors que le modèle
          configuré figurait bien parmi les 697 options. L'écran affichait « server default » sur une
          configuration renseignée — un mensonge, et précisément sur ce qu'on venait d'ajouter.

          Lire `groups()` **dans** l'effet est le correctif : quand les choix changent, la valeur est
          réappliquée. Le test ne pouvait pas l'attraper par un simple montage (jsdom insère les
          options avant que la valeur soit posée : il passait sur le code fautif) — il vise donc le
          mécanisme, et le navigateur reste l'oracle.
        */}
        <select
          class="set-select"
          ref={(element: HTMLSelectElement) => {
            createEffect(() => {
              const wanted = props.value
              if (props.spec.source) groups()
              if (element.value !== wanted) element.value = wanted
            })
          }}
          disabled={props.busy}
          onChange={(event) => props.onCommit(event.currentTarget.value)}
        >
          <Show
            when={props.spec.source}
            fallback={
              <For each={props.spec.options ?? []}>{(option) => <option value={option.value}>{option.label}</option>}</For>
            }
          >
            {/* L'option vide est un **état**, pas un texte grisé : elle remet le réglage au défaut du
                serveur, qui retire la clé quand la valeur écrite est la chaîne vide. Son libellé vient
                du `placeholder` — un `select` alimenté par une source n'a pas de choix statiques. */}
            <option value="">{props.spec.placeholder ?? "server default"}</option>
            <Options groups={groups()} />
          </Show>
        </select>
      </SettingRow>
    )
  }

  return (
    <SettingRow label={props.spec.label} desc={props.spec.desc}>
      <input
        class="set-input"
        placeholder={props.spec.placeholder}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onCommit(props.value)
        }}
      />
      <button class="ghost bordered" disabled={props.busy} onClick={() => props.onCommit(props.value)}>
        {props.busy ? "…" : "Save"}
      </button>
    </SettingRow>
  )
}

/** Un bloc déclaré : son titre, puis ses lignes. Un bloc sans titre se rend nu. */
function Block(props: {
  title?: string
  specs: SettingSpec[]
  /** Les choix d'un réglage, quand ils viennent du serveur. */
  groupsOf: (spec: SettingSpec) => ChoiceGroup[]
  draftOf: (spec: SettingSpec) => string
  checkedOf: (spec: SettingSpec) => boolean
  busy?: string
  onInput: (spec: SettingSpec, value: string) => void
  onCommit: (spec: SettingSpec, raw: string | boolean) => void
}) {
  return (
    <section class="sheet-section">
      <Show when={props.title}>
        <h2>{props.title}</h2>
      </Show>
      <For each={props.specs}>
        {(spec) => (
          <SettingControl
            spec={spec}
            value={props.draftOf(spec)}
            checked={props.checkedOf(spec)}
            groups={props.groupsOf(spec)}
            busy={props.busy === spec.label}
            onInput={(value) => props.onInput(spec, value)}
            onCommit={(raw) => props.onCommit(spec, raw)}
          />
        )}
      </For>
    </section>
  )
}

/* =============================================================================
   La page **General**.

   Ce qu'elle est : la page qui répond à « dans quel monde est-ce que je travaille ? ». Défauts,
   identité, environnement. C'est la première de la colonne parce que c'est celle qu'on ouvre sans
   savoir ce qu'on cherche.

   Ce qu'elle n'est pas : un rendu de `Config`. L'ordre des blocs suit la **fréquence d'usage** —
   on change de modèle bien plus souvent qu'on ne relit son nom d'utilisateur — et non l'ordre des
   clés dans le schéma.

   **Ce qui n'y est plus, et pourquoi.** Le dossier de travail y a été mis, puis retiré : c'est une
   action de **premier plan** — on change de dépôt plusieurs fois par jour — et le pied du rail la
   porte déjà. Un panneau de réglages est l'endroit de ce qui n'a **pas** besoin d'être au premier
   plan ; y ranger une action quotidienne ne la range pas, il l'enterre. La complétion qui
   l'accompagnait a suivi l'action : elle vit sur le champ du rail, là où l'on écrit.

   Le reste de la page est piloté par les données : ajouter un réglage simple reste une ligne dans
   `GENERAL_SETTINGS`.
   ============================================================================= */

export function GeneralSection(props: {
  blocks: SettingBlock[]
  /** Les choix d'un réglage, quand ils viennent du serveur (`spec.source`). */
  groupsOf: (spec: SettingSpec) => ChoiceGroup[]
  draftOf: (spec: SettingSpec) => string
  checkedOf: (spec: SettingSpec) => boolean
  busy?: string
  onInput: (spec: SettingSpec, value: string) => void
  onCommit: (spec: SettingSpec, raw: string | boolean) => void
  /** Où les réglages sont écrits, et quelle version les sert — deux faits, une ligne. */
  footnote?: string
}) {
  /** Ce que chaque bloc reçoit de la page — le rendu des lignes ne dépend pas de la section. */
  const shared = {
    groupsOf: props.groupsOf,
    draftOf: props.draftOf,
    checkedOf: props.checkedOf,
    busy: props.busy,
    onInput: props.onInput,
    onCommit: props.onCommit,
  }

  return (
    <>
      <For each={props.blocks}>{(block) => <Block title={block.title} specs={block.specs} {...shared} />}</For>

      <Show when={props.footnote}>
        <p class="set-footnote">{props.footnote}</p>
      </Show>
    </>
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
  /** Ce que le serveur déclare : « 29 primary · 5 subagents ». Donne l'échelle d'un coup d'œil. */
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
        placeholder="Search agents"
        value={props.query}
        note={props.query.trim() ? `${props.agents.length} / ${props.total}` : undefined}
        onInput={props.onQuery}
      />

      <Show
        when={props.agents.length > 0}
        fallback={<p class="set-note">no agent matches “{props.query}”.</p>}
      >
        <ul class="sheet-agents editable">
          <For each={props.agents}>
            {(agent) => (
              <li class="agent-row" classList={{ off: props.disabledOf(agent.name) }}>
                <SettingRow
                  label={agent.name}
                  desc={[modeLabel(agent.mode), props.disabledOf(agent.name) ? "disabled" : undefined, agent.description]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <input
                    class="set-input"
                    placeholder={props.modelOf(agent.name) || "server default"}
                    title="This agent's model. An emptied field is not a reset — the server merges agent entries."
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
                      {props.busy === `agent:${agent.name}` ? "…" : "Save"}
                    </button>
                  </Show>
                  <button
                    class="ghost agent-toggle"
                    title={props.disabledOf(agent.name) ? "Re-enable this agent" : "Disable this agent"}
                    disabled={props.busy === `agent:${agent.name}`}
                    onClick={() => props.onToggle(agent.name, !props.disabledOf(agent.name))}
                  >
                    {props.disabledOf(agent.name) ? "enable" : "disable"}
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
        {props.connected} of {props.total} server{props.total > 1 ? "s" : ""} connected
        {props.problems.length === 0 ? " — no problems" : ""}
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
      <Show when={props.plugins.length > 0} fallback={<p class="set-note">no plugin loaded.</p>}>
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
                  title={`Remove ${plugin.label}`}
                  disabled={props.busy}
                  onClick={() => props.onRemove(plugin.hint.split(" · ")[0])}
                >
                  remove
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <SettingRow label="Add a plugin" desc="local path, file URL, or npm package name">
        <input
          class="set-input"
          placeholder="path, file:// or npm package"
          value={props.spec}
          onInput={(event) => props.onSpec(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onAdd()
          }}
        />
        <button class="ghost bordered" disabled={props.busy || !props.spec.trim()} onClick={() => props.onAdd()}>
          {props.busy ? "…" : "Add"}
        </button>
      </SettingRow>
    </section>
  )
}
