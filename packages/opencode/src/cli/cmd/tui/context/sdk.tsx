import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { createSimpleContext } from "./helper"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { Flag } from "@opencode-ai/core/flag/flag"
import { batch, createSignal, onCleanup, onMount } from "solid-js"
import { readServerVersion } from "../server-version"

export type EventSource = {
  subscribe: (handler: (event: GlobalEvent) => void) => Promise<() => void>
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let sse: AbortController | undefined
    // Nombre de fois ou le flux a ete rouvert apres avoir deja livre : une coupure reseau, ou un
    // serveur relance a chaud (`bun --watch`) qui a oublie ses instances. La couche de
    // synchronisation s'en sert pour relire son etat ; la premiere connexion ne compte pas.
    const [reconnects, setReconnects] = createSignal(0)
    let streamOpened = false
    const [serverVersion, setServerVersion] = createSignal<string | undefined>()

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: props.fetch,
        headers: props.headers,
      })
    }

    let sdk = createSDK()

    const emitter = createGlobalEmitter<{
      event: GlobalEvent
    }>()

    let queue: GlobalEvent[] = []
    let timer: Timer | undefined
    let last = 0
    const retryDelay = 1000
    const maxRetryDelay = 30000

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit("event", event)
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    /**
     * La version que tourne réellement le serveur attaché. Relue à chaque ouverture du flux : un
     * serveur relancé entre deux connexions change de version, et l'écart doit se voir sans relancer
     * la TUI. Une lecture qui échoue laisse la valeur précédente — une absence n'est pas un accord.
     */
    function refreshServerVersion() {
      void readServerVersion({ url: props.url, headers: props.headers, fetch: props.fetch }).then((version) => {
        if (version !== undefined) setServerVersion(version)
      })
    }

    function startSSE() {
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      ;(async () => {
        let attempt = 0
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          const events = await sdk.global.event({
            signal: ctrl.signal,
            sseMaxRetryAttempts: 0,
          })

          // Le flux se rouvre alors qu'il avait deja servi : le serveur a pu redemarrer entre les
          // deux, et rien d'autre ne le signale (un redemarrage dur n'emet pas
          // `server.instance.disposed`).
          if (streamOpened) setReconnects((count) => count + 1)
          streamOpened = true
          refreshServerVersion()

          if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
            // Start syncing workspaces, it's important to do this after
            // we've started listening to events
            await sdk.sync.start().catch(() => {})
          }

          for await (const event of events.stream) {
            if (ctrl.signal.aborted) break
            handleEvent(event)
          }

          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // Exponential backoff
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      })().catch(() => {})
    }

    onMount(async () => {
      refreshServerVersion()
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)

        if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
          // Start syncing workspaces, it's important to do this after
          // we've started listening to events
          await sdk.sync.start().catch(() => {})
        }
      } else {
        startSSE()
      }
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
    })

    return {
      get client() {
        return sdk
      },
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      url: props.url,
      /** Compteur des reconnexions du flux, pour les couches qui doivent relire leur etat. */
      reconnects,
      /** La version que tourne le serveur attaché, `undefined` tant qu'il ne l'a pas attestée. */
      serverVersion,
    }
  },
})
