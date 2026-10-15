import { Folder } from "@/folder"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RootHttpApi } from "../api"

export const folderHandlers = HttpApiBuilder.group(RootHttpApi, "folder", (handlers) =>
  Effect.gen(function* () {
    const folders = yield* Folder.Service

    const list = Effect.fn("FolderHttpApi.list")(function* (ctx: { query: { path: string } }) {
      return yield* folders.list(ctx.query.path)
    })

    return handlers.handle("list", list)
  }),
)
