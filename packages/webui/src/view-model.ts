/**
 * Pure decision logic for the web UI, kept free of JSX so it can be tested with `bun test`.
 *
 * Rationale: Vite needs `jsx: "preserve"` (vite-plugin-solid compiles the JSX) while Bun needs
 * `jsx: "react-jsx"` to run a file containing JSX. The two cannot share one tsconfig, so anything
 * worth asserting lives here, in plain TypeScript, and the components stay thin.
 */

/** Mirrors `ToolState` (packages/sdk/js/src/v2/gen/types.gen.ts:574-629). */
export type ToolState =
  | { status: "pending"; input: Record<string, unknown>; raw: string }
  | { status: "running"; input: Record<string, unknown>; title?: string; time: { start: number } }
  | {
      status: "completed"
      input: Record<string, unknown>
      output: string
      title: string
      time: { start: number; end: number }
    }
  | { status: "error"; input: Record<string, unknown>; error: string; time: { start: number; end: number } }

/** Mirrors `PermissionRequest` (types.gen.ts:178-191). */
export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
}

export type PermissionReply = "once" | "always" | "reject"

export type UiEvent = { type: string; properties?: unknown }

export function toolStatusLabel(state: ToolState): string {
  switch (state.status) {
    case "pending":
      return "en attente"
    case "running":
      return "en cours"
    case "completed":
      return "terminé"
    case "error":
      return "erreur"
  }
}

/** Only `running` and `completed` carry a human title. */
export function toolTitle(state: ToolState): string | undefined {
  if (state.status === "running") return state.title
  if (state.status === "completed") return state.title
  return undefined
}

/**
 * What the expanded panel shows. `pending` exposes only the raw call, `running` only the input,
 * `completed` adds the output, `error` the message — never an empty box.
 */
export function toolDetail(state: ToolState): { input?: string; output?: string; error?: string } {
  const detail: { input?: string; output?: string; error?: string } = {}
  if (Object.keys(state.input ?? {}).length > 0) detail.input = JSON.stringify(state.input, null, 2)
  if (state.status === "completed") detail.output = state.output
  if (state.status === "error") detail.error = state.error
  return detail
}

/** A permission is only worth an "always" button when the server offered patterns for it. */
export function canAlways(request: PermissionRequest): boolean {
  return request.always.length > 0
}

/**
 * Reducer behind the permission panel. `permission.asked` adds, `permission.replied` removes —
 * keyed on `requestID`, which is the field the replied event actually carries.
 */
export function reducePermissions(current: PermissionRequest[], event: UiEvent): PermissionRequest[] {
  if (event.type === "permission.asked") {
    const request = event.properties as PermissionRequest | undefined
    if (!request?.id) return current
    if (current.some((item) => item.id === request.id)) return current
    return [...current, request]
  }
  if (event.type === "permission.replied") {
    const requestID = (event.properties as { requestID?: string } | undefined)?.requestID
    if (!requestID) return current
    return current.filter((item) => item.id !== requestID)
  }
  return current
}

/** Removes a request locally after the user answered, before the server confirms. */
export function dropPermission(current: PermissionRequest[], requestID: string): PermissionRequest[] {
  return current.filter((item) => item.id !== requestID)
}

/** Which reply the user can send for a request, in display order. */
export function permissionActions(request: PermissionRequest): PermissionReply[] {
  return canAlways(request) ? ["once", "always", "reject"] : ["once", "reject"]
}
