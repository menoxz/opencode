import { SyntaxStyle, TextAttributes, type ColorInput } from "@opentui/core"
import { toolExitCode } from "./tool"
import { type RunEntryTheme, type RunTheme } from "./theme"
import type { StreamCommit } from "./types"

function syntax(style?: SyntaxStyle): SyntaxStyle {
  return style ?? SyntaxStyle.fromTheme([])
}

export function entrySyntax(commit: StreamCommit, theme: RunTheme): SyntaxStyle {
  if (commit.kind === "reasoning") {
    return syntax(theme.block.subtleSyntax ?? theme.block.syntax)
  }

  return syntax(theme.block.syntax)
}

/**
 * Un exit non nul n'est pas une erreur d'outil — `state.status` reste `completed` — mais
 * c'est pourtant la seule chose qui dise que la commande a raté : sans cette lecture, un
 * échec s'affiche exactement comme un succès. Même source que la ligne de statut
 * (`toolExitCode`), donc le texte et la couleur ne peuvent pas se contredire.
 */
function failedExit(commit: StreamCommit): boolean {
  if (commit.kind !== "tool" || commit.tool !== "bash") {
    return false
  }

  const code = toolExitCode(commit)
  return code !== undefined && code !== 0
}

export function entryFailed(commit: StreamCommit): boolean {
  return (
    commit.kind === "tool" &&
    (commit.toolState === "error" || commit.part?.state.status === "error" || failedExit(commit))
  )
}

export function entryLook(commit: StreamCommit, theme: RunEntryTheme): { fg: ColorInput; attrs?: number } {
  if (commit.kind === "user") {
    return {
      fg: theme.user.body,
      //attrs: TextAttributes.BOLD,
    }
  }

  if (entryFailed(commit)) {
    return {
      fg: theme.error.body,
      attrs: TextAttributes.BOLD,
    }
  }

  if (commit.phase === "final") {
    return {
      fg: theme.system.body,
      attrs: TextAttributes.DIM,
    }
  }

  if (commit.kind === "tool" && commit.phase === "start") {
    return {
      fg: theme.tool.start ?? theme.tool.body,
    }
  }

  if (commit.kind === "assistant") {
    return { fg: theme.assistant.body }
  }

  if (commit.kind === "reasoning") {
    return {
      fg: theme.reasoning.body,
      attrs: TextAttributes.DIM,
    }
  }

  if (commit.kind === "error") {
    return {
      fg: theme.error.body,
      attrs: TextAttributes.BOLD,
    }
  }

  if (commit.kind === "tool") {
    return { fg: theme.tool.body }
  }

  return { fg: theme.system.body }
}

export function entryColor(commit: StreamCommit, theme: RunTheme): ColorInput {
  if (commit.kind === "assistant") {
    return theme.entry.assistant.body
  }

  if (commit.kind === "reasoning") {
    return theme.entry.reasoning.body
  }

  if (entryFailed(commit)) {
    return theme.entry.error.body
  }

  if (commit.kind === "tool") {
    return theme.block.text
  }

  return entryLook(commit, theme.entry).fg
}
