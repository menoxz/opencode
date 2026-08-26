import { EventEmitter } from "events"
import { Identifier } from "@/id/id"

export type GlobalEvent = {
  directory?: string
  project?: string
  workspace?: string
  payload: any
}

type Events = { event: [GlobalEvent] }

const emitter = new EventEmitter<Events>()
const originalEmit = emitter.emit.bind(emitter) as (eventName: string | symbol, ...args: any[]) => boolean
emitter.emit = ((eventName: string | symbol, ...args: any[]) => {
  if (eventName === "event") {
    const event = args[0] as GlobalEvent | undefined
    if (event?.payload && typeof event.payload === "object" && !("id" in event.payload)) {
      event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending")
    }
  }
  return originalEmit(eventName, ...args)
}) as typeof emitter.emit

export const GlobalBus = emitter
