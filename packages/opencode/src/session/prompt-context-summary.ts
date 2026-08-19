import { createHash } from "node:crypto"

export type PromptContextSection =
  | "createUserMessage"
  | "messageFiltering"
  | "phaseCapsuleShadow"
  | "reminders"
  | "toolResolution"
  | "skills"
  | "toolList"
  | "goal"
  | "methodology"
  | "daemon"
  | "modelMessageConversion"
  | "handleProcess"
  | "core"
  | "env"
  | "instructions"
  | "userSystem"

export interface PromptContextEntry {
  section: PromptContextSection
  added: boolean
  reason: string
  size: number
  durationMs: number
  cached?: boolean
}

export interface PromptContextSummary {
  step?: number
  sections: PromptContextEntry[]
  totalSize: number
  totalDurationMs: number
}

export function createPromptContextSummary(step?: number) {
  const started = Date.now()
  const sections: PromptContextEntry[] = []

  return {
    track<T>(section: PromptContextSection, reason: string, fn: () => T, options?: { cached?: boolean }) {
      const start = Date.now()
      const value = fn()
      add(section, reason, value, Date.now() - start, options)
      return value
    },
    async trackPromise<T>(section: PromptContextSection, reason: string, fn: () => Promise<T>, options?: { cached?: boolean }) {
      const start = Date.now()
      const value = await fn()
      add(section, reason, value, Date.now() - start, options)
      return value
    },
    add,
    snapshot(): PromptContextSummary {
      return {
        step,
        sections: [...sections],
        totalSize: sections.reduce((sum, entry) => sum + entry.size, 0),
        totalDurationMs: Date.now() - started,
      }
    },
  }

  function add(
    section: PromptContextSection,
    reason: string,
    value: unknown,
    durationMs: number,
    options?: { cached?: boolean },
  ) {
    const size = approximatePromptSize(value)
    sections.push({ section, added: size > 0, reason, size, durationMs, cached: options?.cached })
  }
}

export function approximatePromptSize(value: unknown): number {
  if (!value) return 0
  if (typeof value === "string") return value.length
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + approximatePromptSize(item), 0)
  if (typeof value === "object") {
    if ("content" in value && typeof (value as any).content === "string") return (value as any).content.length
    if ("text" in value && typeof (value as any).text === "string") return (value as any).text.length
  }
  return JSON.stringify(value)?.length ?? 0
}

export function createPromptInjectionCache() {
  const values = new Map<string, { hash: string; value: string | undefined }>()
  const emitted = new Set<string>()

  return {
    get(key: string) {
      const previous = values.get(key)
      if (!previous) return { value: undefined, cached: false }
      return { value: previous.value, cached: true }
    },
    set(key: string, value: string | undefined) {
      values.set(key, { hash: hashValue(value), value })
      return value
    },
    getOrSet(key: string, compute: () => string | undefined) {
      const next = compute()
      const hash = hashValue(next)
      const previous = values.get(key)
      if (previous?.hash === hash) return { value: previous.value, cached: true }
      values.set(key, { hash, value: next })
      return { value: next, cached: false }
    },
    emitOnce(key: string, value: string | undefined) {
      if (!value) return { value, skipped: false }
      const marker = `${key}:${hashValue(value)}`
      if (emitted.has(marker)) return { value: undefined, skipped: true }
      emitted.add(marker)
      return { value, skipped: false }
    },
  }
}

function hashValue(value: string | undefined) {
  return createHash("sha1").update(value ?? "").digest("hex")
}
