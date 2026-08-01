<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode 分叉版標誌">
    </picture>
  </a>
</p>
<p align="center">開源的 AI 程式碼智慧體 —— 社群分叉版。

> **分叉說明** —— 本倉庫（`menoxz/opencode`）是[官方 opencode](https://github.com/anomalyco/opencode)的
> 社群分叉版，包含附加功能（MCP auto-reconnect、hot reload、eval pipeline、memory consolidation、unified prompt）。
> 與官方 opencode 團隊**沒有任何關聯**。
> **查看分叉差異 →**</p>
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

[![OpenCode 終端介面](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## 安裝（分叉版）

該分叉版以 `@lux-tech` 範圍發佈在 npm 上，將指令安裝為 **`opencodev2`** —— 一個獨立的二進位檔，與官方 `opencode`（由 `opencode-ai` 安裝）**共存**。它還使用自己獨立的資料/設定目錄（`~/.local/share/opencodev2`、`~/.config/opencodev2`），因此兩個產品可以並排執行而互不干擾。首次互動式啟動時，分叉版會提議匯入您現有的 opencode 設定、API 金鑰和對話記錄 —— 原始安裝保持原樣。參見**與官方 opencode 共存**。

### 建議：npm

```bash
npm install -g @lux-tech/opencode-ai
```

驗證：

```bash
opencodev2 --version
# 1.18.59 (or the latest published version)
```

中繼套件 `@lux-tech/opencode-ai` 會自動從其 12 個選用相依套件之一下載對應平台的二進位檔（參見**各平台二進位檔表**），並將其作為 `opencodev2` 指令提供。

### 替代方案：GitHub Releases（手動）

發佈壓縮檔發佈在[發佈頁面](https://github.com/menoxz/opencode/releases)上，格式為 `.tar.gz`（Linux）和 `.zip`（macOS / Windows）。每個壓縮檔的根目錄都包含編譯後的 CLI 二進位檔 —— 手動安裝時請將其重新命名為 `opencodev2`，以免與官方 `opencode` 二進位檔衝突。

```bash
# Example: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # 獨立名稱，不與官方二進位檔衝突
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### 二進位檔位置

| 安裝方式 | 二進位檔路徑 |
|---|---|
| npm（Windows） | `%APPDATA%\npm\opencodev2.exe` |
| npm（Linux / macOS） | `$(npm prefix -g)/bin/opencodev2` |
| GitHub 發佈（手動） | 您放置它的任意位置 |

### 更新

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencodev2 upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### 解除安裝

```bash
npm uninstall -g @lux-tech/opencode-ai
```

在 Windows 上，還需刪除 npm 遺留的過期 shim：

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## 與官方 opencode 共存

分叉版（`@lux-tech/opencode-ai`）將指令安裝為 **`opencodev2`**，而官方 opencode（`opencode-ai`）安裝的是 `opencode`。兩者名稱永遠不會衝突，並且分叉版使用自己獨立的資料目錄（`~/.local/share/opencodev2`、`~/.config/opencodev2`、`~/.local/state/opencodev2`、`~/.cache/opencodev2`），因此**可以同時安裝和使用**。

### 首次執行的遷移精靈

首次互動式啟動時，`opencodev2` 會偵測是否存在之前的 opencode 安裝（設定、API 金鑰、對話），並詢問您要做什麼：

- **匯入（建議）** —— 將設定、憑證（`auth.json`）和對話記錄（`opencode.db`）從原始 opencode 目錄複製到 opencodev2 目錄。原始資料保持原樣。
- **稍後** —— 以全新資料啟動，並在下次啟動時再次詢問。
- **永不** —— 以空的 opencodev2 資料啟動（標記檔案會阻止後續提示）。

無頭環境（CI、指令碼）可以強制指定行為：

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # 非互動式匯入
OPENCODEV2_MIGRATE=skip opencodev2 ...   # 跳過並標記為已決定
```

該精靈每個資料目錄只執行一次（`.migrate-state` 標記檔案會記錄決定）。匯入後，複製的資料庫歸 opencodev2 所有 —— 之後 opencodev2 的資料庫遷移永遠不會觸碰原始 opencode 安裝。

### 應該使用哪一個？

| 需求 | 使用 |
|---|---|
| MCP 自動重連、hot reload、eval pipeline、memory consolidation、unified prompt | **本分叉版**（`opencodev2`） |
| 官方、經過廣泛驗證的版本 | [官方 opencode](https://github.com/anomalyco/opencode)（`opencode`） |

兩者各自獨立保持最新：

```bash
opencodev2 upgrade        # 更新分叉版（@lux-tech/opencode-ai）
opencode upgrade          # 更新官方 opencode（opencode-ai）
```

---

## 各平台二進位檔

`@lux-tech/opencode-ai` 以中繼套件形式發佈，包含 12 個平台二進位檔（全部以相同版本發佈）：

| 套件 | 平台 / CPU | 備註 |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | 不支援 AVX2 的 CPU |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | 不支援 AVX2 的 CPU |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl，不支援 AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | 不支援 AVX2 的 CPU |

---

## 智慧體

OpenCode 內建兩個智慧體，可使用 `Tab` 鍵切換。

- **build** - 預設，具備完整權限的開發智慧體
- **plan** - 用於分析和程式碼探索的唯讀智慧體
  - 預設拒絕檔案編輯
  - 執行 bash 指令前會請求許可
  - 適合探索陌生的程式碼庫或規劃變更

此外還包含一個 **general** 子智慧體，用於複雜搜尋和多步驟任務。它在內部使用，可在訊息中輸入 `@general` 呼叫。

分叉版還附帶了 **planner** 智慧體，會在執行前自動分解任務。了解更多關於[官方文件中的智慧體](https://opencode.ai/docs/agents) —— 行為與上游相容。

---

## 文件

- **分叉版專屬文件** 位於本倉庫：[`docs/`](./docs)（架構、ADR、hot reload 與 MCP 設計）和 [`CHANGELOG.md`](./CHANGELOG.md)。
- **通用設定文件** 與官方文件相容：[opencode.ai/docs](https://opencode.ai/docs)。

---

## 分叉版本差異

本分叉版（`menoxz/opencode`）在上游基礎上增加了以下功能：

| 功能 | 說明 |
|---|---|
| **MCP Auto-reconnect** | 偵測連線中斷的 MCP 伺服器（傳輸事件 + 健康檢查 ping）並透過指數退避自動重連 —— 不再有過期的「已連線」狀態或失效工作階段 |
| **Hot Reload** | 智慧體、外掛程式和 MCP 伺服器在檔案變更時自動重新載入 —— 無需重新啟動 |
| **Eval Pipeline** | 基於 SQLite 的評估，支援迴歸偵測、趨勢分析和 compare CLI 指令 |
| **Memory Consolidation** | 跨工作階段記憶，支援自動衰減、模式偵測和事後分析 |
| **Unified Prompt** | 單一 `core.txt` 取代 10 個模型專屬提示詞 —— 更簡潔、更小、更易維護 |
| **Continuous Improvement** | 方法即活文件 —— 透過變更日誌更新現有技能，而不是建立重複項目 |
| **Planner Integration** | 內建 `planner` 智慧體在執行前自動分解任務 |
| **opencodev2 身分 + 遷移** | 以 `opencodev2` 身分安裝並使用自己獨立的資料目錄，從而與官方 opencode 共存；首次執行精靈按需匯入您的設定、API 金鑰和對話記錄 |

新功能會在 [`CHANGELOG.md`](./CHANGELOG.md) 中進行版本記錄。

---

## 參與貢獻

如果您有興趣為本分叉版貢獻程式碼，請在提交拉取請求前閱讀[貢獻文件](./CONTRIBUTING.md)。拉取請求以 `dev` 分支為目標。

---

## 基於 OpenCode 進行開發

如果您正在開發與 OpenCode 相關的專案，並在名稱中使用了 "opencode"（例如 "opencode-dashboard" 或 "opencode-mobile"），請在 README 中註明該專案並非由 OpenCode 團隊建構，且與我們沒有任何關聯。

---

**回報問題** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**原始碼** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
