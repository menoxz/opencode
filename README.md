<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode fork logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent — community fork.

> **Fork notice** — this repository (`menoxz/opencode`) is a community fork of the
> [official opencode](https://github.com/anomalyco/opencode) with additional features
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> It is **not affiliated** with the official opencode team.
> [See fork differences →](#fork-differences)</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="License" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installation (fork)

The fork is published on npm under the scope `@lux-tech` and installs a binary named
`opencode`, exactly like the official package. This means the fork **replaces** the
official opencode when both are installed globally — read
[coexistence with the official opencode](#coexistence-with-the-official-opencode)
before installing.

### Recommended: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verify:

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

The meta-package `@lux-tech/opencode-ai` automatically downloads the correct platform
binary from one of its 12 optional dependencies (see the
[platform binaries table](#platform-binaries)) and exposes it as the `opencode` binary.

### Alternative: GitHub Releases (manual)

Release archives are published on
[the releases page](https://github.com/menoxz/opencode/releases) as `.tar.gz` (Linux)
and `.zip` (macOS / Windows). Each archive contains the `opencode` (or `opencode.exe`)
binary at its root.

```bash
# Example: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # rename to avoid clobbering the official binary
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Binary location

| Install method | Binary path |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (manual) | wherever you placed it |

### Update

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### Uninstall

```bash
npm uninstall -g @lux-tech/opencode-ai
```

On Windows, also remove the stale shim if npm left one behind:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistence with the official opencode

**Both the fork (`@lux-tech/opencode-ai`) and the official opencode (`opencode-ai`)
install a binary named `opencode`.** Installing one globally after the other silently
replaces the previous binary. You cannot keep both as the global `opencode` at the
same time.

### Which one should you use?

| Need | Use |
|---|---|
| MCP servers that auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **This fork** (`@lux-tech/opencode-ai`) |
| The official, widely-validated release | [official opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Option A — one global install + `npx` for the other (recommended)

Install the fork globally and run the official opencode on demand without installing it
globally:

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

Or the reverse — keep the official opencode global and run the fork on demand:

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### Option B — both installed, one renamed

Install both, then rename the secondary binary so the two commands do not clash:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

Then on Windows rename the fork binary to `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

On Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### Check which binary is currently active

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> The built-in updater (`opencode upgrade`) always fetches `@lux-tech/opencode-ai`.
> If you want the **official** opencode to auto-update, run it through
> `npx opencode-ai@latest` or the official installer (see
> [opencode.ai](https://opencode.ai)).

---

## Platform binaries

`@lux-tech/opencode-ai` ships as a meta-package with 12 optional platform binaries
(all published at the same version):

| Package | Platform / CPU | Notes |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPUs without AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPUs without AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, no AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPUs without AVX2 |

---

## Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

The fork additionally ships a **planner** agent that auto-decomposes tasks before
execution. Learn more about
[agents in the official docs](https://opencode.ai/docs/agents) — behavior is
compatible with upstream.

---

## Documentation

- **Fork-specific docs** live in this repository: [`docs/`](./docs) (architecture,
  ADRs, hot reload & MCP design) and [`CHANGELOG.md`](./CHANGELOG.md).
- **General configuration docs** are compatible with the official documentation:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Fork Differences

This fork (`menoxz/opencode`) adds the following features on top of upstream:

| Feature | Description |
|---------|-------------|
| **MCP Auto-reconnect** | MCP servers whose connection dies are detected (transport events + health ping) and reconnected automatically with exponential backoff — no more stale "connected" status or dead sessions |
| **Hot Reload** | Agents, plugins, and MCP servers reload automatically on file change — no restart needed |
| **Eval Pipeline** | SQLite-backed evaluation with regression detection, trend analysis, and compare CLI commands |
| **Memory Consolidation** | Cross-session memory with auto-decay, pattern detection, and post-mortem analysis |
| **Unified Prompt** | Single `core.txt` replaces 10 model-specific prompts — cleaner, smaller, easier to maintain |
| **Continuous Improvement** | Methods are living documents — update existing skills with changelog instead of creating duplicates |
| **Planner Integration** | Built-in `planner` agent auto-decomposes tasks before execution |

New features are versioned in [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contributing

If you're interested in contributing to this fork, please read our
[contributing docs](./CONTRIBUTING.md) before submitting a pull request.
Pull requests target the `dev` branch.

---

## Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as
part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a
note to your README to clarify that it is not built by the OpenCode team and is not
affiliated with us in any way.

---

**Report issues** on [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Source** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
