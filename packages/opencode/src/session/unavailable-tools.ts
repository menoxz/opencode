/**
 * P03: a server that is connected but excluded from the tool catalogue by a
 * health failure would otherwise vanish silently, leaving the model to guess why
 * its tools are missing. This is the one line that turns an unexplained gap into
 * a stated reason.
 *
 * Server names are sanitised of angle brackets before interpolation so a crafted
 * name cannot close the tag early; the name still comes from the same source as
 * the catalogue identifiers, so nothing new is disclosed.
 */
export function unavailableToolsLine(names: readonly string[]): string | undefined {
  const clean = names
    .filter((name) => name.length > 0)
    .map((name) => `${name.replace(/[<>]/g, "")} (offline)`)
  if (clean.length === 0) return undefined
  return `<unavailable_tools>${clean.join(", ")}</unavailable_tools>`
}
