import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { CheckIcon, ChevronIcon, FolderIcon } from "./icons"
import { folderChoices, folderLabel } from "./folders"
import type { Choice } from "./settings"

/**
 * Un contrôle de choix — **cherchable**, et sa liste défile avec notre barre.
 *
 * Un `<select>` natif ne peut pas obéir : sa liste est dessinée par le système d'exploitation, donc
 * ni champ de filtre, ni barre de défilement à nous. La barre par défaut de Chrome est une barre
 * d'application dans une interface qui n'en a pas. C'est donc un composant maison, et c'est une
 * décision, pas une préférence.
 *
 * Quatre règles, et chacune répond à un défaut mesuré du contrôle natif :
 *
 * 1. **Le filtre est la première ligne de la liste ouverte**, et il a le focus. Il n'existe pas au
 *    repos : il ne coûte donc rien tant qu'on ne choisit pas.
 * 2. **Le filtre porte sur le libellé**, pas sur un titre de groupe. C'est la règle apprise ici : une
 *    barre native ne cherche **pas** les titres de groupe, et grouper rendrait `orcarouter`
 *    introuvable à la frappe. La liste est donc plate, et le libellé porte son fournisseur.
 * 3. **Le clavier est complet** — ↑↓, `Home`, `End`, `Entrée`, `Échap`, `Tab` ferme. Un composant de
 *    choix qui ne s'utilise qu'à la souris est un composant en panne.
 * 4. **La liste est bornée en hauteur** et défile au-delà. 696 modèles ne tiennent pas dans un écran,
 *    et une liste qui pousse la page déplace le contrôle qu'on est en train d'utiliser.
 *
 * Le popup est positionné en `fixed` depuis le rectangle du déclencheur, pas ancré en `absolute` :
 * le panneau défile, et un popup ancré serait rogné par son premier ancêtre scrollable. Il se ferme
 * au défilement, plutôt que de flotter à côté de sa ligne.
 */
