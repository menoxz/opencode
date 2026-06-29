import { MessageV2 } from "./message-v2"

export type MethodologyMode = "minimal" | "light" | "full"

export const LIGHT_METHODOLOGY_REMINDER = [
  `<methodology_reminder mode="light">`,
  `  Continue with the lightest reliable next step.`,
  `  <remind type="stuck-protocol">If stuck or uncertain, inspect code/docs/examples before trial-and-error.</remind>`,
  `  <remind type="tools">Use tools yourself when they improve correctness or reduce uncertainty.</remind>`,
  `</methodology_reminder>`,
].join("\n")

export function inspectMethodologyActivity(messages: MessageV2.WithParts[]) {
  const hasToolActivity = messages.some(
    (m) =>
      m.info.role === "assistant" &&
      m.parts.some((p) => p.type === "tool" && (p as any).state?.status === "success"),
  )

  const hasSearchedWeb = messages.some(
    (m) =>
      m.info.role === "assistant" &&
      m.parts.some(
        (p) => p.type === "tool" && (p as any).tool === "google_search" && (p as any).state?.status === "success",
      ),
  )

  const hasMemoryRetrieved = messages.some(
    (m) =>
      m.info.role === "assistant" &&
      m.parts.some(
        (p) =>
          p.type === "tool" &&
          ((p as any).tool === "memory_retrieve" || (p as any).tool === "memory") &&
          (p as any).state?.status === "success",
      ),
  )

  return { hasToolActivity, hasSearchedWeb, hasMemoryRetrieved }
}

export function buildMethodologyReminder(input: {
  step: number
  mode: MethodologyMode
  messages: MessageV2.WithParts[]
}): string | undefined {
  const { step, mode, messages } = input
  const { hasToolActivity, hasSearchedWeb, hasMemoryRetrieved } = inspectMethodologyActivity(messages)

  if (mode === "minimal") {
    if (step === 1) {
      return [
        `<methodology_reminder mode="minimal">`,
        `START: choose the lightest reliable workflow; plan/research only as the task requires.${!hasMemoryRetrieved ? ` Retrieve memory if prior context may matter.` : ""}${!hasSearchedWeb ? ` Check docs/web if uncertainty would cause guessing.` : ""}`,
        `</methodology_reminder>`,
      ].join("\n")
    }
    if (hasToolActivity) {
      return [
        `<methodology_reminder mode="minimal">`,
        `Observe tool results, adjust if needed, and verify proportionally before finishing.`,
        `</methodology_reminder>`,
      ].join("\n")
    }
    return
  }

  const parts: string[] = []
  parts.push(`<methodology_reminder mode="${mode}">`)

  if (step === 1) {
    parts.push("  You are at the START of this task.")
    if (!hasSearchedWeb) {
      parts.push(
        '  <remind type="research">If APIs, dependencies, errors, or conventions are uncertain, check docs/web/examples before guessing.</remind>',
      )
    }
    if (!hasMemoryRetrieved) {
      parts.push(
        '  <remind type="memory">Retrieve memory when prior project context, decisions, or user preferences may affect the answer.</remind>',
      )
    }
    parts.push(
      '  <remind type="plan">For non-trivial work, clarify intent, identify relevant files/systems, choose verification, then act incrementally.</remind>',
    )
  } else if (hasToolActivity) {
    parts.push("  You have made tool calls — use their results before continuing:")
    parts.push('  <remind type="observe">OBSERVE — compare actual vs expected results</remind>')
    parts.push('  <remind type="reflect">REFLECT — decide whether to continue, revise, test further, or finish</remind>')
    parts.push(
      '  <remind type="learn">LEARN — update memory/skills only when the workflow or decision is likely to be useful again</remind>',
    )
    parts.push('  <remind type="continue">Continue PLAN -> ACT -> OBSERVE -> REFLECT when more work remains</remind>')
    if (!hasMemoryRetrieved) {
      parts.push('  <remind type="memory">Store durable project decisions or repeatable methods when useful.</remind>')
    }
  } else {
    return LIGHT_METHODOLOGY_REMINDER
  }

  parts.push("</methodology_reminder>")
  return parts.join("\n")
}

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
