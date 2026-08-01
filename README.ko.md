<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode 포크 로고">
    </picture>
  </a>
</p>
<p align="center">오픈 소스 AI 코딩 에이전트 — 커뮤니티 포크.

> **포크 공지** — 이 저장소(`menoxz/opencode`)는 [공식 opencode](https://github.com/anomalyco/opencode)의
> 커뮤니티 포크로, 추가 기능(MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt)이 포함되어 있습니다.
> 공식 opencode 팀과는 **관련이 없습니다**.
> **포크 차이점 보기 →**</p>
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

[![OpenCode 터미널 UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## 설치 (포크)

이 포크는 npm의 `@lux-tech` 스코프로 게시되며, 공식 패키지와 똑같이 `opencode`라는 이름의 바이너리를 설치합니다. 즉, 둘 다 전역에 설치하면 포크가 공식 opencode를 **대체**합니다. 설치하기 전에 **공식 opencode와의 공존**을 읽어 주세요.

### 권장: npm

```bash
npm install -g @lux-tech/opencode-ai
```

확인:

```bash
opencode --version
# opencode v1.18.55 (or the latest published version)
```

메타 패키지 `@lux-tech/opencode-ai`는 12개의 선택적 종속성 중 하나에서 올바른 플랫폼의 바이너리를 자동으로 다운로드하고(**플랫폼별 바이너리 표** 참조), 이를 `opencode` 바이너리로 노출합니다.

### 대안: GitHub Releases (수동)

릴리스 아카이브는 [릴리스 페이지](https://github.com/menoxz/opencode/releases)에 `.tar.gz`(Linux)와 `.zip`(macOS / Windows)으로 게시됩니다. 각 아카이브의 루트에는 `opencode`(또는 `opencode.exe`) 바이너리가 포함되어 있습니다.

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

### 바이너리 위치

| 설치 방법 | 바이너리 경로 |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub 릴리스 (수동) | 직접 배치한 위치 |

### 업데이트

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencode upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### 제거

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows에서는 npm이 남긴 오래된 shim도 함께 제거하세요:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## 공식 opencode와의 공존

**포크(`@lux-tech/opencode-ai`)와 공식 opencode(`opencode-ai`)는 둘 다 `opencode`라는 이름의 바이너리를 설치합니다.** 하나를 전역에 설치하면 이전 바이너리를 조용히 대체합니다. 둘 다 동시에 전역 `opencode`로 유지할 수는 없습니다.

### 어떤 것을 사용해야 하나요?

| 필요 | 사용 |
|---|---|
| 자동 재연결 MCP 서버, hot reload, eval pipeline, memory consolidation, unified prompt | **이 포크** (`@lux-tech/opencode-ai`) |
| 공식적이고 널리 검증된 릴리스 | [공식 opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### 옵션 A — 하나는 전역 설치 + 다른 하나는 `npx` (권장)

포크를 전역에 설치하고, 공식 opencode는 전역에 설치하지 않고 필요할 때 실행합니다:

```bash
npm install -g @lux-tech/opencode-ai   # fork becomes the global `opencode`

# Use the official opencode without touching the global install:
npx -y opencode-ai@latest
```

또는 반대로, 공식 opencode를 전역에 유지하고 포크를 필요할 때 실행합니다:

```bash
npm install -g opencode-ai             # official becomes the global `opencode`
npx -y @lux-tech/opencode-ai@latest    # run the fork on demand
```

### 옵션 B — 둘 다 설치하고 하나는 이름 변경

둘 다 설치한 다음, 보조 바이너리의 이름을 변경해 두 명령이 충돌하지 않게 합니다:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overwrites `opencode` — do this one second
```

Windows에서는 포크 바이너리를 `opencode-fork.exe`로 이름을 변경합니다:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # official
```

Linux / macOS의 경우:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # official
```

### 현재 활성화된 바이너리 확인

```bash
which opencode                # path of the active binary
opencode --version            # version of the active binary
opencode upgrade --help       # built-in updater targets @lux-tech/opencode-ai
```

> [!TIP]
> 내장 업데이터(`opencode upgrade`)는 항상 `@lux-tech/opencode-ai`를 가져옵니다.
> **공식** opencode를 자동 업데이트하려면 `npx opencode-ai@latest` 또는 공식 설치 프로그램
> ([opencode.ai](https://opencode.ai) 참조)으로 실행하세요.

---

## 플랫폼별 바이너리

`@lux-tech/opencode-ai`는 12개의 플랫폼별 바이너리(모두 동일한 버전으로 게시됨)를 선택적 종속성으로 포함하는 메타 패키지로 제공됩니다:

| 패키지 | 플랫폼 / CPU | 비고 |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | AVX2 미지원 CPU |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | AVX2 미지원 CPU |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, AVX2 미지원 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | AVX2 미지원 CPU |

---

## 에이전트

OpenCode에는 내장 에이전트 2개가 있으며 `Tab` 키로 전환할 수 있습니다.

- **build** - 기본값, 개발 작업을 위한 전체 액세스 에이전트
- **plan** - 분석 및 코드 탐색을 위한 읽기 전용 에이전트
  - 기본적으로 파일 편집을 거부
  - bash 명령 실행 전에 권한을 요청
  - 낯선 코드베이스 탐색이나 변경 계획에 적합

또한 복잡한 검색과 다단계 작업을 위한 **general** 서브 에이전트가 포함되어 있습니다. 내부적으로 사용되며 메시지에서 `@general`을 입력해 호출할 수 있습니다.

포크에는 실행 전에 작업을 자동으로 분해하는 **planner** 에이전트도 함께 제공됩니다. [공식 문서의 에이전트](https://opencode.ai/docs/agents)에 대해 자세히 알아보세요 — 동작은 업스트림과 호환됩니다.

---

## 문서

- **포크 전용 문서**는 이 저장소에 있습니다: [`docs/`](./docs)(아키텍처, ADR, hot reload 및 MCP 설계) 및 [`CHANGELOG.md`](./CHANGELOG.md).
- **일반 구성 문서**는 공식 문서와 호환됩니다: [opencode.ai/docs](https://opencode.ai/docs).

---

## 포크 차이점

이 포크(`menoxz/opencode`)는 업스트림 위에 다음 기능을 추가합니다:

| 기능 | 설명 |
|---|---|
| **MCP Auto-reconnect** | 연결이 끊긴 MCP 서버를 감지(전송 이벤트 + 헬스 핑)하고 지수 백오프로 자동 재연결 — 더 이상 낡은 "연결됨" 상태나 죽은 세션은 없습니다 |
| **Hot Reload** | 에이전트, 플러그인, MCP 서버가 파일 변경 시 자동으로 다시 로드됩니다 — 재시작 불필요 |
| **Eval Pipeline** | SQLite 기반 평가. 회귀 감지, 추세 분석, compare CLI 명령 포함 |
| **Memory Consolidation** | 세션 간 메모리. 자동 감쇠, 패턴 감지, 사후 분석 포함 |
| **Unified Prompt** | 단일 `core.txt`가 10개의 모델별 프롬프트를 대체 — 더 깔끔하고, 더 작고, 유지보수하기 쉬움 |
| **Continuous Improvement** | 메서드는 살아있는 문서 — 중복을 만들지 말고 변경 로그와 함께 기존 스킬을 업데이트 |
| **Planner Integration** | 내장 `planner` 에이전트가 실행 전에 작업을 자동 분해 |

새 기능은 [`CHANGELOG.md`](./CHANGELOG.md)에서 버전 관리됩니다.

---

## 기여하기

이 포크에 기여하고 싶다면, 풀 리퀘스트를 제출하기 전에 [기여 문서](./CONTRIBUTING.md)를 읽어 주세요. 풀 리퀘스트는 `dev` 브랜치를 대상으로 합니다.

---

## OpenCode 기반으로 만들기

OpenCode와 관련된 프로젝트를 진행하면서 이름에 "opencode"(예: "opencode-dashboard" 또는 "opencode-mobile")를 포함한다면, README에 해당 프로젝트가 OpenCode 팀이 만든 것이 아니며 어떤 방식으로도 우리와 제휴되어 있지 않다는 점을 명시해 주세요.

---

**문제 보고** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**소스** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
