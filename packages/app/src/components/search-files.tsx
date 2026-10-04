import { createMemo, createSignal, For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"

interface SearchMatch {
  line: number
  content: string
}

interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function SearchFiles(props: { onOpenResult?: (path: string, line: number) => void }) {
  const [query, setQuery] = createSignal("")
  const [caseSensitive, setCaseSensitive] = createSignal(false)
  const [useRegex, setUseRegex] = createSignal(false)
  const [wholeWord, setWholeWord] = createSignal(false)
  const [results, setResults] = createSignal<SearchFileResult[]>([])
  const [searching, setSearching] = createSignal(false)
  const sdk = useSDK()

  const totalResults = createMemo(() => results().reduce((sum, r) => sum + r.matches.length, 0))
  const totalFiles = createMemo(() => results().length)

  const performSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      let pattern = useRegex() ? q : escapeRegex(q)
      if (wholeWord()) pattern = `\\b${pattern}\\b`
      if (!caseSensitive()) pattern = `(?i)${pattern}`

      const response = await sdk.client.find.text({ pattern })
      const hits = response.data ?? []

      const grouped = new Map<string, SearchMatch[]>()
      for (const hit of hits) {
        const path = hit.path.text
        const list = grouped.get(path) ?? []
        list.push({ line: hit.line_number, content: hit.lines.text.trim().slice(0, 120) })
        grouped.set(path, list)
      }
      setResults(Array.from(grouped.entries()).map(([path, matches]) => ({ path, matches })))
    } catch {
      setResults([])
    }
    setSearching(false)
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const handleSearch = (value: string) => {
    setQuery(value)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => performSearch(value), 300)
  }

  return (
    <div class="flex flex-col h-full">
      <div class="p-2 border-b border-border-weaker-base flex flex-col gap-2">
        <input
          class="w-full px-3 py-2 rounded-md border border-border-weaker-base bg-background-base text-14-regular text-text-strong outline-none focus:border-accent"
          placeholder="Search files..."
          value={query()}
          onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
          autofocus
        />
        <div class="flex gap-2">
          <button
            class={`px-2 py-0.5 rounded text-11-regular ${caseSensitive() ? "bg-accent text-white" : "bg-background-stronger text-text-weak"}`}
            onClick={() => { setCaseSensitive(!caseSensitive()); performSearch(query()) }}
          >Aa</button>
          <button
            class={`px-2 py-0.5 rounded text-11-regular ${useRegex() ? "bg-accent text-white" : "bg-background-stronger text-text-weak"}`}
            onClick={() => { setUseRegex(!useRegex()); performSearch(query()) }}
          >.*</button>
          <button
            class={`px-2 py-0.5 rounded text-11-regular ${wholeWord() ? "bg-accent text-white" : "bg-background-stronger text-text-weak"}`}
            onClick={() => { setWholeWord(!wholeWord()); performSearch(query()) }}
          >ab</button>
        </div>
      </div>

      <Show when={query() && !searching()}>
        <div class="px-3 py-1 text-12-regular text-text-weak border-b border-border-weaker-base">
          {totalResults()} results in {totalFiles()} files
        </div>
      </Show>

      <Show when={searching()}>
        <div class="px-3 py-2 text-12-regular text-text-weak">Searching...</div>
      </Show>

      <div class="flex-1 overflow-auto">
        <For each={results()}>
          {(file) => (
            <div class="px-2 py-1">
              <div class="text-13-medium text-text-strong truncate">{file.path}</div>
              <For each={file.matches.slice(0, 10)}>
                {(match) => (
                  <div
                    class="pl-4 py-0.5 text-12-regular text-text-weak cursor-pointer hover:bg-overlay-simple-hover rounded flex gap-2"
                    onClick={() => props.onOpenResult?.(file.path, match.line)}
                  >
                    <span class="text-text-weaker shrink-0 w-10">L{match.line}</span>
                    <span class="truncate">{match.content}</span>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
