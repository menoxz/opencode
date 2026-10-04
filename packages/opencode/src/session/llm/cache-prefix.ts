import { createHmac, randomBytes } from "node:crypto"

let key: Buffer | undefined
const sections = ["options", "system", "tools", "messages"] as const
type Section = (typeof sections)[number]
export type Payload = Record<Section, readonly unknown[]> & { aborted?: boolean }
export type Summary = {
  boundary: "ai-sdk" | "native"
  status: "baseline" | "equal" | "append" | "changed" | "bounded"
  firstChangedSection?: Section
  commonItems: number
  items: number
  previousItems: number
  complete: boolean
}
type Snapshot = {
  at: number
  boundary: Summary["boundary"]
  items: { section: Section; hash: string }[]
  complete: boolean
}

/** Deliberately not a wire-byte/token prefix: ordered, framed structural items. */
export function create(enabled = () => process.env.OPENCODE_CACHE_PREFIX_DIAGNOSTICS === "1", now = Date.now) {
  const snapshots = new Map<string, Snapshot>()
  let disposed = false
  let timer: ReturnType<typeof setInterval> | undefined
  function active() {
    if (enabled() && !disposed) return true
    snapshots.clear()
    clearInterval(timer)
    timer = undefined
    return false
  }
  function prune() {
    if (!active()) return
    for (const [id, value] of snapshots) if (now() - value.at >= 600_000) snapshots.delete(id)
  }
  return {
    enabled: active,
    forget(id: string) {
      snapshots.delete(id)
    },
    dispose() {
      disposed = true
      clearInterval(timer)
      snapshots.clear()
    },
    observe(id: string, boundary: Summary["boundary"], payload: Payload): Summary | undefined {
      if (!active()) return
      if (!timer) {
        timer = setInterval(prune, 60_000)
        timer.unref()
      }
      prune()
      const previous = snapshots.get(id)
      const current: Snapshot = { at: now(), boundary, items: [], complete: !payload.aborted }
      const budget = { bytes: 8 * 1024 * 1024, nodes: 65_536 }
      try {
        if (current.complete) {
          key ??= randomBytes(32)
          for (const section of sections) {
            for (const value of payload[section]) {
              if (current.items.length >= 1024) {
                current.complete = false
                break
              }
              const hash = createHmac("sha256", key)
              if (!fingerprint(value, hash, budget, 0)) {
                current.complete = false
                break
              }
              current.items.push({
                section:
                  section === "messages" &&
                  value &&
                  typeof value === "object" &&
                  "role" in value &&
                  value.role === "system"
                    ? "system"
                    : section,
                hash: hash.digest("hex"),
              })
            }
            if (!current.complete) break
          }
        }
      } catch {
        current.complete = false
        current.items = []
      }
      snapshots.delete(id)
      if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!)
      snapshots.set(id, current)
      const comparable = previous?.boundary === boundary ? previous : undefined
      const common = comparable
        ? current.items.findIndex(
            (item, i) => item.section !== comparable.items[i]?.section || item.hash !== comparable.items[i]?.hash,
          )
        : 0
      const commonItems = common === -1 ? current.items.length : common
      const changed = comparable && commonItems < Math.min(current.items.length, comparable.items.length)
      const shortened = comparable && current.complete && current.items.length < comparable.items.length
      const extendedSection =
        comparable?.complete && commonItems === comparable.items.length
          ? current.items.slice(commonItems).find((item) => item.section !== "messages")?.section
          : undefined
      return {
        boundary,
        status: !comparable
          ? "baseline"
          : changed || shortened || extendedSection
            ? "changed"
            : !current.complete || !comparable.complete
              ? "bounded"
              : current.items.length > comparable.items.length
                ? "append"
                : "equal",
        firstChangedSection:
          changed || shortened
            ? (current.items[commonItems]?.section ?? comparable?.items[commonItems]?.section)
            : extendedSection,
        commonItems,
        items: current.items.length,
        previousItems: comparable?.items.length ?? 0,
        complete: current.complete,
      }
    },
  }
}

// Streaming typed framing avoids JSON concatenation, delimiter collisions and
// giant temporary strings. UTF-16 preserves even unpaired surrogates exactly.
function fingerprint(
  value: unknown,
  hash: ReturnType<typeof createHmac>,
  budget: { bytes: number; nodes: number },
  depth: number,
): boolean {
  if (--budget.nodes < 0 || depth > 64) return false
  if (typeof value === "string") {
    if ((budget.bytes -= value.length * 2) < 0) return false
    hash.update(`s${value.length}:`)
    for (let i = 0; i < value.length; i += 2048) hash.update(Buffer.from(value.slice(i, i + 2048), "utf16le"))
    return true
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    hash.update(`${typeof value}:${String(value)};`)
    return true
  }
  if (value instanceof Uint8Array) {
    if ((budget.bytes -= value.byteLength) < 0) return false
    hash.update(`bytes${value.byteLength}:`).update(value)
    return true
  }
  if (value instanceof URL) return fingerprint(value.href, hash, budget, depth + 1)
  if (typeof value !== "object") return false
  hash.update(Array.isArray(value) ? "[" : "{")
  for (const name in value) {
    if (--budget.nodes < 0) return false
    if (!Object.hasOwn(value, name)) continue
    const property = Object.getOwnPropertyDescriptor(value, name)
    if (!property || !("value" in property)) return false
    if (property.value === undefined && !Array.isArray(value)) continue
    if (!fingerprint(name, hash, budget, depth + 1) || !fingerprint(property.value, hash, budget, depth + 1))
      return false
  }
  hash.update(Array.isArray(value) ? "]" : "}")
  return true
}

export * as CachePrefix from "./cache-prefix"
