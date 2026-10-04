import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { onMount, Show, createSignal } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { useBindings } from "@tui/keymap"
import { GOAL_EDIT_COPY } from "./goal-edit-parser"

export type DialogGoalEditProps = {
  value: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogGoalEdit(props: DialogGoalEditProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  let textarea: TextareaRenderable

  function confirm() {
    props.onConfirm?.(textarea.plainText)
  }

  useBindings(() => ({
    target: textareaTarget,
    enabled: textareaTarget() !== undefined,
    priority: 1,
    commands: [
      {
        name: "dialog.prompt.submit",
        title: "Save contract edit",
        category: "Dialog",
        run: confirm,
      },
    ],
    bindings: [
      {
        key: "ctrl+return",
        cmd: "dialog.prompt.submit",
      },
    ],
  }))

  onMount(() => {
    dialog.setSize("xlarge")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      textarea.focus()
    }, 1)
    textarea.gotoLineEnd()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Edit Task Contract
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <box>
        <text fg={theme.textMuted}>
          Use sections: {GOAL_EDIT_COPY.objectiveLabel} / {GOAL_EDIT_COPY.dodLabel} / {GOAL_EDIT_COPY.outOfScopeLabel}
        </text>
      </box>

      <textarea
        height={14}
        ref={(val: TextareaRenderable) => {
          textarea = val
          setTextareaTarget(val)
        }}
        initialValue={props.value}
        placeholder={`${GOAL_EDIT_COPY.objectiveLabel}: ...`}
        placeholderColor={theme.textMuted}
        textColor={theme.text}
        focusedTextColor={theme.text}
        cursorColor={theme.text}
      />

      <box paddingLeft={1} paddingRight={1}>
        <text fg={theme.textMuted} wrapMode="word">
          {GOAL_EDIT_COPY.objectiveLabel}: a single clear objective{"\n"}
          {GOAL_EDIT_COPY.dodLabel}:{"\n"}- outcome 1{"\n"}- outcome 2{"\n"}
          {GOAL_EDIT_COPY.outOfScopeLabel}:{"\n"}- excluded item
        </text>
      </box>

      <box paddingBottom={1} flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.text }}>Ctrl+Enter</span> save
        </text>
        <box flexDirection="row" gap={1}>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.backgroundElement}
            onMouseUp={() => {
              props.onCancel?.()
              dialog.clear()
            }}
          >
            <text fg={theme.textMuted}>Cancel</text>
          </box>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.primary}
            onMouseUp={() => {
              confirm()
              dialog.clear()
            }}
          >
            <text fg={theme.selectedListItemText}>Save</text>
          </box>
        </box>
      </box>
    </box>
  )
}

DialogGoalEdit.show = (dialog: DialogContext, options: { value: string }) => {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => <DialogGoalEdit value={options.value} onConfirm={(value) => resolve(value)} onCancel={() => resolve(null)} />,
      () => resolve(null),
    )
  })
}
