import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, createResource, Show } from "solid-js"
import { Global } from "@opencode-ai/core/global"

const id = "internal:sidebar-footer"

/**
 * Pick the branch to show for a folder. The per-directory lookup wins once it
 * has settled (`string` = a branch, `null` = no repo there); while it is still
 * loading (`undefined`) fall back to the workspace branch, but only when the
 * folder is the one the workspace was opened in. A folder added to the
 * workspace must never inherit another folder's branch.
 */
export function selectFooterBranch(input: {
  resolved: string | null | undefined
  directory: string
  currentDirectory: string
  currentBranch: string | undefined
}): string | undefined {
  if (typeof input.resolved === "string") return input.resolved
  if (input.resolved === null) return undefined
  return input.directory === input.currentDirectory ? input.currentBranch : undefined
}

export function formatFooterPath(input: { directory: string; branch: string | undefined; home: string }) {
  const out = input.directory.replace(input.home, "~")
  const text = input.branch ? out + ":" + input.branch : out
  const list = text.split("/")
  return {
    parent: list.slice(0, -1).join("/"),
    name: list.at(-1) ?? "",
  }
}

function View(props: { api: TuiPluginApi; session_id?: string }) {
  const theme = () => props.api.theme.current
  const has = createMemo(() =>
    props.api.state.provider.some(
      (item) => item.id !== "opencode" || Object.values(item.models).some((model) => model.cost?.input !== 0),
    ),
  )
  const done = createMemo(() => props.api.kv.get("dismissed_getting_started", false))
  const show = createMemo(() => !has() && !done())
  const directory = createMemo(
    () =>
      (props.session_id ? props.api.state.session.get(props.session_id)?.directory : undefined) ||
      props.api.state.path.directory ||
      process.cwd(),
  )
  // The branch must describe `directory`, not the folder the TUI was launched in.
  // A session in a folder added to the workspace lives in another git worktree,
  // so the workspace-level `state.vcs` would show the wrong branch (the default
  // one) against that folder.
  const [branch] = createResource(directory, async (dir): Promise<string | null> => {
    const result = await props.api.client.vcs.get({ directory: dir }).catch(() => undefined)
    return result?.data?.branch ?? null
  })
  const path = createMemo(() =>
    formatFooterPath({
      directory: directory(),
      branch: selectFooterBranch({
        resolved: branch(),
        directory: directory(),
        currentDirectory: props.api.state.path.directory,
        currentBranch: props.api.state.vcs?.branch,
      }),
      home: Global.Path.home,
    }),
  )

  return (
    <box gap={1}>
      <Show when={show()}>
        <box
          backgroundColor={theme().backgroundElement}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          flexDirection="row"
          gap={1}
        >
          <text flexShrink={0} fg={theme().text}>
            ⬖
          </text>
          <box flexGrow={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme().text}>
                <b>Getting started</b>
              </text>
              <text fg={theme().textMuted} onMouseDown={() => props.api.kv.set("dismissed_getting_started", true)}>
                ✕
              </text>
            </box>
            <text fg={theme().textMuted}>OpenCode includes free models so you can start immediately.</text>
            <text fg={theme().textMuted}>
              Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc
            </text>
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().text}>Connect provider</text>
              <text fg={theme().textMuted}>/connect</text>
            </box>
          </box>
        </box>
      </Show>
      <text>
        <span style={{ fg: theme().textMuted }}>{path().parent}/</span>
        <span style={{ fg: theme().text }}>{path().name}</span>
      </text>
      <text>
        <span style={{ fg: theme().success }}>•</span>{" "}
        <span style={{ fg: theme().textMuted }}>Open</span>
        <span style={{ fg: theme().primary, bold: true }}>Codev2</span>{" "}
        <span style={{ fg: theme().textMuted }}>{props.api.app.version}</span>
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_footer(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
