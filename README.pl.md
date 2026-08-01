<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo OpenCode fork">
    </picture>
  </a>
</p>
<p align="center">Otwartoźródłowy agent kodujący AI — fork społeczności.

> **Informacja o forku** — to repozytorium (`menoxz/opencode`) jest fork'iem
> społecznościowym [oficjalnego opencode](https://github.com/anomalyco/opencode)
> z dodatkowymi funkcjami (MCP auto-reconnect, hot reload, eval pipeline, memory
> consolidation, unified prompt). Nie jest **powiązane** z oficjalnym zespołem
> opencode. **Zobacz różnice fork'a →**</p>
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

[![Interfejs terminalowy OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Instalacja (fork)

Fork jest publikowany na npm w zakresie `@lux-tech` i instaluje plik binarny o nazwie
`opencode`, dokładnie tak jak oficjalny pakiet. Oznacza to, że fork **zastępuje**
oficjalnego opencode, gdy oba są instalowane globalnie — przeczytaj
**o współistnieniu z oficjalnym opencode**, zanim zaczniesz instalację.

### Zalecane: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Weryfikacja:

```bash
opencode --version
# opencode v1.18.55 (lub najnowsza opublikowana wersja)
```

Meta-pakiet `@lux-tech/opencode-ai` automatycznie pobiera właściwy binarny plik
platformy z jednej ze swoich 12 opcjonalnych zależności (patrz **tabela binarnych
plików platformowych**) i udostępnia go jako plik binarny `opencode`.

### Alternatywa: GitHub Releases (ręcznie)

Archiwa wydań publikowane są na
[stronie wydań](https://github.com/menoxz/opencode/releases) jako `.tar.gz` (Linux)
i `.zip` (macOS / Windows). Każde archiwum zawiera plik binarny `opencode` (lub
`opencode.exe`) w katalogu głównym.

```bash
# Przykład: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # zmień nazwę, aby nie nadpisać oficjalnego pliku binarnego
```

```powershell
# Przykład: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Lokalizacja pliku binarnego

| Metoda instalacji | Ścieżka pliku binarnego |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (ręcznie) | tam, gdzie go umieścisz |

### Aktualizacja

```bash
# Wbudowany aktualizator (pobiera najnowsze wydanie @lux-tech/opencode-ai)
opencode upgrade

# Lub przez npm
npm update -g @lux-tech/opencode-ai
```

### Odinstalowanie

```bash
npm uninstall -g @lux-tech/opencode-ai
```

W systemie Windows usuń również przestarzały shim, jeśli npm go pozostawił:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Współistnienie z oficjalnym opencode

**Zarówno fork (`@lux-tech/opencode-ai`), jak i oficjalny opencode (`opencode-ai`)
instalują plik binarny o nazwie `opencode`.** Globalna instalacja jednego po drugim
po cichu zastępuje poprzedni plik binarny. Nie można mieć obu jako globalnego
`opencode` jednocześnie.

### Którego powinieneś użyć?

| Potrzeba | Użyj |
|---|---|
| Serwery MCP z automatycznym ponownym połączeniem, hot reload, eval pipeline, memory consolidation, unified prompt | **Ten fork** (`@lux-tech/opencode-ai`) |
| Oficjalne, szeroko zweryfikowane wydanie | [oficjalny opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Opcja A — jedna instalacja globalna + npx dla drugiej (zalecane)

Zainstaluj fork globalnie i uruchamiaj oficjalnego opencode na żądanie bez instalowania
go globalnie:

```bash
npm install -g @lux-tech/opencode-ai   # fork staje się globalnym `opencode`

# Użyj oficjalnego opencode bez ruszania globalnej instalacji:
npx -y opencode-ai@latest
```

Lub odwrotnie — zostaw oficjalnego opencode jako globalny i uruchamiaj fork na żądanie:

```bash
npm install -g opencode-ai             # oficjalny staje się globalnym `opencode`
npx -y @lux-tech/opencode-ai@latest    # uruchom fork na żądanie
```

### Opcja B — obie zainstalowane, jedna zmieniona nazwa

Zainstaluj oba, a następnie zmień nazwę drugorzędnego pliku binarnego, aby te dwie
komendy nie kolidowały:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # nadpisuje `opencode` — zrób to jako drugie
```

Następnie w systemie Windows zmień nazwę pliku binarnego fork'a na `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # oficjalny
```

W systemach Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # oficjalny
```

### Sprawdź, który plik binarny jest aktualnie aktywny

```bash
which opencode                # ścieżka do aktywnego pliku binarnego
opencode --version            # wersja aktywnego pliku binarnego
opencode upgrade --help       # wbudowany aktualizator pobiera @lux-tech/opencode-ai
```

> [!TIP]
> Wbudowany aktualizator (`opencode upgrade`) zawsze pobiera `@lux-tech/opencode-ai`.
> Jeśli chcesz, aby **oficjalny** opencode aktualizował się automatycznie, uruchom go
> przez `npx opencode-ai@latest` lub oficjalny instalator (zobacz
> [opencode.ai](https://opencode.ai)).

---

## Binarne pliki platformowe

`@lux-tech/opencode-ai` jest dystrybuowany jako meta-pakiet z 12 opcjonalnymi plikami
binarnymi platform (wszystkie publikowane w tej samej wersji):

| Pakiet | Platforma / CPU | Uwagi |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | Procesory bez AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | Procesory bez AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, bez AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | Procesory bez AVX2 |

---

## Agenci

OpenCode zawiera dwóch wbudowanych agentów, między którymi możesz przełączać się
klawiszem `Tab`.

- **build** - Domyślny agent z pełnym dostępem do pracy developerskiej
- **plan** - Agent tylko do odczytu do analizy i eksploracji kodu
  - Domyślnie odmawia edycji plików
  - Pyta o zgodę przed uruchomieniem komend bash
  - Idealny do poznawania nieznanych baz kodu lub planowania zmian

Dodatkowo jest subagent **general** do złożonych wyszukiwań i wieloetapowych zadań.
Jest używany wewnętrznie i można go wywołać w wiadomościach przez `@general`.

Fork zawiera również agenta **planner**, który automatycznie rozkłada zadania na
mniejsze kroki przed wykonaniem. Dowiedz się więcej o [agentach w oficjalnej
dokumentacji](https://opencode.ai/docs/agents) — zachowanie jest zgodne z upstream.

---

## Dokumentacja

- **Dokumentacja specyficzna dla fork'a** znajduje się w tym repozytorium:
  [`docs/`](./docs) (architektura, ADR, hot reload i projekt MCP) oraz
  [`CHANGELOG.md`](./CHANGELOG.md).
- **Ogólna dokumentacja konfiguracji** jest zgodna z oficjalną dokumentacją:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Różnice fork'a

Ten fork (`menoxz/opencode`) dodaje następujące funkcje ponad upstream:

| Funkcja | Opis |
|---------|-------------|
| **MCP Auto-reconnect** | Serwery MCP, których połączenie zostaje przerwane, są wykrywane (zdarzenia transportu + ping zdrowotny) i automatycznie łączone ponownie z wykładniczym backoff — koniec z nieaktualnym statusem "connected" i martwymi sesjami |
| **Hot Reload** | Agenci, pluginy i serwery MCP przeładowują się automatycznie przy zmianie plików — bez potrzeby restartu |
| **Eval Pipeline** | Oparta na SQLite ewaluacja z wykrywaniem regresji, analizą trendów i komendami CLI compare |
| **Memory Consolidation** | Pamięć między sesjami z automatycznym zanikaniem, wykrywaniem wzorców i analizą post-mortem |
| **Unified Prompt** | Pojedynczy `core.txt` zastępuje 10 promptów specyficznych dla modeli — czyściej, mniej, łatwiej utrzymać |
| **Continuous Improvement** | Metody to żywe dokumenty — aktualizuj istniejące skills z changelogiem zamiast tworzyć duplikaty |
| **Planner Integration** | Wbudowany agent `planner` automatycznie rozkłada zadania przed wykonaniem |

Nowe funkcje są wersjonowane w [`CHANGELOG.md`](./CHANGELOG.md).

---

## Współtworzenie

Jeśli chcesz współtworzyć ten fork, przeczytaj naszą
[dokumentację dla współtwórców](./CONTRIBUTING.md) przed wysłaniem pull requesta.
Pull requesty kierowane są na gałąź `dev`.

---

## Budowanie na OpenCode

Jeśli pracujesz nad projektem związanym z OpenCode i używasz "opencode" jako części
nazwy, na przykład "opencode-dashboard" lub "opencode-mobile", dodaj notatkę do swojego
README, aby wyjaśnić, że projekt nie jest tworzony przez zespół OpenCode i nie jest
z nami w żaden sposób powiązany.

---

**Zgłaszaj problemy** na [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Źródło** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
