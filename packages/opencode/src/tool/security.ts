/**
 * Security mode for the opencode agent.
 *
 * Controls whether write_file (write) and shell (bash) tools are
 * advertised to and usable by the model in different run contexts.
 *
 * - interactive-tui (default): write/shell tools are always visible to the
 *   model and executable with approval via the TUI.
 * - eval:             write/shell tools are completely absent — the model
 *                     never sees them in the tool list or system prompt.
 * - cli-batch:        write/shell tools are visible but the model must ask
 *                     for explicit approval (no pre-approved execution).
 */
export type SecurityMode = "interactive-tui" | "eval" | "cli-batch"

/**
 * The set of tool IDs that are security-gated based on SecurityMode.
 *
 * In "eval" mode these tools are removed entirely from registry.tools()
 * output so the model never sees them. In "cli-batch" mode they are
 * advertised but not pre-approved.
 */
export const SECURITY_GATED_TOOLS = new Set<string>(["write", "shell"])
