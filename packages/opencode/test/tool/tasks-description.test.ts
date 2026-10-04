import { describe, expect, test } from "bun:test"
import { renderTaskCatalog } from "../../src/tool/tasks"

describe("tasks tool dynamic description", () => {
  test("states the usage rule and lists defined tasks with their descriptions", () => {
    const out = renderTaskCatalog({
      build: { command: "bun run build", description: "Compile everything" },
      test: { command: "bun test" },
    } as any)
    expect(out).toContain("prefer it for repeatable project commands")
    expect(out).toContain("Defined tasks")
    expect(out).toContain("- build: Compile everything")
    expect(out).toContain("- test: bun test")
  })

  test("tells the model to list when no task is defined", () => {
    const out = renderTaskCatalog({})
    expect(out).toContain("No tasks are defined yet")
    expect(out).not.toContain("Defined tasks")
  })
})
