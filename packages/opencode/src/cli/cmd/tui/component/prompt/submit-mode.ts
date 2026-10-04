/**
 * The metadata a submitted prompt part carries. While a run is active, only an explicit steer rides
 * that run at its next step; every other submit carries nothing, which is what leaves it queued for
 * the next turn. Kept pure so the Queue/Steer selection is testable without mounting the TUI.
 */
export function steerMetadata(steer: boolean, busy: boolean): { metadata?: { steer: true } } {
  return steer && busy ? { metadata: { steer: true } } : {}
}
