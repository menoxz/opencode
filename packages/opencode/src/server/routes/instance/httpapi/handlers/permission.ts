import { InstanceRef } from "@/effect/instance-ref"
import { Permission } from "@/permission"
import { PermissionID } from "@/permission/schema"
import { InstanceStore } from "@/project/instance-store"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { PermissionNotFoundError } from "../errors"

/**
 * Tries the ambient instance first, then every other live instance until one holds the request.
 * `apply` answers `undefined` when an instance does not hold it — the only outcome worth a retry,
 * since a rejected or corrected request has already been answered and must not be replayed.
 */
export function replyAnywhere<A, E, R>(input: {
  skip?: string
  directories: readonly string[]
  apply: (directory?: string) => Effect.Effect<A | undefined, E, R>
}): Effect.Effect<A | undefined, E, R> {
  return Effect.gen(function* () {
    const first = yield* input.apply()
    if (first !== undefined) return first
    for (const directory of input.directories) {
      if (directory === input.skip) continue
      const next = yield* input.apply(directory)
      if (next !== undefined) return next
    }
    return undefined
  })
}

export const permissionHandlers = HttpApiBuilder.group(InstanceHttpApi, "permission", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Permission.Service
    const store = yield* InstanceStore.Service

    const list = Effect.fn("PermissionHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const reply = Effect.fn("PermissionHttpApi.reply")(function* (ctx: {
      params: { requestID: PermissionID }
      payload: Permission.ReplyBody
    }) {
      const input = {
        requestID: ctx.params.requestID,
        reply: ctx.payload.reply,
        message: ctx.payload.message,
      }

      const apply = (directory?: string) =>
        (directory ? store.provide({ directory }, svc.reply(input)) : svc.reply(input)).pipe(
          Effect.as(true as const),
          Effect.catchTag("Permission.NotFoundError", () => Effect.succeed(undefined)),
        )

      // A reply names a globally unique request id, while the client that sends it is often the
      // TUI: its permission panel is fed by the unfiltered global event stream, so it shows the
      // requests of every instance while its own `directory` names only one of them. Routing the
      // reply by that single directory answered 404 for every prompt belonging to another folder —
      // the panel stayed on screen and no button did anything. So the request is looked up in the
      // ambient instance, then in the other live ones, without loading a new instance.
      const ambient = yield* InstanceRef
      const handled = yield* replyAnywhere({
        skip: ambient?.directory,
        directories: store.directories(),
        apply,
      })
      if (handled !== undefined) return true

      return yield* new PermissionNotFoundError({
        requestID: String(ctx.params.requestID),
        message: `Permission request not found: ${ctx.params.requestID}`,
      })
    })

    return handlers.handle("list", list).handle("reply", reply)
  }),
)
