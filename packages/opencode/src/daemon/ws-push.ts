import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { handlePendingTriggers } from "./trigger-handler"

const log = Log.create({ service: "daemon.ws-push" })

const WS_URL = process.env.OPENCODE_WS_URL ?? "ws://localhost:8646"

// ── Types ───────────────────────────────────────────────────────────────

interface WsMessage {
  type: "new_trigger" | "heartbeat" | string
  data: unknown
}

interface TriggerData {
  id: string
  source: string
  payload: unknown
}

// ── WebSocket push listener ─────────────────────────────────────────────

/**
 * Listen for trigger push notifications via WebSocket.
 *
 * Runs forever — on disconnect/error it waits 3 seconds and reconnects.
 * When a `new_trigger` message arrives, dispatches to `handlePendingTriggers`
 * immediately instead of waiting for the next poll cycle.
 */
export const listenForTriggers = Effect.fnUntraced(function* () {
  log.info("Starting WebSocket push listener", { url: WS_URL })

  yield* Effect.forever(
    Effect.gen(function* () {
      yield* connectAndListen()
      // Wait before reconnecting to avoid tight loop on persistent failure
      yield* Effect.sleep("3 seconds")
    }),
  )
})

/**
 * Connect to the trigger server WS endpoint and subscribe to push events.
 * Returns when the connection closes (triggers reconnection in the forever loop).
 */
function connectAndListen(): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    let done = false
    let ws: WebSocket | null = null

    try {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        log.info("Connected to trigger server WS", { url: WS_URL })
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage

          if (msg.type === "new_trigger" && msg.data) {
            const trigger = msg.data as TriggerData
            log.info("WS push: new trigger received", {
              id: trigger.id,
              source: trigger.source,
            })
            // Fire-and-forget: handle the trigger immediately
            Effect.runFork(handlePendingTriggers([trigger]))
          }
          // heartbeat and other messages are ignored
        } catch {
          // Malformed message — ignore
        }
      }

      ws.onclose = () => {
        if (!done) {
          done = true
          log.info("WS connection closed — will reconnect in 3s")
          resume(Effect.void)
        }
      }

      ws.onerror = () => {
        if (!done) {
          done = true
          log.warn("WS connection error — will reconnect in 3s")
          resume(Effect.void)
        }
      }
    } catch (error) {
      if (!done) {
        done = true
        log.warn("Failed to create WebSocket — will retry in 3s", { error })
        resume(Effect.void)
      }
    }

    // Cleanup on Effect interruption (daemon shutdown)
    return Effect.sync(() => {
      if (ws) {
        done = true
        ws.onclose = null
        ws.onerror = null
        ws.close()
        ws = null
      }
    })
  })
}

export * as WsPush from "./ws-push"
