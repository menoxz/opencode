/**
 * Form.io (GNSPD/PSTUDIO) fingerprint.
 *
 * Rules come from the project's published Form.io checklist, not from taste:
 * root `type: "form"` even in wizard display, no HTML injection sink, no
 * reserved Form.io key, never `disabled` together with `validate.required`, and
 * the strict upload contract (`storage: "url"`, `fileKey: "files"`, no
 * `authenticate`, no `fileFormName`, integration upload URL only).
 *
 * @module eval/golden/formio
 */

import { Schema } from "effect"
import type { Finding } from "./fingerprint"

/** Total JSON decoding: a malformed artifact becomes a finding, never a throw. */
const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

/** Keys Form.io reserves; a component using one breaks submission. */
const RESERVED_KEYS = new Set(["submit", "form", "data"])

/** DOM sinks that turn user content into executable markup. */
const HTML_SINKS = ["innerHTML", "outerHTML", "insertAdjacentHTML"]

/** Only the integration file endpoint is allowed in a published form. */
const ALLOWED_UPLOAD_HOST = "api-citizen-portail.integration.gouv.tg"

interface Component {
  key?: string
  type?: string
  disabled?: boolean
  storage?: string
  fileKey?: string
  url?: string
  authenticate?: unknown
  fileFormName?: unknown
  validate?: { required?: boolean }
  [extra: string]: unknown
}

/** Compute every Form.io finding for one artifact. */
export function formioFindings(source: string): Finding[] {
  const root = parseJson(source)
  if (!root) return [{ code: "FORMIO_INVALID_JSON", detail: "file is not parseable JSON" }]

  const components = collectComponents(root)
  return [
    ...rootFindings(root),
    ...sinkFindings(source),
    ...duplicateKeyFindings(components),
    ...components.flatMap(componentFindings),
  ]
}

function rootFindings(root: Record<string, unknown>): Finding[] {
  if (root.type === "form") return []
  return [
    {
      code: "FORMIO_ROOT_TYPE_NOT_FORM",
      detail: `root type is ${JSON.stringify(root.type)}, expected "form" (wizard is a display, not a type)`,
    },
  ]
}

function sinkFindings(source: string): Finding[] {
  return HTML_SINKS.filter((sink) => source.includes(sink)).map((sink) => ({
    code: "FORMIO_XSS_HTML_SINK",
    detail: `custom code assigns through ${sink}, which injects executable markup`,
  }))
}

function duplicateKeyFindings(components: Component[]): Finding[] {
  const counts = new Map<string, number>()
  for (const component of components) {
    if (!component.key) continue
    counts.set(component.key, (counts.get(component.key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      code: "FORMIO_DUPLICATE_KEY",
      detail: `component key "${key}" is used ${count} times; only the last one receives data`,
    }))
}

function componentFindings(component: Component): Finding[] {
  const findings: Finding[] = []
  const key = component.key ?? "(unnamed)"

  if (component.key && RESERVED_KEYS.has(component.key))
    findings.push({ code: "FORMIO_RESERVED_KEY", detail: `component uses the reserved key "${component.key}"` })

  if (component.disabled === true && component.validate?.required === true)
    findings.push({
      code: "FORMIO_DISABLED_REQUIRED",
      detail: `"${key}" is disabled and required at the same time, so the form can never be submitted`,
    })

  if (component.type !== "file") return findings

  if (component.storage !== "url")
    findings.push({
      code: "FORMIO_FILE_STORAGE_NOT_URL",
      detail: `file component "${key}" uses storage ${JSON.stringify(component.storage)}, expected "url"`,
    })
  if (component.fileKey !== "files")
    findings.push({
      code: "FORMIO_FILE_KEY_NOT_FILES",
      detail: `file component "${key}" uses fileKey ${JSON.stringify(component.fileKey)}, expected "files"`,
    })
  if (component.authenticate !== undefined)
    findings.push({
      code: "FORMIO_FILE_AUTHENTICATE_PRESENT",
      detail: `file component "${key}" declares authenticate, which must be absent`,
    })
  if (component.fileFormName !== undefined)
    findings.push({
      code: "FORMIO_FILE_FORMNAME_PRESENT",
      detail: `file component "${key}" declares fileFormName, which must be absent`,
    })
  if (typeof component.url === "string" && !component.url.includes(ALLOWED_UPLOAD_HOST))
    findings.push({
      code: "FORMIO_FILE_URL_NOT_INTEGRATION",
      detail: `file component "${key}" uploads to ${component.url}, outside ${ALLOWED_UPLOAD_HOST}`,
    })

  return findings
}

/** Every component in the tree, including nested columns, panels and wizard pages. */
function collectComponents(root: unknown): Component[] {
  const out: Component[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== "object") return
    const record = node as Record<string, unknown>
    if (typeof record.key === "string" && typeof record.type === "string") out.push(record as Component)
    for (const value of Object.values(record)) walk(value)
  }
  walk(root)
  return out
}

function parseJson(source: string): Record<string, unknown> | undefined {
  const decoded = decodeJson(source)
  if (decoded._tag === "None") return undefined
  const value = decoded.value
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
