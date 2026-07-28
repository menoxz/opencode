import { ToolCatalog, type PreparedTool } from "../src/session/tool-catalog"

const TOOL_COUNT = 250
const ITERATIONS = 2_000
const source = Array.from({ length: TOOL_COUNT }, (_, index) => ({
  id: index === 217 ? "github_create_pull_request" : `service_${index}_operation`,
  description:
    index === 217
      ? "Create a pull request in a GitHub repository"
      : `Synthetic service operation number ${index} for benchmark coverage`,
  value: index,
})) satisfies PreparedTool<number>[]

const build = () => source.map((item) => ({ ...item, description: `${item.description}` }))
const measure = (run: () => void) => {
  const start = Bun.nanoseconds()
  run()
  return (Bun.nanoseconds() - start) / 1_000_000
}

const baselineMs = measure(() => {
  for (let i = 0; i < ITERATIONS; i++) build()
})

const owner = {}
const preparedMs = measure(() => {
  for (let i = 0; i < ITERATIONS; i++) ToolCatalog.getPrepared(owner, "benchmark-v1", build)
})

const { catalog } = ToolCatalog.getPrepared(owner, "benchmark-v1", build)
const selection = ToolCatalog.selectTools(catalog, "open a github pull request", {
  enabled: true,
  threshold: 30,
  maxTools: 20,
})

const output = {
  toolCount: TOOL_COUNT,
  iterations: ITERATIONS,
  baselineMs: Number(baselineMs.toFixed(3)),
  preparedMs: Number(preparedMs.toFixed(3)),
  speedup: Number((baselineMs / preparedMs).toFixed(2)),
  selectedTools: selection.tools.length,
  contextReductionPercent: Number((100 * (1 - selection.tools.length / TOOL_COUNT)).toFixed(1)),
  selectionMode: selection.mode,
}

console.log(JSON.stringify(output, null, 2))
