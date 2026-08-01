<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode フォークのロゴ">
    </picture>
  </a>
</p>
<p align="center">オープンソースの AI コーディングエージェント — コミュニティフォーク。

> **フォークのお知らせ** — このリポジトリ（`menoxz/opencode`）は、[公式 opencode](https://github.com/anomalyco/opencode) の
> コミュニティフォークであり、追加機能（MCP auto-reconnect、hot reload、eval pipeline、memory consolidation、unified prompt）を備えています。
> 公式の opencode チームとは**無関係**です。
> **フォークの差分を見る →**</p>
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

[![OpenCode ターミナル UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## インストール（フォーク）

このフォークは npm のスコープ `@lux-tech` で公開されており、公式パッケージとまったく同じ `opencode` という名前のバイナリをインストールします。つまり、両方をグローバルにインストールした場合、フォークは公式 opencode を**置き換える**ことになります。インストール前に**公式 opencode との共存**をお読みください。

### 推奨：npm

```bash
npm install -g @lux-tech/opencode-ai
```

確認：

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

メタパッケージ `@lux-tech/opencode-ai` は、12 個のオプショナル依存パッケージのいずれかから、正しいプラットフォームのバイナリを自動的にダウンロードし（**プラットフォーム別バイナリの表**を参照）、それを `opencode` バイナリとして公開します。

### 代替：GitHub Releases（手動）

リリースアーカイブは [リリースページ](https://github.com/menoxz/opencode/releases) に `.tar.gz`（Linux）と `.zip`（macOS / Windows）で公開されています。各アーカイブのルートには `opencode`（または `opencode.exe`）バイナリが含まれています。

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

### バイナリの場所

| インストール方法 | バイナリのパス |
|---|---|
| npm（Windows） | `%APPDATA%\npm\opencode.exe` |
| npm（Linux / macOS） | `$(npm prefix -g)/bin/opencode` |
| GitHub release（手動） | 配置した任意の場所 |

### 更新

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### アンインストール

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows では、npm が残した古い shim も削除してください：

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## 公式 opencode との共存

**フォーク（`@lux-tech/opencode-ai`）と公式 opencode（`opencode-ai`）は、どちらも `opencode` という名前のバイナリをインストールします。** 一方をグローバルにインストールすると、他方のバイナリを黙って置き換えます。両方を同時にグローバルの `opencode` として保持することはできません。

### どちらを使うべきか？

| ニーズ | 使用 |
|---|---|
| MCP サーバーの自動再接続、hot reload、eval pipeline、memory consolidation、unified prompt | **このフォーク**（`@lux-tech/opencode-ai`） |
| 公式で広く検証済みのリリース | [公式 opencode](https://github.com/anomalyco/opencode)（`opencode-ai`） |

### オプション A — 1 つはグローバルインストール + もう 1 つは `npx`（推奨）

フォークをグローバルにインストールし、公式 opencode はグローバルにインストールせず、必要に応じて実行します：

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

または逆に、公式 opencode をグローバルに残し、フォークを必要に応じて実行します：

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### オプション B — 両方インストールして片方をリネーム

両方をインストールし、副次的なバイナリをリネームして、2 つのコマンドが衝突しないようにします：

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

Windows では、フォークのバイナリを `opencode-fork.exe` にリネームします：

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

Linux / macOS の場合：

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### 現在アクティブなバイナリを確認する

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> 内蔵アップデーター（`opencode upgrade`）は常に `@lux-tech/opencode-ai` を取得します。
> **公式** opencode を自動更新したい場合は、`npx opencode-ai@latest` か公式インストーラー
> （[opencode.ai](https://opencode.ai) を参照）で実行してください。

---

## プラットフォーム別バイナリ

`@lux-tech/opencode-ai` は、12 個のプラットフォーム別バイナリ（すべて同じバージョンで公開）をオプショナル依存パッケージとして同梱するメタパッケージとして配布されています：

| パッケージ | プラットフォーム / CPU | 備考 |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | AVX2 非対応 CPU |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | AVX2 非対応 CPU |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl、AVX2 非対応 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | AVX2 非対応 CPU |

---

## エージェント

OpenCode には組み込みのエージェントが 2 つあり、`Tab` キーで切り替えられます。

- **build** - デフォルト。開発作業向けのフルアクセスエージェント
- **plan** - 分析とコード探索向けの読み取り専用エージェント
  - デフォルトでファイルの編集を拒否
  - bash コマンドを実行する前に許可を求める
  - 馴染みのないコードベースの探索や変更の計画に最適

また、複雑な検索や多段階のタスク向けの **general** サブエージェントも含まれています。これは内部で使用され、メッセージで `@general` と入力して呼び出すことができます。

フォークにはさらに、実行前にタスクを自動分解する **planner** エージェントが同梱されています。[公式ドキュメントのエージェント](https://opencode.ai/docs/agents) について詳しくはそちらをご覧ください — 動作はアップストリームと互換性があります。

---

## ドキュメント

- **フォーク固有のドキュメント** はこのリポジトリにあります：[`docs/`](./docs)（アーキテクチャ、ADR、hot reload と MCP の設計）と [`CHANGELOG.md`](./CHANGELOG.md)。
- **一般的な設定ドキュメント** は公式ドキュメントと互換性があります：[opencode.ai/docs](https://opencode.ai/docs)。

---

## フォークの差分

このフォーク（`menoxz/opencode`）は、アップストリームに以下の機能を追加します：

| 機能 | 説明 |
|---|---|
| **MCP Auto-reconnect** | 接続が切れた MCP サーバーを検出し（トランスポートイベント + ヘルスピング）、指数バックオフで自動再接続します — 「接続済み」のままの古い状態や死んだセッションはもうありません |
| **Hot Reload** | エージェント、プラグイン、MCP サーバーがファイルの変更時に自動で再読み込みされます — 再起動は不要です |
| **Eval Pipeline** | SQLite ベースの評価。回帰検出、傾向分析、compare CLI コマンドを搭載 |
| **Memory Consolidation** | セッションをまたぐメモリ。自動減衰、パターン検出、事後分析を搭載 |
| **Unified Prompt** | 単一の `core.txt` が 10 個のモデル固有プロンプトを置き換え — よりクリーンで、より小さく、保守しやすくなります |
| **Continuous Improvement** | メソッドは生きたドキュメント — 重複を作る代わりに、既存スキルを変更履歴付きで更新します |
| **Planner Integration** | 組み込みの `planner` エージェントが実行前にタスクを自動分解します |

新機能は [`CHANGELOG.md`](./CHANGELOG.md) でバージョン管理されています。

---

## コントリビュート

このフォークへの貢献に興味がある場合は、プルリクエストを送信する前に[コントリビュートドキュメント](./CONTRIBUTING.md)をお読みください。プルリクエストは `dev` ブランチを対象としています。

---

## OpenCode の上に構築する

OpenCode に関連するプロジェクトを開発していて、名前の一部に "opencode" を使用している場合（例："opencode-dashboard" や "opencode-mobile"）、README に、それが OpenCode チームによって作られたものではなく、いかなる形でも私たちと関係がないことを明記してください。

---

**問題を報告する** [GitHub Issues](https://github.com/menoxz/opencode/issues) ・
**ソース** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
