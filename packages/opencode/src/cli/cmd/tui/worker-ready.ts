import type { Rpc } from "@/util/rpc"
import { withTimeout } from "@/util/timeout"

export function waitForWorkerReady(worker: Worker, client: Pick<ReturnType<typeof Rpc.client>, "on">, ms = 30_000) {
  const ready = Promise.withResolvers<void>()
  const off = client.on("worker.ready", () => ready.resolve())
  const error = (event: ErrorEvent) => {
    ready.reject(event.error ?? new Error(event.message || "Worker startup failed"))
  }
  worker.addEventListener("error", error)
  return withTimeout(ready.promise, ms, "Worker startup timed out")
    .catch((error) => {
      worker.terminate()
      throw error
    })
    .finally(() => {
      off()
      worker.removeEventListener("error", error)
    })
}
