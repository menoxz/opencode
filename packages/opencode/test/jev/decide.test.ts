import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { JevDecide } from "@/jev/decide"

/** A client that never answers, to drive the timeout path. */
const hang: Effect.Effect<undefined> = Effect.never

const ok = (value: string) => Effect.succeed(value)

describe("jev.decide fallbacks", () => {
  test("returns the model's answer when the call succeeds", async () => {
    const outcome = await Effect.runPromise(
      JevDecide.decide({
        label: "t",
        circuit: JevDecide.makeCircuit(),
        enabled: true,
        timeoutMs: 1_000,
        fallback: () => "heuristic",
        run: ok("jev"),
      }),
    )
    expect(outcome).toMatchObject({ source: "jev", value: "jev" })
  })

  test("makes no call at all when the hook is disabled", async () => {
    let called = 0
    const outcome = await Effect.runPromise(
      JevDecide.decide({
        label: "t",
        circuit: JevDecide.makeCircuit(),
        enabled: false,
        timeoutMs: 1_000,
        fallback: () => "heuristic",
        run: Effect.sync(() => {
          called += 1
          return "jev"
        }),
      }),
    )
    expect(outcome).toMatchObject({ source: "fallback", value: "heuristic", reason: "disabled" })
    expect(called).toBe(0)
  })

  test("falls back with reason error when the call fails", async () => {
    const outcome = await Effect.runPromise(
      JevDecide.decide({
        label: "t",
        circuit: JevDecide.makeCircuit(),
        enabled: true,
        timeoutMs: 1_000,
        fallback: () => "heuristic",
        run: Effect.fail(new Error("boom")),
      }),
    )
    expect(outcome).toMatchObject({ source: "fallback", value: "heuristic", reason: "error" })
  })

  test("falls back with reason timeout when the call hangs", async () => {
    const outcome = await Effect.runPromise(
      JevDecide.decide({
        label: "t",
        circuit: JevDecide.makeCircuit(),
        enabled: true,
        timeoutMs: 20,
        fallback: () => "heuristic",
        run: hang,
      }),
    )
    expect(outcome).toMatchObject({ source: "fallback", value: "heuristic", reason: "timeout" })
  })

  test("treats an absent answer as an abstention, not an outage", async () => {
    const circuit = JevDecide.makeCircuit()
    const outcome = await Effect.runPromise(
      JevDecide.decide<string>({
        label: "t",
        circuit,
        enabled: true,
        timeoutMs: 1_000,
        fallback: () => "heuristic",
        run: Effect.succeed(undefined),
      }),
    )
    expect(outcome).toMatchObject({ source: "fallback", value: "heuristic", reason: "incomplete" })
    // An abstention must not count towards opening the breaker.
    expect(JevDecide.isOpen(circuit)).toBe(false)
  })
})

describe("jev.decide circuit breaker", () => {
  test("opens after the threshold and then short-circuits without calling", async () => {
    const circuit = JevDecide.makeCircuit()
    let called = 0
    const attempt = () =>
      Effect.runPromise(
        JevDecide.decide({
          label: "t",
          circuit,
          enabled: true,
          timeoutMs: 1_000,
          breakerThreshold: 2,
          fallback: () => "heuristic",
          run: Effect.sync(() => {
            called += 1
            throw new Error("boom")
          }),
        }),
      )

    await attempt()
    expect(JevDecide.isOpen(circuit, 2)).toBe(false)
    await attempt()
    expect(JevDecide.isOpen(circuit, 2)).toBe(true)

    const third = await attempt()
    expect(third).toMatchObject({ source: "fallback", reason: "circuit-open" })
    expect(called).toBe(2)
  })

  test("closes again on the first success", async () => {
    const circuit = JevDecide.makeCircuit()
    circuit.failures = 5
    circuit.openedAt = 0
    expect(JevDecide.isOpen(circuit)).toBe(false)

    const outcome = await Effect.runPromise(
      JevDecide.decide({
        label: "t",
        circuit,
        enabled: true,
        timeoutMs: 1_000,
        fallback: () => "heuristic",
        run: ok("jev"),
      }),
    )
    expect(outcome.source).toBe("jev")
    expect(circuit.failures).toBe(0)
  })
})