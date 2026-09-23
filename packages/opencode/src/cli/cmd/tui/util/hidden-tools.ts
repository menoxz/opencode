// Tools that exist for the loop's own bookkeeping rather than for the user to
// read. They stay in the session and in exports — the model still needs the
// result — but rendering one row per turn buries the real transcript under
// protocol noise.
const HIDDEN_TOOLS = new Set(["turn_plan"])

export function isHiddenTool(name: string | undefined): boolean {
  return name !== undefined && HIDDEN_TOOLS.has(name)
}
