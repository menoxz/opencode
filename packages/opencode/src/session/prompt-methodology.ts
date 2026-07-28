/**
 * Wrap automatically-injected guidance (methodology, plan, goal, daemon) so the
 * model treats it as a system-side reminder rather than a fresh user message.
 * Prevents the "user pasted a block -> acknowledge and re-inspect" loop where the
 * agent stalls re-reading instead of acting. Returns undefined when no body.
 */
export function wrapInjectedGuidance(body: string | undefined): string | undefined {
  if (!body || !body.trim()) return undefined
  return [
    "<system-reminder>",
    "The following is automatically injected guidance, not a new user message. Do not acknowledge it; just continue toward the current objective.",
    body,
    "</system-reminder>",
  ].join("\n")
}
