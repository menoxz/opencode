import { Schedule, Duration } from "effect"

export const every_30s = Schedule.fixed(Duration.seconds(30))
export const every_1m = Schedule.fixed(Duration.minutes(1))
export const every_5m = Schedule.fixed(Duration.minutes(5))
export const every_15m = Schedule.fixed(Duration.minutes(15))
export const every_1h = Schedule.fixed(Duration.hours(1))
export const every_6h = Schedule.fixed(Duration.hours(6))
export const every_24h = Schedule.fixed(Duration.hours(24))

export * as DaemonScheduler from "."
