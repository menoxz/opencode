import { createSignal } from "solid-js"

// Which view fills the session's agent output area. The live transcript, the
// config editor and the session trajectory all render inside that area, so
// switching between them never leaves the session route: the prompt and the
// sidebar stay mounted. "session" is the live transcript and the default.
export type SessionPanel = "session" | "config" | "logs"

export const [sessionPanel, setSessionPanel] = createSignal<SessionPanel>("session")
