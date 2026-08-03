<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="OpenCode fork logo">
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

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installation (fork)

The fork is published on npm under the scope `@lux-tech` and installs its command as
**`opencodev2`** — a distinct binary that **coexists** with the official `opencode`
(installed from `opencode-ai`). It also keeps its own data/config directories
(`~/.local/share/opencodev2`, `~/.config/opencodev2`), so both products can run side
by side without touching each other's data. On the first interactive launch, the fork
offers to import your existing opencode configuration, API keys and session history —
the original installation is left untouched. See
[coexistence with the official opencode](#coexistence-with-the-official-opencode).

### Recommended: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verify:

```bash
opencodev2 --version
# 1.18.59 (or the latest published version)
```

The meta-package `@lux-tech/opencode-ai` automatically downloads the correct platform
binary from one of its 12 optional dependencies (see the
[platform binaries table](#platform-binaries)) and exposes it as the `opencodev2` command.

### Alternative: GitHub Releases (manual)

Release archives are published on
[the releases page](https://github.com/menoxz/opencode/releases) as `.tar.gz` (Linux)
and `.zip` (macOS / Windows). Each archive contains the compiled CLI binary at its
root — rename it to `opencodev2` when installing manually so it never clashes with the
official `opencode` binary.

```bash
# Example: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # distinct name, no clash with the official binary
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Binary location

| Install method | Binary path |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (manual) | wherever you placed it |

### Update

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencodev2 upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### Uninstall

```bash
npm uninstall -g @lux-tech/opencode-ai
```

On Windows, also remove the stale shim if npm left one behind:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistence with the official opencode

The fork (`@lux-tech/opencode-ai`) installs its command as **`opencodev2`**, while the
official opencode (`opencode-ai`) installs `opencode`. The two names never clash, and
the fork uses its own data directories
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), so **both can be installed and used at the same time**.

### First-run migration wizard

On the first interactive launch, `opencodev2` detects whether a previous opencode
installation exists (config, API keys, sessions) and asks what to do:

- **Import (recommended)** — copies your config, credentials (`auth.json`) and session
  history (`opencode.db`) from the original opencode directories into the opencodev2
  directories. The original data is left untouched.
- **Later** — starts fresh and asks again at the next launch.
- **Never** — starts with empty opencodev2 data (a marker file prevents further prompts).

Headless environments (CI, scripts) can force the behaviour:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # import non-interactively
OPENCODEV2_MIGRATE=skip opencodev2 ...   # skip and mark as decided
```

The wizard runs only once per data directory (a `.migrate-state` marker records the
decision). After an import, the copied database belongs to opencodev2 — subsequent
opencodev2 database migrations never touch the original opencode installation.

### Which one should you use?

| Need | Use |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **This fork** (`opencodev2`) |
| The official, widely-validated release | [official opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Both stay up to date independently:

```bash
opencodev2 upgrade        # updates the fork (@lux-tech/opencode-ai)
opencode upgrade          # updates the official opencode (opencode-ai)
```

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
| **opencodev2 identity + migration** | Installs as `opencodev2` with its own data directories, so it coexists with the official opencode; a first-run wizard imports your config, API keys and session history on request |

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
