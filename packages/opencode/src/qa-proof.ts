export const QA_PHASE_ORDER = ["seed", "services", "ui", "network", "database", "security"] as const
export type QaPhase = (typeof QA_PHASE_ORDER)[number]
export type QaManifest = { phases?: Partial<Record<QaPhase | "reset", string>> }

export function validateQaManifest(input: QaManifest) {
  const errors: string[] = []
  for (const phase of [...QA_PHASE_ORDER, "reset"] as const) {
    if (!input.phases?.[phase]?.trim()) errors.push(`Missing required phase: ${phase}`)
  }
  return { ok: errors.length === 0, errors, order: [...QA_PHASE_ORDER] }
}


export async function runQaWorkflow(
  manifest: QaManifest,
  execute: (phase: QaPhase | "reset", command: string) => Promise<number>,
) {
  const validation = validateQaManifest(manifest)
  if (!validation.ok) return { ok: false, errors: validation.errors, results: [], cleanupCode: undefined as number | undefined }
  const results: Array<{ phase: QaPhase; code: number }> = []
  let failedPhase: QaPhase | undefined
  let cleanupCode: number | undefined
  try {
    for (const phase of QA_PHASE_ORDER) {
      const code = await execute(phase, manifest.phases![phase]!)
      results.push({ phase, code })
      if (code !== 0) { failedPhase = phase; break }
    }
  } finally {
    cleanupCode = await execute("reset", manifest.phases!.reset!)
  }
  return { ok: failedPhase === undefined && cleanupCode === 0, results, failedPhase, cleanupCode, errors: [] as string[] }
}
