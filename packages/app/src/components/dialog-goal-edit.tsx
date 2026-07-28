import { createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useSessionLayout } from "@/pages/session/session-layout"
import { showToast } from "@opencode-ai/ui/toast"
import { buildGoalEditTemplate, parseGoalEditInput } from "./session/utils/goal-edit-format"

export function DialogGoalEdit() {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const { params } = useSessionLayout()

  const session = params.id ? sync.session.get(params.id) : undefined
  const goalState = (
    session as
      | {
          goalState?: {
            status?: string
            goal?: string
            dod?: string[]
            outOfScope?: string[]
            version?: number
          }
        }
      | undefined
  )?.goalState

  const [text, setText] = createSignal(buildGoalEditTemplate(goalState ?? {}))
  const [saving, setSaving] = createSignal(false)

  const handleSave = async () => {
    if (!params.id || saving()) return

    const parsed = parseGoalEditInput(text())
    if (!parsed) {
      showToast({ title: "Invalid goal contract format" })
      return
    }

    setSaving(true)
    try {
      await sdk.client.session.update({
        sessionID: params.id,
        directory: sdk.directory,
        goalState: {
          status: "edited",
          source: "user",
          goal: parsed.goal,
          dod: parsed.dod,
          outOfScope: parsed.outOfScope,
          version: goalState?.version ?? 1,
          updatedAt: Date.now(),
        },
      })
      dialog.close()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: "Failed to save goal contract", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Edit Goal Contract" class="w-full max-w-[520px] mx-auto">
      <div class="flex flex-col gap-4 p-6 pt-0">
        <div class="flex flex-col gap-1">
          <label class="text-12-medium text-text-weak">Goal Contract</label>
          <span class="text-11-regular text-text-weaker">
            Format: Goal: &lt;objective&gt;, DoD: and OOS: with - items
          </span>
        </div>
        <TextField
          multiline
          value={text()}
          onChange={(v) => setText(v)}
          spellcheck={false}
          class="min-h-[200px] font-mono text-xs"
          placeholder={`Goal: <objective>\nDoD:\n- <item1>\n- <item2>\nOOS:\n- <item1>`}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="large" onClick={handleSave} disabled={saving()}>
            {saving() ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
