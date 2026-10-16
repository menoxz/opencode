export function collapseToolOutput(output: string, maxLines: number, maxChars: number) {
  const lines = output.split("\n")
  if (lines.length <= maxLines && Array.from(output).length <= maxChars) {
    return { output, overflow: false }
  }

  const preview = lines.slice(0, maxLines).join("\n")
  if (Array.from(preview).length > maxChars) {
    return {
      output:
        Array.from(preview)
          .slice(0, Math.max(0, maxChars - 1))
          .join("") + "…",
      overflow: true,
    }
  }

  return { output: [...lines.slice(0, maxLines), "…"].join("\n"), overflow: true }
}

/**
 * Même bornage, mais par la **fin** : le début d'une sortie de commande est du bruit
 * d'installation, l'information — le verdict, l'erreur, le total — vit dans les dernières
 * lignes. Le repère passe donc **devant** la sortie gardée, il ne vit jamais seul.
 */
export function collapseToolOutputTail(output: string, maxLines: number, maxChars: number) {
  const lines = output.split("\n")
  if (lines.length <= maxLines && Array.from(output).length <= maxChars) {
    return { output, overflow: false }
  }

  const preview = lines.slice(-maxLines).join("\n")
  if (Array.from(preview).length > maxChars) {
    const kept = Array.from(preview)
      .slice(-Math.max(0, maxChars - 1))
      .join("")
    return { output: `…${kept}`, overflow: true }
  }

  return { output: ["…", ...lines.slice(-maxLines)].join("\n"), overflow: true }
}
