import { randomBytes } from "crypto"

const prefixes = {
  job: "job",
  event: "evt",
  session: "ses",
  message: "msg",
  permission: "per",
  question: "que",
  part: "prt",
  pty: "pty",
  tool: "tool",
  workspace: "wrk",
} as const

const LENGTH = 26

// State for monotonic ID generation
let lastTimestamp = 0
let counter = 0

export function ascending(prefix: keyof typeof prefixes, given?: string) {
  return generateID(prefix, "ascending", given)
}

export function descending(prefix: keyof typeof prefixes, given?: string) {
  return generateID(prefix, "descending", given)
}

function generateID(prefix: keyof typeof prefixes, direction: "descending" | "ascending", given?: string): string {
  if (!given) {
    return create(prefixes[prefix], direction)
  }

  if (!given.startsWith(prefixes[prefix])) {
    throw new Error(`ID ${given} does not start with ${prefixes[prefix]}`)
  }
  return given
}

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let result = ""
  const bytes = randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62]
  }
  return result
}

export function create(prefix: string, direction: "descending" | "ascending", timestamp?: number): string {
  const currentTimestamp = timestamp ?? Date.now()

  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp
    counter = 0
  }
  counter++

  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter)

  now = direction === "descending" ? ~now : now

  const timeBytes = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  return prefix + "_" + timeBytes.toString("hex") + randomBase62(LENGTH - 12)
}

/** Extract timestamp from an ascending ID. Does not work with descending IDs. */
export function timestamp(id: string): number {
  const prefix = id.split("_")[0]
  const hex = id.slice(prefix.length + 1, prefix.length + 13)
  const encoded = BigInt("0x" + hex)
  return Number(encoded / BigInt(0x1000))
}

// `create` truncates (timestamp * 0x1000 + counter) to 6 bytes, so the ascending
// id space wraps about every 795 days — it last wrapped on 2026-08-14T11:19:55Z
// and wraps again on 2028-10-17T20:04:31Z. Right after a wrap a freshly minted
// id sorts BEFORE every id written before it, and readers that resolve "newest"
// lexicographically (session message ordering, latest turn, queued prompts)
// stop seeing new messages entirely. Mint past the caller's high water mark so
// ids stay monotonic within a scope even across a wrap.
export function monotonic(generated: string, highest: string | undefined): string {
  if (highest === undefined || generated > highest) return generated
  const start = highest.indexOf("_") + 1
  const bumped = (BigInt("0x" + highest.slice(start, start + 12)) + BigInt(1)).toString(16).padStart(12, "0")
  if (bumped.length > 12) return generated
  return highest.slice(0, start) + bumped + generated.slice(generated.indexOf("_") + 13)
}

export * as Identifier from "./id"
