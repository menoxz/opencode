import { expect, test } from "bun:test"
import { Rpc } from "../../../src/util/rpc"
import { withTimeout } from "../../../src/util/timeout"
import { waitForWorkerReady } from "../../../src/cli/cmd/tui/worker-ready"

function fixture(mode: "ready" | "silent" | "error", delay = 100) {
  const dependency = URL.createObjectURL(new Blob([`await Bun.sleep(${delay});`], { type: "application/javascript" }))
  const url = URL.createObjectURL(
    new Blob(
      [
        `import ${JSON.stringify(dependency)};
         import { Rpc } from ${JSON.stringify(new URL("../../../src/util/rpc.ts", import.meta.url).href)};
         if (${JSON.stringify(mode)} === "error") throw new Error("startup import failed");
         Rpc.emit("startup.progress", null);
         Rpc.listen({ ping(value) { return value; } });
         if (${JSON.stringify(mode)} === "ready") Rpc.emit("worker.ready", undefined);`,
      ],
      { type: "application/javascript" },
    ),
  )
  const worker = new Worker(url)
  const client = Rpc.client<{ ping(value: string): string }>(worker)
  const closed = new Promise<void>((resolve) => worker.addEventListener("close", () => resolve(), { once: true }))
  return {
    worker,
    client,
    closed,
    [Symbol.dispose]() {
      worker.terminate()
      URL.revokeObjectURL(url)
      URL.revokeObjectURL(dependency)
    },
  }
}

test("first RPC survives a delayed top-level-await import", async () => {
  using instance = fixture("ready")
  await waitForWorkerReady(instance.worker, instance.client, 2000)
  expect(await withTimeout(instance.client.call("ping", "first request"), 1000, "first RPC was lost")).toBe(
    "first request",
  )
})

test("readiness also works without a startup delay", async () => {
  using instance = fixture("ready", 0)
  await waitForWorkerReady(instance.worker, instance.client, 2000)
  expect(await withTimeout(instance.client.call("ping", "ready"), 1000)).toBe("ready")
})

test("missing ready event times out and terminates the worker", async () => {
  using instance = fixture("silent", 0)
  const progress = new Promise<void>((resolve) => instance.client.on("startup.progress", () => resolve()))
  await expect(waitForWorkerReady(instance.worker, instance.client, 500)).rejects.toThrow("Worker startup timed out")
  await withTimeout(progress, 1000, "worker did not initialize")
  await withTimeout(instance.closed, 1000, "startup timeout did not terminate worker")
})

test("startup worker error rejects before timeout and terminates the worker", async () => {
  using instance = fixture("error")
  await expect(withTimeout(waitForWorkerReady(instance.worker, instance.client, 5000), 2000)).rejects.toThrow(
    "startup import failed",
  )
  await withTimeout(instance.closed, 1000, "startup error did not terminate worker")
})
