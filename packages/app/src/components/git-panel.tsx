import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"

export interface GitChange {
  path: string
  status: "M" | "A" | "D" | "R" | "?"
}

export function GitPanel(props: {
  onOpenDiff?: (path: string) => void
  sessionID?: string
}) {
  const sync = useSync()
  const sdk = useSDK()

  const branch = createMemo(() => sync.data.vcs?.branch ?? "main")
  const [changes, setChanges] = createSignal<GitChange[]>([])
  const [commitMsg, setCommitMsg] = createSignal("")
  const [loading, setLoading] = createSignal(true)

  // Load git status from the SDK (GET /vcs/status)
  const loadGitStatus = async () => {
    setLoading(true)
    try {
      const result = await sdk.client.vcs.status()
      if (result.data) {
        const items: GitChange[] = result.data.map((f) => ({
          path: f.file,
          status: f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M",
        }))
        setChanges(items)
      }
    } catch (err) {
      console.error("[git-panel] failed to load git status", err)
    }
    setLoading(false)
  }

  onMount(() => {
    void loadGitStatus()
  })

  const modifiedCount = createMemo(() => changes().filter((c) => c.status === "M").length)
  const addedCount = createMemo(() => changes().filter((c) => c.status === "A").length)
  const deletedCount = createMemo(() => changes().filter((c) => c.status === "D").length)
  const totalChanges = createMemo(() => changes().length)

  const groupedChanges = createMemo(() => {
    const groups: { label: string; changes: GitChange[] }[] = []

    const modified = changes().filter((c) => c.status === "M")
    if (modified.length) groups.push({ label: "Modified", changes: modified })

    const added = changes().filter((c) => c.status === "A")
    if (added.length) groups.push({ label: "Added", changes: added })

    const deleted = changes().filter((c) => c.status === "D")
    if (deleted.length) groups.push({ label: "Deleted", changes: deleted })

    const untracked = changes().filter((c) => c.status === "?")
    if (untracked.length) groups.push({ label: "Untracked", changes: untracked })

    return groups
  })

  const statusLabel = (status: string) => {
    if (status === "M") return { text: "M", color: "text-warning", label: "Modified" }
    if (status === "A") return { text: "A", color: "text-success", label: "Added" }
    if (status === "D") return { text: "D", color: "text-danger", label: "Deleted" }
    if (status === "R") return { text: "R", color: "text-info", label: "Renamed" }
    if (status === "?") return { text: "?", color: "text-text-weak", label: "Untracked" }
    return { text: status, color: "text-text-weak", label: status }
  }

  // TODO: Implémenter les opérations git réelles via l'API SDK ou subprocess
  const handleStageAll = async () => {
    // TODO: git add . via SDK ou subprocess shell
    console.log("[git-panel] Stage all - not yet implemented")
  }

  const handleUnstageAll = async () => {
    // TODO: git reset via SDK ou subprocess shell
    console.log("[git-panel] Unstage all - not yet implemented")
  }

  const handleCommit = async () => {
    // TODO: git commit -m "<message>" via SDK ou subprocess shell
    console.log("[git-panel] Commit - not yet implemented")
  }

  const handlePush = async () => {
    // TODO: git push via SDK ou subprocess shell
    console.log("[git-panel] Push - not yet implemented")
  }

  const handlePull = async () => {
    // TODO: git pull via SDK ou subprocess shell
    console.log("[git-panel] Pull - not yet implemented")
  }

  return (
    <div class="flex flex-col h-full select-none">
      {/* Branch name header */}
      <div class="px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <span class="text-13-regular text-text-strong font-semibold">{branch()}</span>
        <span class="text-12-regular text-text-weak">branch</span>
      </div>

      {/* Action buttons */}
      <div class="px-3 py-2 border-b border-border-weaker-base flex gap-1.5 flex-wrap">
        <button
          onClick={handleStageAll}
          class="px-2 py-1 rounded text-11-medium bg-accent text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={totalChanges() === 0}
        >
          Stage All
        </button>
        <button
          onClick={handleUnstageAll}
          class="px-2 py-1 rounded text-11-medium bg-background-stronger text-text-weak hover:text-text-strong transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={totalChanges() === 0}
        >
          Unstage
        </button>
        <button
          onClick={handleCommit}
          class="px-2 py-1 rounded text-11-medium bg-background-stronger text-text-weak hover:text-text-strong transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={totalChanges() === 0 || !commitMsg().trim()}
        >
          Commit
        </button>
        <button
          onClick={handlePush}
          class="px-2 py-1 rounded text-11-medium bg-background-stronger text-text-weak hover:text-text-strong transition-colors cursor-pointer"
        >
          Push
        </button>
        <button
          onClick={handlePull}
          class="px-2 py-1 rounded text-11-medium bg-background-stronger text-text-weak hover:text-text-strong transition-colors cursor-pointer"
        >
          Pull
        </button>
      </div>

      {/* Changes summary */}
      <div class="px-3 py-1.5 border-b border-border-weaker-base text-12-regular text-text-weak flex items-center gap-2">
        <Show
          when={!loading()}
          fallback={<span>Loading...</span>}
        >
          <span>{totalChanges()} change{totalChanges() !== 1 ? "s" : ""}</span>
          <Show when={modifiedCount() > 0}>
            <span class="text-warning">+{modifiedCount()} M</span>
          </Show>
          <Show when={addedCount() > 0}>
            <span class="text-success">+{addedCount()} A</span>
          </Show>
          <Show when={deletedCount() > 0}>
            <span class="text-danger">-{deletedCount()} D</span>
          </Show>
        </Show>
      </div>

      {/* Changes list grouped by status */}
      <div class="flex-1 overflow-auto">
        <Show when={!loading() && changes().length === 0}>
          <div class="px-3 py-4 text-12-regular text-text-weak text-center">
            No changes detected
          </div>
        </Show>

        <For each={groupedChanges()}>
          {(group) => (
            <div class="flex flex-col">
              <div class="px-3 py-1 text-11-medium text-text-weak uppercase tracking-wider">
                {group.label}
              </div>
              <For each={group.changes}>
                {(change) => {
                  const st = statusLabel(change.status)
                  return (
                    <div
                      class="flex items-center gap-2 px-3 py-1 hover:bg-overlay-simple-hover cursor-pointer transition-colors"
                      onClick={() => props.onOpenDiff?.(change.path)}
                    >
                      <span class={`font-mono text-12-regular ${st.color} w-4 shrink-0 text-center`}>{st.text}</span>
                      <span class="flex-1 text-13-regular text-text-strong truncate">{change.path}</span>
                    </div>
                  )
                }}
              </For>
            </div>
          )}
        </For>
      </div>

      {/* Commit message input */}
      <div class="border-t border-border-weaker-base p-2">
        <textarea
          class="w-full px-3 py-2 rounded-md border border-border-weaker-base bg-background-base text-13-regular text-text-strong resize-none outline-none focus:border-accent transition-colors placeholder:text-text-weak"
          rows={3}
          placeholder="Commit message..."
          value={commitMsg()}
          onInput={(e) => setCommitMsg((e.target as HTMLTextAreaElement).value)}
          disabled={totalChanges() === 0}
        />
      </div>
    </div>
  )
}
