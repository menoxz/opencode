import path from "path"
import { createClient } from "@hey-api/openapi-ts"

const dir = "C:/jeanluc/opencode-fork/packages/sdk/js"
process.chdir(dir)

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen",
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    { name: "@hey-api/typescript", exportFromIndex: false },
    {
      name: "@hey-api/sdk",
      instance: "OpencodeClient",
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    { name: "@hey-api/client-fetch", exportFromIndex: false, baseUrl: "http://localhost:4096" },
  ],
})

const sseTypesPath = "./src/v2/gen/client/types.gen.ts"
const sseTypesFile = Bun.file(sseTypesPath)
const sseTypesSource = await sseTypesFile.text()
const sseTypesPatched = sseTypesSource.replace(
  "=> Promise<ServerSentEventsResult<TData, TError>>",
  "=> Promise<ServerSentEventsResult<TData>>",
)
if (sseTypesPatched === sseTypesSource) {
  throw new Error(`SseFn patch did not apply (${sseTypesPath})`)
}
await Bun.write(sseTypesPath, sseTypesPatched)
console.log("CODEGEN_DONE")
