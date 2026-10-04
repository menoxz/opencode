import { Context, Effect, Layer, Scope, Exit } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "mcp.websocket" })

export interface TriggerEvent {
  type: "new_trigger" | "heartbeat" | "error"
  data: unknown
}

export interface Interface {
  readonly connect: (url: string) => Effect.Effect<void>
  readonly disconnect: () => Effect.Effect<void>
  readonly subscribe: (callback: (event: TriggerEvent) => void) => Effect.Effect<() => void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MCPWebSocket") {}

export const layer = (url: string) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      let ws: WebSocket | null = null
      const listeners = new Set<(event: TriggerEvent) => void>()
      const scope = yield* Scope.make()

      const emit = (event: TriggerEvent) => {
        for (const fn of listeners) {
          try { fn(event) } catch {}
        }
      }

      const connect = Effect.fn("MCPWebSocket.connect")(function* () {
        log.info("connecting", { url })

        const wsPromise = new Promise<void>((resolve, reject) => {
          try {
            const socket = new WebSocket(url)
            ws = socket

            socket.onopen = () => {
              log.info("connected", { url })
              resolve()
            }

            socket.onerror = () => {
              reject(new Error(`WebSocket connection failed: ${url}`))
            }

            socket.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data as string)
                emit({ type: data.type ?? "new_trigger", data: data.data ?? data })
              } catch {
                emit({ type: "new_trigger", data: event.data })
              }
            }

            socket.onclose = (event) => {
              log.info("connection closed", { url, code: event.code, reason: event.reason })
              ws = null
            }
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        })

        yield* Effect.tryPromise(() => wsPromise).pipe(Effect.ignore)
      })

      const disconnect = Effect.fn("MCPWebSocket.disconnect")(function* () {
        log.info("disconnecting")
        yield* Scope.close(scope, Exit.void).pipe(Effect.ignore)
        if (ws) {
          ws.onclose = null
          ws.close()
          ws = null
        }
      })

      const subscribe = Effect.fn("MCPWebSocket.subscribe")(function* (callback: (event: TriggerEvent) => void) {
        listeners.add(callback)
        return () => {
          listeners.delete(callback)
        }
      })

      return Service.of({
        connect,
        disconnect,
        subscribe,
      } satisfies Interface)
    }),
  )

export * as MCPWebSocket from "."
