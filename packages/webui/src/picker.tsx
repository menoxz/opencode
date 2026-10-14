import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { ChevronIcon } from "./icons"
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

  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return props.choices
    return props.choices.filter((entry) => entry.label.toLowerCase().includes(needle))
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
    if (found) return found.label
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
              )}
            </For>
          </div>
        </div>
      </Show>
    </span>
  )
}