export function Picker(props: {
  /** Les choix, déjà projetés en `{ value, label }` — le contrôle ne sait pas d'où ils viennent. */
  choices: Choice[]
  /** La valeur courante. `""` est un état : c'est le défaut du serveur. */
  value: string
  /** Ce qu'on affiche quand rien n'est choisi. */
  placeholder?: string
  /** Ce que le contrôle règle — pour les lecteurs d'écran, qui n'ont pas le libellé de la ligne. */
  label?: string
  disabled?: boolean
  /**
   * Appelé quand la liste s'ouvre — l'appelant peut alors charger des choix qu'il ne voulait pas
   * payer au repos (le catalogue des modèles pèse 531 ko, la liste des agents 1,5 Mo).
   */
  onOpen?: () => void
  onChange: (value: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [active, setActive] = createSignal(0)
  const [box, setBox] = createSignal({ left: 0, top: 0, width: 260, up: false })
  let trigger: HTMLButtonElement | undefined
  let list: HTMLDivElement | undefined
  let filter: HTMLInputElement | undefined
  let pop: HTMLDivElement | undefined

  /**
   * Le filtre porte sur le libellé **et sur le groupe**.
   *
   * C'est ce qui rend le filtre par fournisseur réel : taper `orcarouter` ramène ses 122 modèles,
   * taper `claude` ramène ceux de tous les fournisseurs. Ne filtrer que sur le libellé obligeait à
   * connaître le nom exact du modèle pour le retrouver dans une liste de 696 entrées — c'est le
   * défaut qui rendait la liste impraticable.
   */
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return props.choices
    return props.choices.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) || (entry.group ?? "").toLowerCase().includes(needle),
    )
  })

  /**
   * Le libellé affiché.
   *
   * `props.value` **seul** n'est pas une ceinture : une valeur que le serveur accepte mais ne publie
   * pas s'affiche **quand même** — sinon le contrôle montrerait autre chose que ce qui est écrit dans
   * le fichier, le mensonge exact qu'on a retiré du `select`. Et une valeur **vide** n'est pas une
   * absence : c'est l'état « défaut du serveur », qui se lit avec le mot du `placeholder`.
   */
  const shown = () => {
    const found = props.choices.find((entry) => entry.value === props.value)
    // Le groupe se recompose ici : dans la liste ouverte il est porté par l'en-tête, mais le contrôle
    // **refermé** n'a pas d'en-tête — un modèle seul y serait ambigu (« Claude 4 » de qui ?), et
    // c'était précisément le défaut corrigé en ajoutant le fournisseur au libellé.
    if (found) return found.group ? `${found.label} · ${found.group}` : found.label
    if (props.value) return props.value
    return props.placeholder ?? "server default"
  }

  const place = () => {
    const rect = trigger?.getBoundingClientRect()
    if (!rect) return
    // Bascule vers le haut quand il n'y a pas la place en dessous : sur la dernière ligne du panneau,
    // un popup qui s'ouvre vers le bas sort de la fenêtre.
    const up = window.innerHeight - rect.bottom < 280 && rect.top > 280
    setBox({ left: rect.left, top: up ? rect.top : rect.bottom + 4, width: Math.max(rect.width, 260), up })
  }

  const show = () => {
    setQuery("")
    place()
    setOpen(true)
    props.onOpen?.()
    setActive(Math.max(0, filtered().findIndex((entry) => entry.value === props.value)))
    /**
     * Le focus se pose **après** le rendu, pas dans la `ref`.
     *
     * Mesuré au CDP : `document.activeElement` n'était pas le filtre quand on le focalisait depuis la
     * `ref` — Solid appelle cette `ref` avant d'insérer le nœud dans le document, et `focus()` sur un
     * élément détaché ne fait rien. Le filtre existait, il n'avait simplement jamais le focus, donc la
     * règle « le filtre est la première ligne et il a le focus » n'était pas tenue.
     */
    queueMicrotask(() => filter?.focus())
  }

  const close = () => setOpen(false)
  /** Fermer en rendant le focus au déclencheur — pour `Échap` et `Entrée`, pas pour un clic ailleurs. */
  const dismiss = () => {
    setOpen(false)
    trigger?.focus()
  }

  const pick = (entry: Choice | undefined) => {
    if (entry) props.onChange(entry.value)
    dismiss()
  }

  createEffect(() => {
    const rows = filtered()
    if (active() >= rows.length) setActive(0)
  })

  createEffect(() => {
    const index = active()
    if (!open()) return
    // `scrollIntoView` n'existe pas partout (jsdom ne l'implémente pas) : son absence ne doit pas
    // casser le contrôle, seulement ne pas faire défiler.
    list?.querySelector(`[data-i="${index}"]`)?.scrollIntoView?.({ block: "nearest" })
  })

  createEffect(() => {
    if (!open()) return
    const onDown = (event: MouseEvent) => {
      if (!trigger?.parentElement?.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", onDown)
    onCleanup(() => document.removeEventListener("mousedown", onDown))
  })

  createEffect(() => {
    if (!open()) return
    /**
     * Le popup est en `fixed` : il ne suit pas le panneau qui défile, donc le défilement **de la page**
     * le ferme plutôt que de le laisser flotter à côté de sa ligne.
     *
     * Mais le défilement de **sa propre liste** ne doit pas le fermer — et c'est exactement le défaut
     * qui rendait le choix du modèle inutilisable : la liste porte 696 entrées, on la fait défiler,
     * l'événement remonte en phase de capture jusqu'au document, et il refermait le popup avant qu'on
     * ait pu cliquer. On ignore donc tout ce qui part de l'intérieur du popup.
     */
    const onScroll = (event: Event) => {
      if (pop?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener("scroll", onScroll, true)
    onCleanup(() => document.removeEventListener("scroll", onScroll, true))
  })

  const onKey = (event: KeyboardEvent) => {
    const rows = filtered()
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, rows.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === "Home") {
      event.preventDefault()
      setActive(0)
    } else if (event.key === "End") {
      event.preventDefault()
      setActive(Math.max(0, rows.length - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      pick(rows[active()])
    } else if (event.key === "Escape") {
      event.preventDefault()
      dismiss()
    } else if (event.key === "Tab") {
      close()
    }
  }

  return (
    <span class="pick">
      <button
        type="button"
        class="pick-trigger"
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-label={props.label}
        /* Le libellé est rogné quand il est long (un modèle se nomme « Nom · Fournisseur ») : le
           titre porte alors la valeur entière, sinon l'information serait perdue à l'écran. */
        title={shown()}
        disabled={props.disabled}
        ref={(element) => (trigger = element)}
        onClick={() => (open() ? close() : show())}
      >
        <span class="pick-label">{shown()}</span>
        {/* Un chevron de menu pointe vers le bas en toutes circonstances : `open` est un pliage, pas
            un menu — on passe donc la valeur qui donne la pointe vers le bas. */}
        <ChevronIcon size={12} open={true} />
      </button>

      <Show when={open()}>
        <div
          class="pick-pop"
          ref={(element) => (pop = element)}
          style={{
            left: `${box().left}px`,
            width: `${box().width}px`,
            ...(box().up ? { bottom: `${window.innerHeight - box().top + 4}px` } : { top: `${box().top}px` }),
          }}
        >
          <input
            class="pick-filter"
            type="text"
            placeholder="search"
            aria-label={props.label ? `filter ${props.label}` : "filter"}
            value={query()}
            ref={(element: HTMLInputElement) => (filter = element)}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              // La requête change : la ligne active repart en tête, sinon `Entrée` validerait une
              // ligne qui n'est plus à l'écran.
              setActive(0)
            }}
            onKeyDown={onKey}
          />
          <div class="pick-list" role="listbox" aria-label={props.label} ref={(element) => (list = element)}>
            <For each={filtered()} fallback={<p class="pick-empty">no match</p>}>
              {(entry, index) => (
                <>
                  {/* L'en-tête de fournisseur n'apparaît qu'au **changement** de groupe : le répéter
                      sur chaque ligne ne dirait rien de plus et pousserait les modèles hors de vue.
                      Il est **cliquable** — c'est le filtre par fournisseur, en un geste : on clique
                      `orcarouter` et la liste se réduit à ses 122 modèles, sans rien taper. */}
                  <Show
                    when={entry.group && (index() === 0 || filtered()[index() - 1]!.group !== entry.group)}
                  >
                    <button
                      type="button"
                      class="pick-group"
                      title={`Only ${entry.group}`}
                      onClick={() => {
                        setQuery(entry.group ?? "")
                        setActive(0)
                        filter?.focus()
                      }}
                    >
                      {entry.group}
                    </button>
                  </Show>
                  <div
                    class="pick-row"
                    classList={{ "is-active": active() === index(), "is-current": entry.value === props.value }}
                    data-i={index()}
                    role="option"
                    aria-selected={entry.value === props.value}
                    onMouseEnter={() => setActive(index())}
                    onClick={() => pick(entry)}
                  >
                    <span class="pick-row-label">{entry.label}</span>
                  </div>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>
    </span>
  )
}

/**
 * Le **sélecteur de dossier** — une pastille qui ouvre la liste des projets.
 *
 * Il remplace un champ de saisie avec complétion : celui-ci demandait de **connaître le chemin**, ou
 * de deviner qu'une liste s'ouvrirait à la frappe. Ici on voit les projets, on voit lequel est
 * courant (la coche), et on choisit d'un clic.
 *
 * Il n'a **pas** de champ de filtre, contrairement au `Picker` : sept dossiers se lisent d'un coup
 * d'œil, et un filtre serait une ligne de plus à franchir avant d'atteindre le premier projet. La
 * mécanique du popup, elle, est identique — et pour une raison : elle a été payée par des défauts
 * mesurés (fermeture au défilement de sa propre liste, fermeture au clic extérieur, position fixe
 * depuis le rectangle du déclencheur).
 *
 * `Add workspace…` est une **vraie** action, pas un ornement : aucun navigateur ne sait ouvrir le
 * sélecteur de dossier du serveur, donc la ligne révèle un champ où l'on écrit le chemin. Les
 * dossiers déjà connus, eux, se choisissent d'un clic.
 */
export function FolderPicker(props: {
  /** Les dossiers connus du serveur — des chemins absolus. */
  folders: string[]
  /** Le dossier courant. `""` est un état : c'est celui du serveur, pas une absence. */
  value: string
  /** Ce qu'on affiche quand aucun dossier n'est choisi. */
  placeholder?: string
  label?: string
  onChange: (path: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const [active, setActive] = createSignal(0)
  const [adding, setAdding] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [box, setBox] = createSignal({ left: 0, top: 0, width: 240, up: false })
  let trigger: HTMLButtonElement | undefined
  let pop: HTMLDivElement | undefined
  let list: HTMLDivElement | undefined
  let addField: HTMLInputElement | undefined

  const choices = createMemo(() => folderChoices(props.folders, props.value))
  /** La ligne d'ajout est la dernière : le clavier la parcourt comme les autres. */
  const ADD = () => choices().length
  const rows = () => choices().length + 1

  const place = () => {
    const rect = trigger?.getBoundingClientRect()
    if (!rect) return
    // Bascule vers le haut quand il n'y a pas la place en dessous — le contrôle vit au **pied** du
    // rail, donc c'est son cas courant, pas son exception.
    const up = window.innerHeight - rect.bottom < 260 && rect.top > 260
    setBox({ left: rect.left, top: up ? rect.top : rect.bottom + 4, width: Math.max(rect.width, 240), up })
  }

  const show = () => {
    place()
    setAdding(false)
    setDraft("")
    // La ligne active part sur le dossier **courant** : c'est celui qu'on vient voir.
    setActive(Math.max(0, choices().findIndex((choice) => choice.current)))
    setOpen(true)
    // Le focus se pose **après** le rendu : une `ref` est appelée avant l'insertion dans le
    // document, et `focus()` sur un élément détaché ne fait rien (défaut mesuré sur le `Picker`).
    queueMicrotask(() => pop?.focus())
  }

  const close = () => setOpen(false)
  /** Fermer en rendant le focus au déclencheur — pour `Échap` et un choix, pas pour un clic ailleurs. */
  const dismiss = () => {
    setOpen(false)
    trigger?.focus()
  }

  const pick = (path: string | undefined) => {
    if (path) props.onChange(path)
    dismiss()
  }

  const startAdd = () => {
    setAdding(true)
    queueMicrotask(() => addField?.focus())
  }

  const commitAdd = () => {
    const path = draft().trim()
    if (!path) return
    props.onChange(path)
    dismiss()
  }

  createEffect(() => {
    if (active() >= rows()) setActive(Math.max(0, rows() - 1))
  })

  createEffect(() => {
    const index = active()
    if (!open() || adding()) return
    // `scrollIntoView` n'existe pas partout (jsdom ne l'implémente pas) : son absence ne doit pas
    // casser le contrôle, seulement ne pas faire défiler.
    list?.querySelector(`[data-i="${index}"]`)?.scrollIntoView?.({ block: "nearest" })
  })

  createEffect(() => {
    if (!open()) return
    const onDown = (event: MouseEvent) => {
      if (!pop?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", onDown)
    onCleanup(() => document.removeEventListener("mousedown", onDown))
  })

  createEffect(() => {
    if (!open()) return
    /**
     * Le popup est en `fixed` : le défilement de la page le ferme plutôt que de le laisser flotter
     * à côté de sa ligne. Celui de **sa propre liste** ne doit pas le fermer — défaut mesuré sur le
     * `Picker`, où l'événement remontait en phase de capture et refermait le popup avant le clic.
     */
    const onScroll = (event: Event) => {
      if (pop?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener("scroll", onScroll, true)
    onCleanup(() => document.removeEventListener("scroll", onScroll, true))
  })

  const onKey = (event: KeyboardEvent) => {
    // Le champ d'ajout prend le clavier quand il est ouvert : les flèches doivent y écrire.
    if (adding()) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, rows() - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === "Home") {
      event.preventDefault()
      setActive(0)
    } else if (event.key === "End") {
      event.preventDefault()
      setActive(rows() - 1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (active() === ADD()) startAdd()
      else pick(choices()[active()]?.path)
    } else if (event.key === "Escape") {
      event.preventDefault()
      dismiss()
    } else if (event.key === "Tab") {
      close()
    }
  }

  return (
    <span class="folder-pick">
      <button
        type="button"
        class="folder-trigger"
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-label={props.label}
        /* Le contrôle refermé montre le **nom** ; le chemin entier vit dans l'infobulle, sinon il
           serait perdu à l'écran. */
        title={props.value || props.placeholder || "server directory"}
        ref={(element) => (trigger = element)}
        onClick={() => (open() ? close() : show())}
      >
        <FolderIcon size={14} />
        <span class="folder-name">{folderLabel(props.value, props.placeholder ?? "server directory")}</span>
        <ChevronIcon size={12} open={true} />
      </button>

      <Show when={open()}>
        <div
          class="folder-pop"
          role="listbox"
          aria-label={props.label}
          tabIndex={-1}
          ref={(element) => (pop = element)}
          style={{
            left: `${box().left}px`,
            width: `${box().width}px`,
            ...(box().up ? { bottom: `${window.innerHeight - box().top + 4}px` } : { top: `${box().top}px` }),
          }}
          onKeyDown={onKey}
        >
          <div class="folder-list" ref={(element) => (list = element)}>
            <For each={choices()}>
              {(choice, index) => (
                <div
                  class="folder-row"
                  classList={{ "is-active": active() === index(), "is-current": choice.current }}
                  data-i={index()}
                  role="option"
                  aria-selected={choice.current}
                  title={choice.path}
                  onMouseEnter={() => setActive(index())}
                  onClick={() => pick(choice.path)}
                >
                  <FolderIcon size={14} />
                  <span class="folder-row-name">{choice.name}</span>
                  <Show when={choice.current}>
                    <CheckIcon size={13} />
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div class="folder-sep" />
          <Show
            when={adding()}
            fallback={
              <div
                class="folder-row folder-add"
                classList={{ "is-active": active() === ADD() }}
                onMouseEnter={() => setActive(ADD())}
                onClick={startAdd}
              >
                <span class="folder-plus">+</span>
                <span class="folder-row-name">Add workspace…</span>
              </div>
            }
          >
            <div class="folder-add-row">
              <span class="folder-plus">+</span>
              <input
                class="folder-add-input"
                type="text"
                placeholder="path to a project folder"
                aria-label="path to a project folder"
                value={draft()}
                ref={(element: HTMLInputElement) => (addField = element)}
                onInput={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitAdd()
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setAdding(false)
                    queueMicrotask(() => pop?.focus())
                  }
                }}
              />
            </div>
          </Show>
        </div>
      </Show>
    </span>
  )
}
