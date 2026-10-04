import { Effect } from "effect"
import * as Store from "./store"
import * as Consolidation from "./consolidation"

export interface SleepCycleConfig {
  lightCycleIntervalMs: number
  pruneThreshold: number
  heavyCycleIntervalMs: number
  linkPruneMinStrength: number
  linkPruneMaxDays: number
}

export const defaultSleepConfig: SleepCycleConfig = {
  lightCycleIntervalMs: 5 * 60 * 1000,
  pruneThreshold: 0.1,
  heavyCycleIntervalMs: 24 * 60 * 60 * 1000,
  linkPruneMinStrength: 0.1,
  linkPruneMaxDays: 90,
}

export class SleepCycleManager {
  private store: Store.Interface
  private config: SleepCycleConfig
  private phase1Timer: ReturnType<typeof setInterval> | null = null
  private phase2Timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(store: Store.Interface, config: SleepCycleConfig = defaultSleepConfig) {
    this.store = store
    this.config = config
  }

  start(): void {
    if (this.running) return
    this.running = true

    const runPhase1 = () => {
      Effect.runPromise(this.applyPhase1()).catch(e => console.error("[Sleep] Phase 1 error:", e))
    }
    runPhase1()
    this.phase1Timer = setInterval(runPhase1, this.config.lightCycleIntervalMs)

    setTimeout(() => {
      Effect.runPromise(this.applyPhase2()).catch(e => console.error("[Sleep] Phase 2 error:", e))
    }, 5 * 60 * 1000)
    this.phase2Timer = setInterval(() => {
      Effect.runPromise(this.applyPhase2()).catch(e => console.error("[Sleep] Phase 2 error:", e))
    }, this.config.heavyCycleIntervalMs)
  }

  stop(): void {
    this.running = false
    if (this.phase1Timer) { clearInterval(this.phase1Timer); this.phase1Timer = null }
    if (this.phase2Timer) { clearInterval(this.phase2Timer); this.phase2Timer = null }
  }

  private applyPhase1(): Effect.Effect<void> {
    return Effect.gen(function* (this: SleepCycleManager) {
      const all = yield* this.store.getAllMemories()
      const updates: Array<{ id: string; confidence: number }> = []
      const FORGETTING_RATES: Record<string, number> = { semantic: 0.01, episodic: 0.05, procedural: 0.005, profile: 0.02, learning: 0.01, pattern: 0.005 }
      for (const m of all) {
        const days = ((Date.now() - (m.last_access_at ?? m.created_at)) / 86400000)
        const lambda = (m.forgetting_rate ?? FORGETTING_RATES[m.memory_type]) ?? 0.01
        const nc = Math.max(0, m.confidence * Math.exp(-lambda * Math.max(0, days)))
        if (nc < this.config.pruneThreshold) {
          yield* this.store.deleteById(m.id)
        } else if (nc < m.confidence - 0.001) {
          updates.push({ id: m.id, confidence: nc })
        }
      }
      if (updates.length > 0) {
        yield* this.store.batchUpdateConfidence(updates)
      }
    }.bind(this))
  }

  private applyPhase2(): Effect.Effect<void> {
    return Effect.gen(function* (this: SleepCycleManager) {
      const consStore: Consolidation.ConsolidationStore = {
        getAll: () => this.store.getAllMemories(),
        updateConfidence: (id, conf) => this.store.updateConfidence(id, conf),
        updateContent: (id, c) => this.store.updateContent(id, c),
        deleteById: (id) => this.store.deleteById(id),
      }
      yield* Consolidation.consolidate(consStore, false)
      yield* this.store.pruneLinks(this.config.linkPruneMinStrength, this.config.linkPruneMaxDays)
    }.bind(this))
  }
}
