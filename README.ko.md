<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="OpenCode 포크 로고">
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

이 포크는 npm의 `@lux-tech` 스코프로 게시되며, 명령을 **`opencodev2`**로 설치합니다 —— 공식 `opencode`(`opencode-ai`에서 설치)와 **공존**하는 별도의 바이너리입니다. 또한 전용 데이터/설정 디렉터리(`~/.local/share/opencodev2`、`~/.config/opencodev2`)를 사용하므로 두 제품이 서로의 데이터에 손대지 않고 나란히 실행될 수 있습니다. 첫 대화형 실행 시 기존 opencode 설정·API 키·세션 기록 가져오기를 제안합니다 —— 원래 설치본은 그대로 남습니다. **공식 opencode와의 공존**을 참조하세요.

### 권장: npm

```bash
npm install -g @lux-tech/opencode-ai
```

확인:

```bash
opencodev2 --version
# 1.18.59 (or the latest published version)
```

메타 패키지 `@lux-tech/opencode-ai`는 12개의 선택적 종속성 중 하나에서 올바른 플랫폼의 바이너리를 자동으로 다운로드하고(**플랫폼별 바이너리 표** 참조), 이를 `opencodev2` 명령으로 노출합니다.

### 대안: GitHub Releases (수동)

릴리스 아카이브는 [릴리스 페이지](https://github.com/menoxz/opencode/releases)에 `.tar.gz`(Linux)와 `.zip`(macOS / Windows)으로 게시됩니다. 각 아카이브의 루트에는 컴파일된 CLI 바이너리가 포함되어 있습니다 —— 수동 설치 시 `opencodev2`로 이름을 바꿔 공식 `opencode` 바이너리와 충돌하지 않게 하세요.

```bash
# Example: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # 독립된 이름, 공식 바이너리와 충돌 없음
```

```powershell
# Example: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### 바이너리 위치

| 설치 방법 | 바이너리 경로 |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub 릴리스 (수동) | 직접 배치한 위치 |

### 업데이트

```bash
# Built-in updater (fetches the latest @lux-tech/opencode-ai release)
opencodev2 upgrade

# Or via npm
npm update -g @lux-tech/opencode-ai
```

### 제거

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows에서는 npm이 남긴 오래된 shim도 함께 제거하세요:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## 공식 opencode와의 공존

포크(`@lux-tech/opencode-ai`)는 명령을 **`opencodev2`**로 설치하고, 공식 opencode(`opencode-ai`)는 `opencode`를 설치합니다. 두 이름이 충돌하지 않으며, 포크는 전용 데이터 디렉터리(`~/.local/share/opencodev2`、`~/.config/opencodev2`、`~/.local/state/opencodev2`、`~/.cache/opencodev2`)를 사용하므로 **둘을 동시에 설치하고 사용할 수 있습니다**.

### 최초 실행 마이그레이션 마법사

첫 대화형 실행 시 `opencodev2`는 기존 opencode 설치(설정, API 키, 세션)가 있는지 감지하고 어떻게 할지 묻습니다:

- **가져오기(권장)** —— 설정·자격 증명(`auth.json`)·세션 기록(`opencode.db`)을 원래 opencode 디렉터리에서 opencodev2 디렉터리로 복사합니다. 원래 데이터는 그대로 남습니다.
- **나중에** —— 새 데이터로 시작하고 다음 실행 때 다시 묻습니다.
- **안 함** —— 빈 opencodev2 데이터로 시작합니다(마커 파일이 이후 프롬프트를 막습니다).

헤드리스 환경(CI, 스크립트)에서는 동작을 강제할 수 있습니다:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # 비대화형 가져오기
OPENCODEV2_MIGRATE=skip opencodev2 ...   # 건너뛰고 결정됨으로 표시
```

이 마법사는 데이터 디렉터리마다 한 번만 실행됩니다(`.migrate-state` 마커 파일이 결정을 기록). 가져온 후 복사된 데이터베이스는 opencodev2의 것이 됩니다 —— 이후 opencodev2의 데이터베이스 마이그레이션은 원래 opencode 설치에 절대 손대지 않습니다.

### 어떤 것을 사용해야 하나요?

| 필요 | 사용 |
|---|---|
| 자동 재연결 MCP 서버, hot reload, eval pipeline, memory consolidation, unified prompt | **이 포크** (`opencodev2`) |
| 공식적이고 널리 검증된 릴리스 | [공식 opencode](https://github.com/anomalyco/opencode) (`opencode`) |

둘 다 독립적으로 최신 상태를 유지합니다:

```bash
opencodev2 upgrade        # 포크 업데이트 (@lux-tech/opencode-ai)
opencode upgrade          # 공식 opencode 업데이트 (opencode-ai)
```

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
| **opencodev2 정체성 + 마이그레이션** | `opencodev2`로 설치되어 전용 데이터 디렉터리로 공식 opencode와 공존합니다. 최초 실행 마법사가 설정·API 키·세션 기록을 요청에 따라 가져옵니다 |

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
