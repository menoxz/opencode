import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, Show } from "solid-js"
import { statSync } from "node:fs"
import { homedir } from "node:os"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { useTuiConfig } from "@tui/context/tui-config"
import { useSDK } from "@tui/context/sdk"
import { useLocal } from "@tui/context/local"
import { useBindings } from "@tui/keymap"
import { getScrollAcceleration } from "../util/scroll"
import { directoryChoice, filteredDirectories, navBasename, normalizeDirectory } from "../routes/session/session-nav"

export type DialogDirectorySelectProps = {
  directories: readonly string[]
  onPick: (directory: string) => void
}

const statDirectory = (directory: string) => {
  try {
    return { exists: true, directory: statSync(directory).isDirectory() }
  } catch {
    return { exists: false, directory: false }
  }
}

/**
 * Picks the folder a new session is created in: the folders already in use are listed and filtered
 * as the user types, and a pasted path that is not a real folder is rejected with a visible reason.
 */
export function DialogDirectorySelect(props: DialogDirectorySelectProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(0)
  const [error, setError] = createSignal<string>()

  const matches = createMemo(() => filteredDirectories(props.directories, query()))

  const move = (direction: number) => {
    const total = matches().length
    if (total === 0) return
    setSelected((current) => (current + direction + total) % total)
  }

  const choose = (directory: string) => {
    props.onPick(directory)
    dialog.clear()
  }

  const submit = () => {
    const typed = query().trim()
    if (!typed) {
      const directory = matches()[selected()]
      if (directory) choose(directory)
      return
    }
    const choice = directoryChoice(normalizeDirectory(typed, homedir()), statDirectory)
    if (choice.kind === "error") {
      setError(choice.message)
      return
    }
    choose(choice.directory)
  }

  useBindings(() => ({
    commands: [
      { name: "dialog.select.prev", title: "Previous folder", category: "Dialog", run: () => move(-1) },
      { name: "dialog.select.next", title: "Next folder", category: "Dialog", run: () => move(1) },
      { name: "dialog.select.submit", title: "Choose folder", category: "Dialog", run: submit },
    ],
    bindings: tuiConfig.keybinds.gather("dialog.select", [
      "dialog.select.prev",
      "dialog.select.next",
      "dialog.select.submit",
    ]),
  }))

  return (
    <box gap={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          New session in folder
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <input
        onInput={(value) => {
          setQuery(value)
          setSelected(0)
          setError(undefined)
        }}
        focusedBackgroundColor={theme.backgroundPanel}
        cursorColor={theme.primary}
        focusedTextColor={theme.textMuted}
        ref={(renderable) => {
          setTimeout(() => {
            if (!renderable.isDestroyed) renderable.focus()
          }, 1)
        }}
        placeholder="Pick a folder or paste a path"
        placeholderColor={theme.textMuted}
      />
      <Show when={error()}>
        <text fg={theme.error}>{error()}</text>
      </Show>
      <Show
        when={matches().length > 0}
        fallback={
          <text fg={theme.textMuted}>No folder yet — paste a path above and press enter</text>
        }
      >
        <scrollbox
          flexGrow={1}
          maxHeight={12}
          scrollAcceleration={scrollAcceleration()}
          scrollbarOptions={{ visible: false }}
        >
          <For each={matches()}>
            {(directory, index) => (
              <box
                flexDirection="row"
                justifyContent="space-between"
                gap={2}
                onMouseUp={() => choose(directory)}
                backgroundColor={index() === selected() ? theme.primary : undefined}
              >
                <text fg={index() === selected() ? theme.selectedListItemText : theme.text}>
                  {navBasename(directory)}
                </text>
                <text fg={index() === selected() ? theme.selectedListItemText : theme.textMuted}>{directory}</text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  )
}

/** Opens the folder picker and creates a session in whichever folder is chosen. */
export function openSessionFolder(deps: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  local: ReturnType<typeof useLocal>
  directories: readonly string[]
  onCreated: (sessionID: string) => void
  onNoModel?: () => void
}) {
  deps.dialog.replace(() => (
    <DialogDirectorySelect
      directories={deps.directories}
      onPick={(directory) => {
        const model = deps.local.model.current()
        const agent = deps.local.agent.current()
        if (!model || !agent) {
          deps.onNoModel?.()
          return
        }
        void deps.sdk.client.session
          .create({
            directory,
            agent: agent.name,
            model: {
              providerID: model.providerID,
              id: model.modelID,
              variant: deps.local.model.variant.current(),
            },
          })
          .then((result) => {
            if (!result.error && result.data) deps.onCreated(result.data.id)
          })
      }}
    />
  ))
}
