#!/usr/bin/env bun
// Fork npm publisher.
// Publishes the per-platform binary packages (dist/opencode-*/) under the
// @lux-tech scope and the @lux-tech/opencode-ai meta package that resolves the
// right binary via postinstall.mjs. Only folders that actually contain a
// binary are published (a local Windows build only produces windows-x64).
import { $ } from "bun"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const version = process.env.OPENCODE_VERSION || (await Bun.file("./package.json").json()).version
if (!version) throw new Error("OPENCODE_VERSION is required")
const scope = "@lux-tech/opencode-ai"
const dryRun = process.argv.includes("--dry-run")
const fakeExe = [
  `echo "Error: ${scope}'s postinstall script was not run." >&2`,
  'echo "This occurs when using --ignore-scripts during installation, or when using a" >&2',
  'echo "package manager like pnpm that does not run postinstall scripts by default." >&2',
  `echo "To fix this, run: cd node_modules/${scope} && node postinstall.mjs" >&2`,
  "exit 1",
].join("\n")

const optionalDependencies: Record<string, string> = {}

for (const rawPath of new Bun.Glob("opencode-*/package.json").scanSync({ cwd: "./dist" })) {
  const pkgPath = rawPath.replaceAll("\\", "/")
  const folder = pkgPath.replace(/\/package\.json$/, "")
  if (folder === "opencode") continue // meta package, handled at the end
  const pkgFile = Bun.file(`./dist/${pkgPath}`)
  if (!(await pkgFile.exists())) continue // folder exists but package.json does not

  const binExists =
    (await Bun.file(`./dist/${folder}/bin/opencode`).exists()) ||
    (await Bun.file(`./dist/${folder}/bin/opencode.exe`).exists())
  if (!binExists) {
    console.log(`skip ${folder}: no binary`)
    continue
  }

  const name = `${scope}-${folder.replace(/^opencode-/, "")}`
  const pkg = await pkgFile.json()
  pkg.name = name
  pkg.version = version
  await Bun.file(`./dist/${pkgPath}`).write(JSON.stringify(pkg, null, 2) + "\n")
  optionalDependencies[name] = version

  await $`rm -f *.tgz`.cwd(`./dist/${folder}`).nothrow()
  await $`bun pm pack`.cwd(`./dist/${folder}`)
  const tgz = [...new Bun.Glob("*.tgz").scanSync({ cwd: `./dist/${folder}` })][0]
  if (!tgz) throw new Error(`pack failed for ${folder}`)
  if (dryRun) {
    console.log(`[dry-run] publish ${name}@${version} (${tgz})`)
    continue
  }
  await $`npm publish ${tgz} --access public --tag latest`.cwd(`./dist/${folder}`)
  console.log(`published ${name}@${version}`)
}

// Meta package
const meta = "./dist/opencode"
await $`mkdir -p ${meta}/bin`.cwd(".")
await $`cp ./script/postinstall.mjs ./dist/opencode/postinstall.mjs`
await $`cp ../../LICENSE ./dist/opencode/LICENSE`
// The root README is the fork README; shipping it is what makes the npm package
// page render (npm derives readmeFilename from the README inside the tarball).
await $`cp ../../README.md ./dist/opencode/README.md`
await Bun.file(`./dist/opencode/bin/opencode.exe`).write(fakeExe)
await Bun.file(`./dist/opencode/package.json`).write(
  JSON.stringify(
    {
      name: scope,
      version,
      description:
        "opencodev2 — AI-powered development tool. Community fork of opencode (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt); installs the opencodev2 CLI alongside the official opencode.",
      // The fork installs its command as `opencodev2` so it can coexist with
      // the upstream `opencode` binary from the `opencode-ai` package.
      bin: { opencodev2: "./bin/opencode.exe" },
      scripts: { postinstall: "node ./postinstall.mjs" },
      keywords: ["opencode", "opencodev2", "ai", "coding-agent", "cli", "agent", "llm", "fork"],
      license: "MIT",
      homepage: "https://github.com/menoxz/opencode",
      repository: { type: "git", url: "https://github.com/menoxz/opencode.git" },
      bugs: { url: "https://github.com/menoxz/opencode/issues" },
      files: ["bin", "postinstall.mjs", "LICENSE", "README.md"],
      engines: { node: ">=18" },
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies,
    },
    null,
    2,
  ) + "\n",
)

await $`rm -f *.tgz`.cwd(meta).nothrow()
await $`bun pm pack`.cwd(meta)
const metaTgz = [...new Bun.Glob("*.tgz").scanSync({ cwd: meta })][0]
if (!metaTgz) throw new Error("pack failed for meta package")
if (dryRun) {
  console.log(`[dry-run] publish ${scope}@${version} (${metaTgz})`)
} else {
  await $`npm publish ${metaTgz} --access public --tag latest`.cwd(meta)
  console.log(`published ${scope}@${version}`)
}
