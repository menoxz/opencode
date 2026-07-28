import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { TextField } from "@opencode-ai/ui/text-field"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"

const KNOWN_MCP_SERVERS = [
  { id: "web-browser", name: "Web Browser", description: "Navigate and interact with web pages", category: "Navigation & Browser", command: "npx @modelcontextprotocol/server-browser", icon: "\u{1F310}" },
  { id: "playwright", name: "Playwright", description: "Browser automation with Playwright", category: "Navigation & Browser", command: "npx @playwright/mcp", icon: "\u{1F3AD}" },
  { id: "puppeteer", name: "Puppeteer", description: "Headless Chrome browser control", category: "Navigation & Browser", command: "npx @modelcontextprotocol/server-puppeteer", icon: "\u{1F310}" },
  { id: "mcp-terminal", name: "Terminal", description: "Execute commands and manage processes", category: "Terminal & System", command: "npx @modelcontextprotocol/server-terminal", icon: "\u{1F4BB}" },
  { id: "filesystem", name: "Filesystem", description: "Read and write files on the local system", category: "Terminal & System", command: "npx @modelcontextprotocol/server-filesystem", icon: "\u{1F4C1}" },
  { id: "ssh", name: "SSH", description: "Manage remote servers via SSH", category: "Terminal & System", command: "npx @modelcontextprotocol/server-ssh", icon: "\u{1F4E1}" },
  { id: "postgres", name: "PostgreSQL", description: "Query and manage PostgreSQL databases", category: "Database", command: "npx @modelcontextprotocol/server-postgres", icon: "\u{1F5C4}\uFE0F" },
  { id: "sqlite", name: "SQLite", description: "Query and manage SQLite databases", category: "Database", command: "npx @modelcontextprotocol/server-sqlite", icon: "\u{1F5C4}\uFE0F" },
  { id: "mysql", name: "MySQL", description: "Query and manage MySQL databases", category: "Database", command: "npx @modelcontextprotocol/server-mysql", icon: "\u{1F5C4}\uFE0F" },
  { id: "mongo", name: "MongoDB", description: "Query and manage MongoDB databases", category: "Database", command: "npx @modelcontextprotocol/server-mongo", icon: "\u{1F5C4}\uFE0F" },
  { id: "mobile", name: "Mobile", description: "Control Android and iOS devices", category: "Mobile", command: "python run_server.py", icon: "\u{1F4F1}" },
  { id: "android", name: "Android", description: "Android device management and ADB", category: "Mobile", command: "npx @modelcontextprotocol/server-android", icon: "\u{1F4F1}" },
  { id: "ios", name: "iOS", description: "iOS device management and automation", category: "Mobile", command: "npx @modelcontextprotocol/server-ios", icon: "\u{1F4F1}" },
  { id: "llm-memory", name: "LLM Memory", description: "Persistent memory for AI agents", category: "AI & Memory", command: "python -m mcp_server.server", icon: "\u{1F9E0}" },
  { id: "embeddings", name: "Embeddings", description: "Vector embeddings and semantic search", category: "AI & Memory", command: "npx @modelcontextprotocol/server-embeddings", icon: "\u{1F9E0}" },
  { id: "aws", name: "AWS", description: "Manage AWS cloud resources", category: "Cloud", command: "npx @modelcontextprotocol/server-aws", icon: "\u{2601}\uFE0F" },
  { id: "gcp", name: "GCP", description: "Manage Google Cloud resources", category: "Cloud", command: "npx @modelcontextprotocol/server-gcp", icon: "\u{2601}\uFE0F" },
  { id: "azure", name: "Azure", description: "Manage Microsoft Azure resources", category: "Cloud", command: "npx @modelcontextprotocol/server-azure", icon: "\u{2601}\uFE0F" },
  { id: "cloudflare", name: "Cloudflare", description: "Manage Cloudflare services and DNS", category: "Cloud", command: "npx @modelcontextprotocol/server-cloudflare", icon: "\u{2601}\uFE0F" },
  { id: "github", name: "GitHub", description: "Manage GitHub issues, PRs, and repos", category: "Developer Tools", command: "npx @modelcontextprotocol/server-github", icon: "\u{1F419}" },
  { id: "git", name: "Git", description: "Git version control operations", category: "Developer Tools", command: "npx @modelcontextprotocol/server-git", icon: "\u{1F500}" },
  { id: "docker", name: "Docker", description: "Manage Docker containers and images", category: "Developer Tools", command: "npx @modelcontextprotocol/server-docker", icon: "\u{1F433}" },
  { id: "kubernetes", name: "Kubernetes", description: "Manage Kubernetes clusters", category: "Developer Tools", command: "npx @modelcontextprotocol/server-kubernetes", icon: "\u{2699}\uFE0F" },
]

