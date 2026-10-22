import { createSignal, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import { RGBA, type KeyEvent } from "@opentui/core"
import { Spinner } from "@tui/component/spinner"

/**
 * Le libellé est centré entre deux filets, et le fond de survol ne couvre **que** le
 * libellé : les filets disent où commence et où finit le bloc, le fond dit où l'on clique.
 * Un fond pleine largeur laisserait croire que toute la ligne est la cible, alors que seule
 * la zone du texte déplie.
 */
function RuledRow(props: { rule: RGBA | string; paddingLeft?: number; center: JSX.Element }) {
  return (
    <box
      flexDirection="row"
      alignItems="center"
      flexShrink={0}
      paddingLeft={props.paddingLeft ?? 0}
    >
      <box flexGrow={1} height={1} border={["bottom"]} borderColor={props.rule} />
      {props.center}
      <box flexGrow={1} height={1} border={["bottom"]} borderColor={props.rule} />
    </box>
  )
}

// Compaction output restates context the model already carries; it is noise for
// the user, so it stays folded until explicitly opened.
export function CompactionDisclosure(props: {
  label: string
  color: RGBA | string
  muted: RGBA | string
  rule?: RGBA | string
  hoverBg?: RGBA | string
  paddingLeft?: number
  children: JSX.Element
}) {
  const [open, setOpen] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [hover, setHover] = createSignal(false)
  const toggle = () => setOpen((value) => !value)
  return (
    <>
      <RuledRow
        rule={props.rule ?? props.muted}
        paddingLeft={props.paddingLeft}
        center={
          <box
            id="compaction-summary-toggle"
            flexShrink={0}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={hover() ? (props.hoverBg ?? props.muted) : undefined}
            focusable
            onMouseOver={() => setHover(true)}
            onMouseOut={() => setHover(false)}
            onMouseDown={(event) => {
              event.target?.focus()
              toggle()
            }}
            onKeyDown={(event: KeyEvent) => {
              if (!["return", "enter", "space"].includes(event.name)) return
              event.preventDefault()
              event.stopPropagation()
              toggle()
            }}
            on:focused={() => setFocused(true)}
            on:blurred={() => setFocused(false)}
          >
            <text fg={focused() || hover() || open() ? props.color : props.muted}>{props.label}</text>
          </box>
        }
      />
      <Show when={open()}>{props.children}</Show>
    </>
  )
}

/**
 * Pendant la compaction, le résumé n'existe pas encore : rien à déplier, mais la ligne occupe
 * la même place et la même forme que le bloc replié — sinon le libellé saute quand il arrive.
 */
export function CompactionPending(props: {
  label: string
  muted: RGBA | string
  rule?: RGBA | string
  paddingLeft?: number
}) {
  // Le spinner n'accepte qu'une couleur résolue ; le reste de la TUI passe des RGBA, mais
  // les tests et les thèmes peuvent fournir une chaîne.
  const color = () => (typeof props.muted === "string" ? RGBA.fromHex(props.muted) : props.muted)
  return (
    <RuledRow
      rule={props.rule ?? props.muted}
      paddingLeft={props.paddingLeft}
      center={
        <box flexDirection="row" gap={1} flexShrink={0} paddingLeft={1} paddingRight={1}>
          <Spinner color={color()} />
          <text fg={props.muted} wrapMode="none" truncate>
            {props.label}
          </text>
        </box>
      }
    />
  )
}
