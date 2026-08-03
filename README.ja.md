<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="OpenCode フォークのロゴ">
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

このフォークは npm のスコープ `@lux-tech` で公開されており、そのコマンドを **`opencodev2`** としてインストールします —— 公式 `opencode`（`opencode-ai` からインストール）とは別のバイナリで、**共存**します。また、専用のデータ/設定ディレクトリ（`~/.local/share/opencodev2`、`~/.config/opencodev2`）を使うため、両方の製品を互いのデータに触れずに並行して実行できます。初回の対話型起動時に、既存の opencode 設定・API キー・セッション履歴のインポートを提案します —— 元のインストールはそのまま残ります。**公式 opencode との共存**を参照してください。

### 推奨：npm

```bash
npm install -g @lux-tech/opencode-ai
```

確認：

```bash
opencodev2 --version
# 1.18.59 (or the latest published version)
```

メタパッケージ `@lux-tech/opencode-ai` は、12 個のオプショナル依存パッケージのいずれかから、正しいプラットフォームのバイナリを自動的にダウンロードし（**プラットフォーム別バイナリの表**を参照）、それを `opencodev2` コマンドとして公開します。

### 代替：GitHub Releases（手動）

リリースアーカイブは [リリースページ](https://github.com/menoxz/opencode/releases) に `.tar.gz`（Linux）と `.zip`（macOS / Windows）で公開されています。各アーカイブのルートにはコンパイル済みの CLI バイナリが含まれています —— 手動インストール時は `opencodev2` にリネームして、公式 `opencode` バイナリと衝突しないようにしてください。

```bash
# Example: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # 独立した名前。公式バイナリと衝突しない
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### バイナリの場所

| インストール方法 | バイナリのパス |
|---|---|
| npm（Windows） | `%APPDATA%\npm\opencodev2.exe` |
| npm（Linux / macOS） | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release（手動） | 配置した任意の場所 |

### 更新

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencodev2 upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### アンインストール

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows では、npm が残した古い shim も削除してください：

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## 公式 opencode との共存

フォーク（`@lux-tech/opencode-ai`）はコマンドを **`opencodev2`** としてインストールし、公式 opencode（`opencode-ai`）は `opencode` をインストールします。2 つの名前が衝突することはなく、フォークは専用のデータディレクトリ（`~/.local/share/opencodev2`、`~/.config/opencodev2`、`~/.local/state/opencodev2`、`~/.cache/opencodev2`）を使うため、**両方を同時にインストールして使用できます**。

### 初回実行の移行ウィザード

初回の対話型起動時に、`opencodev2` は既存の opencode インストール（設定、API キー、セッション）を検出し、どうするかを尋ねます：

- **インポート（推奨）** —— 設定・認証情報（`auth.json`）・セッション履歴（`opencode.db`）を元の opencode ディレクトリから opencodev2 ディレクトリへコピーします。元のデータはそのまま残ります。
- **後で** —— 新しいデータで起動し、次回の起動時に再度尋ねます。
- **しない** —— 空の opencodev2 データで起動します（マーカーファイルが以降のプロンプトを抑止します）。

ヘッドレス環境（CI、スクリプト）では動作を強制できます：

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # 非対話でインポート
OPENCODEV2_MIGRATE=skip opencodev2 ...   # スキップして決定済みとマーク
```

このウィザードはデータディレクトリごとに 1 回だけ実行されます（`.migrate-state` マーカーファイルが決定を記録します）。インポート後、コピーされたデータベースは opencodev2 のものになります —— 以降の opencodev2 のデータベース移行が元の opencode インストールに触れることはありません。

### どちらを使うべきか？

| ニーズ | 使用 |
|---|---|
| MCP サーバーの自動再接続、hot reload、eval pipeline、memory consolidation、unified prompt | **このフォーク**（`opencodev2`） |
| 公式で広く検証済みのリリース | [公式 opencode](https://github.com/anomalyco/opencode)（`opencode`） |

両方とも独立して最新の状態を保てます：

```bash
opencodev2 upgrade        # フォークを更新（@lux-tech/opencode-ai）
opencode upgrade          # 公式 opencode を更新（opencode-ai）
```

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
| **opencodev2 のアイデンティティ + 移行** | `opencodev2` としてインストールされ、専用データディレクトリを使って公式 opencode と共存します。初回実行ウィザードが設定・API キー・セッション履歴を要求に応じてインポートします |

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
