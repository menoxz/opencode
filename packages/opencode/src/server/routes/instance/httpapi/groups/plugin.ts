import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"

const root = "/plugin"

export const AddPayload = Schema.Struct({
  spec: Schema.String.annotate({ description: "Plugin specifier: a local path, a file URL or an npm package name." }),
})

export const PluginParam = Schema.Struct({
  spec: Schema.String,
})

export const PluginOrigin = Schema.Struct({
  spec: Schema.String,
  scope: Schema.String,
})

// What the running server actually serves: the generation counter that consumers use to detect a
// swap, the configured plugin origins, and the union of hooks the loaded plugins register.
export const PluginStatus = Schema.Struct({
  version: Schema.Number,
  origins: Schema.Array(PluginOrigin),
  hooks: Schema.Array(Schema.String),
})

export const PluginPaths = {
  list: root,
  reload: `${root}/reload`,
  add: root,
  remove: `${root}/:spec`,
} as const

export const PluginApi = HttpApi.make("plugin").add(
  HttpApiGroup.make("plugin")
    .add(
      HttpApiEndpoint.get("list", PluginPaths.list, {
        query: WorkspaceRoutingQuery,
        success: described(PluginStatus, "Loaded plugins and their hooks"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.list",
          summary: "List loaded plugins",
          description:
            "List the plugin origins the server is serving, the hooks they registered, and the current plugin generation.",
        }),
      ),
      HttpApiEndpoint.post("reload", PluginPaths.reload, {
        query: WorkspaceRoutingQuery,
        success: described(PluginStatus, "Plugin generation after the reload"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.reload",
          summary: "Reload plugins",
          description:
            "Re-read plugin code from disk. A plugin that fails to load is quarantined and the previous generation keeps serving, so a reload never breaks a running session.",
        }),
      ),
      HttpApiEndpoint.post("add", PluginPaths.add, {
        query: WorkspaceRoutingQuery,
        payload: AddPayload,
        success: described(PluginStatus, "Plugin generation after adding the origin"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.add",
          summary: "Add a plugin origin",
          description: "Add a plugin specifier to the global config and reload, without restarting the server.",
        }),
      ),
      HttpApiEndpoint.delete("remove", PluginPaths.remove, {
        params: PluginParam,
        query: WorkspaceRoutingQuery,
        success: described(PluginStatus, "Plugin generation after removing the origin"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.remove",
          summary: "Remove a plugin origin",
          description: "Remove a plugin specifier from the global config and reload, without restarting the server.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "Plugins" }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware),
)
