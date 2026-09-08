import { describe, test, expect } from "bun:test"
import { Effect, Layer, FileSystem, Exit } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { testEffect } from "../lib/effect"
import path from "path"

const layer = AppFileSystem.layer.pipe(Layer.provideMerge(NodeFileSystem.layer))
const { effect: it, live } = testEffect(layer)

describe("AppFileSystem", () => {
  describe("isDir", () => {
    it(
      "returns true for directories",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        expect(yield* fs.isDir(tmp)).toBe(true)
      }),
    )

    it(
      "returns false for files",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "test.txt")
        yield* filesys.writeFileString(file, "hello")
        expect(yield* fs.isDir(file)).toBe(false)
      }),
    )

    it(
      "returns false for non-existent paths",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        expect(yield* fs.isDir("/tmp/nonexistent-" + Math.random())).toBe(false)
      }),
    )
  })

  describe("isFile", () => {
    it(
      "returns true for files",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "test.txt")
        yield* filesys.writeFileString(file, "hello")
        expect(yield* fs.isFile(file)).toBe(true)
      }),
    )

    it(
      "returns false for directories",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        expect(yield* fs.isFile(tmp)).toBe(false)
      }),
    )
  })

  describe("readFileStringSafe", () => {
    it(
      "returns file contents when file exists",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "exists.txt")
        yield* filesys.writeFileString(file, "hello")

        const result = yield* fs.readFileStringSafe(file)
        expect(result).toBe("hello")
      }),
    )

    it(
      "returns undefined for missing file (NotFound)",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()

        const result = yield* fs.readFileStringSafe(path.join(tmp, "does-not-exist.txt"))
        expect(result).toBeUndefined()
      }),
    )
  })

  describe("readJson / writeJson", () => {
    it(
      "round-trips JSON data",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "data.json")
        const data = { name: "test", count: 42, nested: { ok: true } }

        yield* fs.writeJson(file, data)
        const result = yield* fs.readJson(file)

        expect(result).toEqual(data)
      }),
    )
  })

  describe("ensureDir", () => {
    it(
      "creates nested directories",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const nested = path.join(tmp, "a", "b", "c")

        yield* fs.ensureDir(nested)

        const info = yield* filesys.stat(nested)
        expect(info.type).toBe("Directory")
      }),
    )

    it(
      "is idempotent",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const dir = path.join(tmp, "existing")
        yield* filesys.makeDirectory(dir)

        yield* fs.ensureDir(dir)

        const info = yield* filesys.stat(dir)
        expect(info.type).toBe("Directory")
      }),
    )
  })

  describe("writeWithDirs", () => {
    for (const content of ["", new Uint8Array()]) {
      live(
        `creates and truncates empty ${typeof content} content`,
        Effect.gen(function* () {
          const fs = yield* AppFileSystem.Service
          const filesys = yield* FileSystem.FileSystem
          const tmp = yield* filesys.makeTempDirectoryScoped()
          const file = path.join(tmp, "nested", "empty")
          yield* fs.writeWithDirs(file, content)
          expect(yield* filesys.readFileString(file)).toBe("")
          yield* fs.writeWithDirs(file, "previous content")
          yield* fs.writeWithDirs(file, content)
          expect(yield* filesys.readFileString(file)).toBe("")
        }),
      )
    }
    const posix = process.platform === "win32" ? live.skip : live
    const windows = process.platform === "win32" ? live : live.skip

    for (const content of ["replacement", new Uint8Array([1, 2, 3])]) {
      posix(
        `preserves existing 0600 permissions and ownership (${typeof content})`,
        Effect.gen(function* () {
          const fs = yield* AppFileSystem.Service
          const filesys = yield* FileSystem.FileSystem
          const tmp = yield* filesys.makeTempDirectoryScoped()
          const file = path.join(tmp, "secret")
          yield* filesys.writeFileString(file, "old", { mode: 0o600 })
          const before = yield* filesys.stat(file)
          yield* fs.writeWithDirs(file, content)
          const after = yield* filesys.stat(file)
          expect(after.mode & 0o777).toBe(0o600)
          expect(after.uid).toEqual(before.uid)
          expect(after.gid).toEqual(before.gid)
          expect(after.ino).toEqual(before.ino)
          expect(yield* filesys.readFile(file)).toEqual(
            typeof content === "string" ? new TextEncoder().encode(content) : content,
          )
          expect(yield* filesys.readDirectory(tmp)).toEqual(["secret"])
        }),
      )
    }

    posix(
      "preserves existing modes even when a different creation mode is requested",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "secret")
        yield* filesys.writeFileString(file, "old")
        yield* filesys.chmod(file, 0o640)
        yield* fs.writeWithDirs(file, "same")
        expect((yield* filesys.stat(file)).mode & 0o777).toBe(0o640)
        yield* fs.writeWithDirs(file, "not wider", 0o666)
        expect((yield* filesys.stat(file)).mode & 0o777).toBe(0o640)
        yield* fs.writeWithDirs(file, "narrower", 0o600)
        expect((yield* filesys.stat(file)).mode & 0o777).toBe(0o640)
        yield* fs.writeWithDirs(file, "none", 0)
        expect((yield* filesys.stat(file)).mode & 0o777).toBe(0o640)
      }),
    )

    posix(
      "creates owner-only files by default and honors explicit creation modes",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        for (const mode of [undefined, 0, 0o640]) {
          const file = path.join(tmp, String(mode), "secret")
          yield* fs.writeWithDirs(file, "new", mode)
          expect((yield* filesys.stat(file)).mode & 0o777).toBe(mode ?? 0o600)
        }
      }),
    )

    windows(
      "keeps a read-only Windows destination intact without changing protections",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "readonly.txt")
        yield* filesys.writeFileString(file, "old")
        yield* filesys.chmod(file, 0o444)
        yield* Effect.addFinalizer(() => filesys.chmod(file, 0o666).pipe(Effect.ignore))
        const result = yield* fs.writeWithDirs(file, "new").pipe(Effect.exit)
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* filesys.readFileString(file)).toBe("old")
        expect(yield* filesys.readDirectory(tmp)).toEqual(["readonly.txt"])
      }),
    )

    live(
      "leaves a nonempty directory destination intact without temporary files",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const target = path.join(tmp, "target")
        yield* filesys.makeDirectory(target)
        yield* filesys.writeFileString(path.join(target, "child"), "old")
        expect(Exit.isFailure(yield* fs.writeWithDirs(target, "new").pipe(Effect.exit))).toBe(true)
        expect(yield* filesys.readFileString(path.join(target, "child"))).toBe("old")
        expect(yield* filesys.readDirectory(tmp)).toEqual(["target"])
      }),
    )

    posix(
      "updates hard links and symlink targets without replacing their inodes",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const target = path.join(tmp, "target")
        const hard = path.join(tmp, "hard")
        const symbolic = path.join(tmp, "symbolic")
        yield* filesys.writeFileString(target, "long original content", { mode: 0o600 })
        yield* filesys.link(target, hard)
        yield* filesys.symlink(target, symbolic)
        const before = yield* filesys.stat(target)
        yield* fs.writeWithDirs(hard, "short", 0o777)
        expect(yield* filesys.readFileString(target)).toBe("short")
        yield* fs.writeWithDirs(symbolic, "last", 0o777)
        expect(yield* filesys.readLink(symbolic)).toBe(target)
        expect(yield* filesys.readFileString(hard)).toBe("last")
        const after = yield* filesys.stat(target)
        expect(after.ino).toEqual(before.ino)
        expect(after.mode & 0o777).toBe(0o600)
        expect(after.uid).toEqual(before.uid)
        expect(after.gid).toEqual(before.gid)
      }),
    )
    ;(process.platform === "linux" && Bun.which("setfacl") && Bun.which("getfacl") ? live : live.skip)(
      "preserves an extended POSIX ACL through an existing-file update",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const target = path.join(tmp, "secret")
        yield* filesys.writeFileString(target, "old", { mode: 0o600 })
        expect(Bun.spawnSync(["setfacl", "-m", "u:12345:r--", target]).exitCode).toBe(0)
        const before = Bun.spawnSync(["getfacl", "-cpn", target])
        expect(before.exitCode).toBe(0)
        expect(before.stdout.toString()).toContain("user:12345:r--")
        yield* fs.writeWithDirs(target, "new", 0o777)
        const after = Bun.spawnSync(["getfacl", "-cpn", target])
        expect(after.exitCode).toBe(0)
        expect(after.stdout.toString()).toBe(before.stdout.toString())
        expect(yield* filesys.readFileString(target)).toBe("new")
      }),
    )

    it(
      "creates parent directories if missing",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "deep", "nested", "file.txt")

        yield* fs.writeWithDirs(file, "hello")

        expect(yield* filesys.readFileString(file)).toBe("hello")
      }),
    )

    it(
      "writes directly when parent exists",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "direct.txt")

        yield* fs.writeWithDirs(file, "world")

        expect(yield* filesys.readFileString(file)).toBe("world")
      }),
    )

    it(
      "writes Uint8Array content",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "binary.bin")
        const content = new Uint8Array([0x00, 0x01, 0x02, 0x03])

        yield* fs.writeWithDirs(file, content)

        const result = yield* filesys.readFile(file)
        expect(new Uint8Array(result)).toEqual(content)
      }),
    )

    // Existing-file updates preserve protections, not crash atomicity.
    it(
      "updates existing content without leaving temp files",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "session.json")

        yield* fs.writeWithDirs(file, JSON.stringify({ v: 1 }))
        yield* fs.writeWithDirs(file, JSON.stringify({ v: 2 }))

        expect(JSON.parse(yield* filesys.readFileString(file))).toEqual({ v: 2 })
        const leftovers = (yield* filesys.readDirectory(tmp)).filter((name) => name.endsWith(".tmp"))
        expect(leftovers).toEqual([])
      }),
    )

    live(
      "handles concurrent exclusive creation of the same target without temp files",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "auth.json")

        yield* Effect.all(
          Array.from({ length: 8 }, () => fs.writeWithDirs(file, "same content")),
          { concurrency: "unbounded" },
        )

        expect(yield* filesys.readFileString(file)).toBe("same content")
        const leftovers = (yield* filesys.readDirectory(tmp)).filter((name) => name.endsWith(".tmp"))
        expect(leftovers).toEqual([])
      }),
    )
  })

  describe("contains / overlaps", () => {
    test("nested child is contained", () => {
      const root = path.resolve("proj")
      expect(AppFileSystem.contains(root, path.join(root, "src", "a.ts"))).toBe(true)
      expect(AppFileSystem.contains(root, root)).toBe(true)
    })

    test("parent traversal is not contained", () => {
      const root = path.resolve("proj")
      expect(AppFileSystem.contains(root, path.resolve("proj", "..", "other"))).toBe(false)
    })

    test("a child whose name merely starts with '..' is contained", () => {
      const root = path.resolve("proj")
      expect(AppFileSystem.contains(root, path.join(root, "..cache", "x"))).toBe(true)
      expect(AppFileSystem.contains(root, path.join(root, "..gitkeep"))).toBe(true)
    })

    // On Windows `path.relative` returns an ABSOLUTE path (not `..`) when the
    // two paths live on different drives or UNC shares. Treating that as
    // "inside" silently skipped the external_directory permission prompt.
    test.if(process.platform === "win32")("another drive or UNC share is never contained", () => {
      expect(AppFileSystem.contains("C:\\proj", "D:\\secret\\id_rsa")).toBe(false)
      expect(AppFileSystem.contains("C:\\proj", "\\\\nas\\share\\x")).toBe(false)
      expect(AppFileSystem.overlaps("C:\\proj", "D:\\proj")).toBe(false)
    })
  })

  describe("findUp", () => {
    it(
      "finds target in start directory",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "target.txt"), "found")

        const result = yield* fs.findUp("target.txt", tmp)
        expect(result).toEqual([path.join(tmp, "target.txt")])
      }),
    )

    it(
      "finds target in parent directories",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "marker"), "root")
        const child = path.join(tmp, "a", "b")
        yield* filesys.makeDirectory(child, { recursive: true })

        const result = yield* fs.findUp("marker", child, tmp)
        expect(result).toEqual([path.join(tmp, "marker")])
      }),
    )

    it(
      "returns empty array when not found",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const result = yield* fs.findUp("nonexistent", tmp, tmp)
        expect(result).toEqual([])
      }),
    )
  })

  describe("up", () => {
    it(
      "finds multiple targets walking up",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "a.txt"), "a")
        yield* filesys.writeFileString(path.join(tmp, "b.txt"), "b")
        const child = path.join(tmp, "sub")
        yield* filesys.makeDirectory(child)
        yield* filesys.writeFileString(path.join(child, "a.txt"), "a-child")

        const result = yield* fs.up({ targets: ["a.txt", "b.txt"], start: child, stop: tmp })

        expect(result).toContain(path.join(child, "a.txt"))
        expect(result).toContain(path.join(tmp, "a.txt"))
        expect(result).toContain(path.join(tmp, "b.txt"))
      }),
    )
  })

  describe("glob", () => {
    it(
      "finds files matching pattern",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "a.ts"), "a")
        yield* filesys.writeFileString(path.join(tmp, "b.ts"), "b")
        yield* filesys.writeFileString(path.join(tmp, "c.json"), "c")

        const result = yield* fs.glob("*.ts", { cwd: tmp })
        expect(result.sort()).toEqual(["a.ts", "b.ts"])
      }),
    )

    it(
      "supports absolute paths",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "file.txt"), "hello")

        const result = yield* fs.glob("*.txt", { cwd: tmp, absolute: true })
        expect(result).toEqual([path.join(tmp, "file.txt")])
      }),
    )
  })

  describe("globMatch", () => {
    it(
      "matches patterns",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        expect(fs.globMatch("*.ts", "foo.ts")).toBe(true)
        expect(fs.globMatch("*.ts", "foo.json")).toBe(false)
        expect(fs.globMatch("src/**", "src/a/b.ts")).toBe(true)
      }),
    )
  })

  describe("globUp", () => {
    it(
      "finds files walking up directories",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        yield* filesys.writeFileString(path.join(tmp, "root.md"), "root")
        const child = path.join(tmp, "a", "b")
        yield* filesys.makeDirectory(child, { recursive: true })
        yield* filesys.writeFileString(path.join(child, "leaf.md"), "leaf")

        const result = yield* fs.globUp("*.md", child, tmp)
        expect(result).toContain(path.join(child, "leaf.md"))
        expect(result).toContain(path.join(tmp, "root.md"))
      }),
    )
  })

  describe("built-in passthrough", () => {
    it(
      "exists works",
      Effect.gen(function* () {
        yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "exists.txt")
        yield* filesys.writeFileString(file, "yes")

        expect(yield* filesys.exists(file)).toBe(true)
        expect(yield* filesys.exists(file + ".nope")).toBe(false)
      }),
    )

    it(
      "remove works",
      Effect.gen(function* () {
        yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "delete-me.txt")
        yield* filesys.writeFileString(file, "bye")

        yield* filesys.remove(file)

        expect(yield* filesys.exists(file)).toBe(false)
      }),
    )
  })

  describe("pure helpers", () => {
    test("mimeType returns correct types", () => {
      expect(AppFileSystem.mimeType("file.json")).toBe("application/json")
      expect(AppFileSystem.mimeType("image.png")).toBe("image/png")
      expect(AppFileSystem.mimeType("unknown.qzx")).toBe("application/octet-stream")
    })

    test("contains checks path containment", () => {
      expect(AppFileSystem.contains("/a/b", "/a/b/c")).toBe(true)
      expect(AppFileSystem.contains("/a/b", "/a/c")).toBe(false)
    })

    test("overlaps detects overlapping paths", () => {
      expect(AppFileSystem.overlaps("/a/b", "/a/b/c")).toBe(true)
      expect(AppFileSystem.overlaps("/a/b/c", "/a/b")).toBe(true)
      expect(AppFileSystem.overlaps("/a", "/b")).toBe(false)
    })
  })

  describe("readJson", () => {
    // Regression: JSON.parse threw synchronously, so malformed content became an
    // Effect defect. Defects bypass Effect.orElseSucceed/Effect.option, which is
    // how one corrupted auth.json brought down the entire server bootstrap.
    it(
      "fails recoverably on malformed json instead of dying",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "auth.json")
        yield* filesys.writeFileString(file, "   ")

        const recovered = yield* fs.readJson(file).pipe(Effect.orElseSucceed(() => ({ fallback: true })))
        expect(recovered).toEqual({ fallback: true })
      }),
    )

    it(
      "still reads valid json",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "data.json")
        yield* filesys.writeFileString(file, '{"token":"abc"}')
        expect(yield* fs.readJson(file)).toEqual({ token: "abc" })
      }),
    )
  })

  describe("writeJson", () => {
    it(
      "round-trips and leaves no temp file behind",
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const filesys = yield* FileSystem.FileSystem
        const tmp = yield* filesys.makeTempDirectoryScoped()
        const file = path.join(tmp, "auth.json")

        yield* fs.writeJson(file, { token: "one" })
        yield* fs.writeJson(file, { token: "two" })

        expect(yield* fs.readJson(file)).toEqual({ token: "two" })
        const entries = yield* filesys.readDirectory(tmp)
        expect(entries.filter((entry) => entry.endsWith(".tmp"))).toEqual([])
      }),
    )
  })
})
