<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode 分叉版徽标">
    </picture>
  </a>
</p>
<p align="center">开源的 AI 编程智能体 —— 社区分叉版。

> **分叉说明** —— 本仓库（`menoxz/opencode`）是[官方 opencode](https://github.com/anomalyco/opencode)的
> 社区分叉版，包含附加功能（MCP auto-reconnect、hot reload、eval pipeline、memory consolidation、unified prompt）。
> 与官方 opencode 团队**没有任何关联**。
> **查看分叉差异 →**</p>
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

[![OpenCode 终端界面](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## 安装（分叉版）

该分叉版以 `@lux-tech` 作用域发布在 npm 上，安装的二进制文件名为 `opencode`，与官方包完全一致。这意味着两者同时全局安装时，分叉版会**取代**官方 opencode —— 安装前请阅读**与官方 opencode 共存**。

### 推荐：npm

```bash
npm install -g @lux-tech/opencode-ai
```

验证：

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

元包 `@lux-tech/opencode-ai` 会自动从其 12 个可选依赖项之一下载对应平台的二进制文件（参见**各平台二进制文件表**），并将其作为 `opencode` 二进制文件提供。

### 备选方案：GitHub Releases（手动）

发布压缩包发布在[发布页面](https://github.com/menoxz/opencode/releases)上，格式为 `.tar.gz`（Linux）和 `.zip`（macOS / Windows）。每个压缩包的根目录都包含 `opencode`（或 `opencode.exe`）二进制文件。

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

### 二进制文件位置

| 安装方式 | 二进制文件路径 |
|---|---|
| npm（Windows） | `%APPDATA%\npm\opencode.exe` |
| npm（Linux / macOS） | `$(npm prefix -g)/bin/opencode` |
| GitHub 发布（手动） | 你放置它的任意位置 |

### 更新

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### 卸载

```bash
npm uninstall -g @lux-tech/opencode-ai
```

在 Windows 上，还需删除 npm 遗留的过期 shim：

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## 与官方 opencode 共存

**分叉版（`@lux-tech/opencode-ai`）和官方 opencode（`opencode-ai`）安装的二进制文件都叫 `opencode`。** 在全局安装其中一个会静默替换之前的二进制文件。你无法同时让两者都作为全局 `opencode` 存在。

### 应该用哪个？

| 需求 | 使用 |
|---|---|
| 支持自动重连的 MCP 服务器、hot reload、eval pipeline、memory consolidation、unified prompt | **本分叉版**（`@lux-tech/opencode-ai`） |
| 官方、经过广泛验证的版本 | [官方 opencode](https://github.com/anomalyco/opencode)（`opencode-ai`） |

### 方案 A —— 一个全局安装 + 另一个用 `npx`（推荐）

将分叉版全局安装，并按需运行官方 opencode（无需全局安装）：

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

或者反过来 —— 保持官方 opencode 为全局，并按需运行分叉版：

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### 方案 B —— 两者都安装，其中一个重命名

两者都安装，然后重命名次要二进制文件，使两个命令不冲突：

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

然后在 Windows 上将分叉版二进制文件重命名为 `opencode-fork.exe`：

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

Linux / macOS 上：

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### 检查当前生效的二进制文件

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> 内置更新器（`opencode upgrade`）始终获取 `@lux-tech/opencode-ai`。
> 如果你希望**官方** opencode 自动更新，请通过 `npx opencode-ai@latest` 或官方安装程序
> 运行它（参见 [opencode.ai](https://opencode.ai)）。

---

## 各平台二进制文件

`@lux-tech/opencode-ai` 以元包形式发布，包含 12 个平台二进制文件（全部以相同版本发布）：

| 包 | 平台 / CPU | 备注 |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | 不支持 AVX2 的 CPU |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | 不支持 AVX2 的 CPU |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl，不支持 AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | 不支持 AVX2 的 CPU |

---

## 智能体

OpenCode 内置两个智能体，可通过 `Tab` 键切换。

- **build** - 默认，拥有完整权限的开发智能体
- **plan** - 用于分析和代码探索的只读智能体
  - 默认拒绝文件编辑
  - 运行 bash 命令前会请求许可
  - 适合探索陌生代码库或规划变更

此外还包含一个 **general** 子智能体，用于复杂搜索和多步任务。它在内部使用，可在消息中输入 `@general` 调用。

分叉版还附带了 **planner** 智能体，会在执行前自动分解任务。了解更多关于[官方文档中的智能体](https://opencode.ai/docs/agents) —— 行为与上游兼容。

---

## 文档

- **分叉版专属文档** 位于本仓库：[`docs/`](./docs)（架构、ADR、hot reload 与 MCP 设计）和 [`CHANGELOG.md`](./CHANGELOG.md)。
- **通用配置文档** 与官方文档兼容：[opencode.ai/docs](https://opencode.ai/docs)。

---

## 分叉版本差异

本分叉版（`menoxz/opencode`）在上游基础上增加了以下功能：

| 功能 | 说明 |
|---|---|
| **MCP Auto-reconnect** | 检测连接断开的 MCP 服务器（传输事件 + 健康检查 ping）并通过指数退避自动重连 —— 不再有过期的“已连接”状态或失效会话 |
| **Hot Reload** | 智能体、插件和 MCP 服务器在文件变更时自动重载 —— 无需重启 |
| **Eval Pipeline** | 基于 SQLite 的评估，支持回归检测、趋势分析和 compare CLI 命令 |
| **Memory Consolidation** | 跨会话记忆，支持自动衰减、模式检测和事后分析 |
| **Unified Prompt** | 单个 `core.txt` 取代 10 个模型专属提示词 —— 更简洁、更小、更易维护 |
| **Continuous Improvement** | 方法即活文档 —— 通过变更日志更新现有技能，而不是创建重复项 |
| **Planner Integration** | 内置 `planner` 智能体在执行前自动分解任务 |

新功能会在 [`CHANGELOG.md`](./CHANGELOG.md) 中进行版本记录。

---

## 参与贡献

如果你有兴趣为本分叉版贡献代码，请在提交拉取请求前阅读[贡献文档](./CONTRIBUTING.md)。拉取请求面向 `dev` 分支。

---

## 基于 OpenCode 进行开发

如果你正在开发与 OpenCode 相关的项目，并在名称中使用了 "opencode"（例如 "opencode-dashboard" 或 "opencode-mobile"），请在 README 中注明该项目并非由 OpenCode 团队构建，且与我们没有任何关联。

---

**报告问题** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**源代码** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
