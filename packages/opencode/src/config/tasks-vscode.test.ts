import { describe, expect, test } from "bun:test"
import { ConfigTasks } from "./tasks"

describe("ConfigTasks.fromVscode dependsOn", () => {
  test("carries a string dependsOn list across", () => {
    const map = ConfigTasks.fromVscode({
      version: "2.0.0",
      tasks: [
        { label: "seed", command: "seed.sh" },
        { label: "app", command: "app.sh", dependsOn: ["seed"] },
      ],
    })
    expect(map.app?.dependsOn).toEqual(["seed"])
  })

  test("carries the { label } form VSCode also accepts", () => {
    const map = ConfigTasks.fromVscode({
      tasks: [
        { label: "seed", command: "seed.sh" },
        { label: "app", command: "app.sh", dependsOn: [{ label: "seed" }] },
      ],
    })
    expect(map.app?.dependsOn).toEqual(["seed"])
  })

  test("drops entries with no usable label instead of producing undefined names", () => {
    const map = ConfigTasks.fromVscode({ tasks: [{ label: "app", command: "app.sh", dependsOn: [{}, "seed"] }] })
    expect(map.app?.dependsOn).toEqual(["seed"])
  })

  test("omits dependsOn when it is not declared, and joins args into the command", () => {
    const map = ConfigTasks.fromVscode({ tasks: [{ label: "app", command: "bun", args: ["test", "x"] }] })
    expect(map.app?.command).toBe("bun test x")
    expect(map.app?.dependsOn).toBeUndefined()
  })

  test("skips an entry without a command", () => {
    const map = ConfigTasks.fromVscode({ tasks: [{ label: "noop" }] })
    expect(map.noop).toBeUndefined()
  })
})
