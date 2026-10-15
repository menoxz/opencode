import { Folder } from "@/folder"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"

/**
 * Parcourir les dossiers d'un chemin **absolu**.
 *
 * Cette route vit dans `RootHttpApi` et non dans les routes d'instance : on choisit un dossier de
 * travail **avant** d'avoir une instance, et le parcours sort par nature du projet courant — c'est
 * même sa raison d'être (`File.list` refuse tout ce qui est hors du projet).
 */
export const FolderQuery = Schema.Struct({
  path: Schema.String,
})

export const FolderPaths = {
  list: "/folder",
} as const

export const FolderApi = HttpApi.make("folder")
  .add(
    HttpApiGroup.make("folder")
      .add(
        HttpApiEndpoint.get("list", FolderPaths.list, {
          query: FolderQuery,
          success: described(Folder.Listing, "Folder listing"),
          error: Folder.NotAFolder,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "folder.list",
            summary: "List folders",
            description:
              "List the sub-directories of an absolute path, so a workspace folder can be chosen instead of typed.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "folder",
          description: "Directory browsing, for choosing a workspace folder.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode folder HttpApi",
      version: "0.0.1",
      description: "Directory browsing surface for the workspace picker.",
    }),
  )
