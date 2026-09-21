/**
 * Opening marker of every injected block. The provider layer reads it to keep an
 * injected tail out of the cached prefix (see `provider/transform.ts`).
 */
export const INJECTED_GUIDANCE_MARKER = "<system-reminder>"

/**
 * Wrap automatically-injected guidance (methodology, plan, goal, daemon) so the
 * model treats it as a system-side reminder rather than a fresh user message.
 * Prevents the "user pasted a block -> acknowledge and re-inspect" loop where the
 * agent stalls re-reading instead of acting. Returns undefined when no body.
 */
export function wrapInjectedGuidance(body: string | undefined): string | undefined {
  if (!body || !body.trim()) return undefined
  return [
    INJECTED_GUIDANCE_MARKER,
    "The following is automatically injected guidance, not a new user message. Do not acknowledge it; just continue toward the current objective.",
    body,
    "</system-reminder>",
  ].join("\n")
}
