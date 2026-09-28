import { expect, test } from "bun:test"
import { steerMetadata } from "./submit-mode"

test("queues by default while a run is active", () => {
  expect(steerMetadata(false, true)).toEqual({})
})

test("steers only on an explicit request during a run", () => {
  expect(steerMetadata(true, true)).toEqual({ metadata: { steer: true } })
})

test("a prompt sent while idle never carries steer metadata", () => {
  expect(steerMetadata(true, false)).toEqual({})
})