export function MCPMarketplace() {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const [search, setSearch] = createSignal("")
  const [category, setCategory] = createSignal<string | null>(null)

  const categories = createMemo(() => [...new Set(KNOWN_MCP_SERVERS.map((s) => s.category))])

  const installed = createMemo(() => new Set(Object.keys(sync.data.mcp ?? {})))

  const filtered = createMemo(() => {
    return KNOWN_MCP_SERVERS.filter((s) => {
      if (category() && s.category !== category()) return false
      if (search()) {
        const q = search().toLowerCase()
        if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false
      }
      return true
    })
  })

  return (
    <div class="flex flex-col gap-4 h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-4 pt-6 pb-6">
          <h2 class="text-16-medium text-text-strong">MCP Marketplace</h2>
          <div class="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-base">
            <Icon name="magnifying-glass" class="text-icon-weak-base flex-shrink-0" />
            <TextField
              variant="ghost"
              type="text"
              value={search()}
              onChange={setSearch}
              placeholder="Search servers..."
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              class="flex-1"
            />
            <Show when={search()}>
              <button
                type="button"
                class="text-icon-weak-base hover:text-icon-base transition-colors"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <Icon name="circle-x" size="small" />
              </button>
            </Show>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button
              type="button"
              class="px-3 py-1.5 rounded-md text-12-regular transition-colors"
              classList={{
                "bg-surface-raised-base text-text-strong": category() === null,
                "bg-surface-base text-text-weak hover:bg-surface-raised-base-hover": category() !== null,
              }}
              onClick={() => setCategory(null)}
            >
              All
            </button>
            <For each={categories()}>
              {(cat) => (
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-md text-12-regular transition-colors"
                  classList={{
                    "bg-surface-raised-base text-text-strong": category() === cat,
                    "bg-surface-base text-text-weak hover:bg-surface-raised-base-hover": category() !== cat,
                  }}
                  onClick={() => setCategory(cat === category() ? null : cat)}
                >
                  {cat}
                </button>
              )}
            </For>
          </div>
          <Show when={!sync.data.mcp_ready}>
            <div class="flex items-center gap-2 text-12-regular text-text-weak">
              <Spinner class="size-3" />
              <span>Loading installed servers...</span>
            </div>
          </Show>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <For each={filtered()}>
          {(server) => {
            const isInstalled = () => installed().has(server.id)
            return (
              <div
                class="flex flex-col p-4 rounded-lg border border-border-weak-base bg-surface-base hover:border-border-strong-base transition-colors"
              >
                <div class="flex items-start gap-3">
                  <span class="text-2xl shrink-0 mt-0.5">{server.icon}</span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-14-medium text-text-strong truncate">{server.name}</span>
                      <Show when={isInstalled()}>
                        <span class="text-11-regular text-text-invert-weak bg-icon-success-base px-1.5 py-0.5 rounded-sm shrink-0">
                          Installed
                        </span>
                      </Show>
                    </div>
                    <div class="text-13-regular text-text-weak mt-0.5">{server.description}</div>
                    <div class="flex items-center justify-between mt-3">
                      <span class="text-11-regular text-text-weaker bg-surface-raised-base px-2 py-0.5 rounded-sm">
                        {server.category}
                      </span>
                      <Show
                        when={isInstalled()}
                        fallback={
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                              sdk.client.mcp.connect({ name: server.id }).catch(() => {})
                            }}
                          >
                            Install
                          </Button>
                        }
                      >
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            sdk.client.mcp
                              .disconnect({ name: server.id })
                              .catch(() => {})
                          }}
                        >
                          Configure
                        </Button>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>
            )
          }}
        </For>
        <Show when={filtered().length === 0}>
          <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-16 text-center">
            <Icon name="magnifying-glass" class="text-icon-weak-base size-8 mb-3" />
            <span class="text-14-regular text-text-weak">
              No servers match your search.
            </span>
          </div>
        </Show>
      </div>
    </div>
  )
}
