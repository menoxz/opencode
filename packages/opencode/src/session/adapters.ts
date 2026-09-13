// Computer-use adapter descriptors (Lot 3).
//
// Lot 1 guessed "is this an environment tool?" with one regex. Lot 3 makes the
// classification explicit and per-adaptor so browser, desktop and mobile calls
// normalize the same way, and so a new adapter is a descriptor instead of a new
// branch. Descriptors ship for the servers actually in use and can be extended
// by configuration.

export type AdapterKind = "browser" | "desktop" | "mobile" | "generic"

export interface AdapterDescriptor {
  readonly id: string
  readonly kind: AdapterKind
  readonly patterns: readonly RegExp[]
  readonly scopeKeys: readonly string[]
}

export interface AdapterOverride {
  readonly id: string
  readonly kind: AdapterKind
  readonly patterns: readonly string[]
  readonly scopeKeys?: readonly string[]
}

const GENERIC_SCOPE_KEYS = [
  "scope",
  "url",
  "window",
  "window_title",
  "title",
  "tab",
  "page",
  "app",
  "application",
  "target",
  "device",
  "device_id",
  "udid",
  "serial",
  "element_id",
] as const

export const GENERIC_ADAPTER: AdapterDescriptor = {
  id: "generic",
  kind: "generic",
  patterns: [],
  scopeKeys: GENERIC_SCOPE_KEYS,
}

// Order matters: the most specific prefix wins, so `mobile_take_screenshot`
// is mobile, `browser_snapshot` is browser and a desktop `Snapshot` is desktop.
export const ADAPTERS: readonly AdapterDescriptor[] = [
  {
    id: "mobile",
    kind: "mobile",
    patterns: [/mobile/, /android/, /\bios/, /\badb/, /appium/, /simulator/, /emulator/, /xcrun/],
    scopeKeys: ["device", "device_id", "udid", "serial", "app", "scope"],
  },
  {
    id: "browser",
    kind: "browser",
    patterns: [/browser/, /chrome[_-]?devtools/, /playwright/, /puppeteer/, /page/, /navigate/, /tab/],
    scopeKeys: ["url", "page", "tab", "scope"],
  },
  {
    id: "desktop",
    kind: "desktop",
    patterns: [
      /windows[_-]?mcp/,
      /desktop/,
      /dump_ui/,
      /list_windows/,
      /select_window/,
      /displayinventory/,
      /registry/,
      /snapshot/,
      /screenshot/,
      /click/,
      /type_text/,
      /press_key/,
      /ocr_screen/,
      /clipboard/,
      /waitfor/,
      /shortcut/,
      /multi_?select/,
      /scrape/,
      /processes/,
    ],
    scopeKeys: ["window", "window_title", "title", "app", "application", "element_id", "scope"],
  },
]

function compile(override: AdapterOverride): AdapterDescriptor {
  return {
    id: override.id,
    kind: override.kind,
    patterns: override.patterns.map((pattern) => new RegExp(pattern, "i")),
    scopeKeys: override.scopeKeys ?? GENERIC_SCOPE_KEYS,
  }
}

function descriptors(overrides: readonly AdapterOverride[] = []): readonly AdapterDescriptor[] {
  return [...overrides.map(compile), ...ADAPTERS]
}

/** The descriptor matching a tool name, or undefined when nothing matches. */
export function classifyAdapter(
  name: string,
  overrides: readonly AdapterOverride[] = [],
): AdapterDescriptor | undefined {
  const normalized = name.replace(/-/g, "_").toLowerCase()
  return descriptors(overrides).find((adapter) => adapter.patterns.some((pattern) => pattern.test(normalized)))
}

/** The descriptor matching a tool name, defaulting to the generic adapter. */
export function adapterFor(name: string, overrides: readonly AdapterOverride[] = []): AdapterDescriptor {
  return classifyAdapter(name, overrides) ?? GENERIC_ADAPTER
}

function hasTarget(args: unknown, keys: readonly string[]): boolean {
  if (!args || typeof args !== "object") return false
  const record = args as Record<string, unknown>
  return keys.some((key) => typeof record[key] === "string" && (record[key] as string).trim().length > 0)
}

/** True when a tool drives or reads a visible environment. */
export function isEnvironmentCall(
  name: string,
  args: unknown,
  overrides: readonly AdapterOverride[] = [],
): boolean {
  if (classifyAdapter(name, overrides)) return true
  return hasTarget(args, GENERIC_SCOPE_KEYS)
}

/** Argument keys that identify the target for this adapter. */
export function scopeKeysFor(name: string, overrides: readonly AdapterOverride[] = []): readonly string[] {
  return adapterFor(name, overrides).scopeKeys
}

export * as Adapters from "./adapters"
