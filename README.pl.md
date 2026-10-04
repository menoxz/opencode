<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="Logo OpenCode fork">
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

Fork jest publikowany na npm w zakresie `@lux-tech` i instaluje swoje polecenie jako
**`opencodev2`** — osobny plik binarny, który **współistnieje** z oficjalnym
`opencode` (instalowanym z `opencode-ai`). Używa również własnych katalogów
danych/konfiguracji (`~/.local/share/opencodev2`, `~/.config/opencodev2`), dzięki
czemu oba produkty mogą działać obok siebie bez naruszania swoich danych. Przy
pierwszym interaktywnym uruchomieniu fork proponuje zaimportowanie istniejącej
konfiguracji opencode, kluczy API i historii sesji — oryginalna instalacja pozostaje
nietknięta. Zobacz [współistnienie z oficjalnym opencode](#współistnienie-z-oficjalnym-opencode).

### Zalecane: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Weryfikacja:

```bash
opencodev2 --version
# 1.18.59 (lub najnowsza opublikowana wersja)
```

Meta-pakiet `@lux-tech/opencode-ai` automatycznie pobiera właściwy binarny plik
platformy z jednej ze swoich 12 opcjonalnych zależności (patrz **tabela binarnych
plików platformowych**) i udostępnia go jako polecenie `opencodev2`.

### Alternatywa: GitHub Releases (ręcznie)

Archiwa wydań publikowane są na
[stronie wydań](https://github.com/menoxz/opencode/releases) jako `.tar.gz` (Linux)
i `.zip` (macOS / Windows). Każde archiwum zawiera skompilowany plik binarny CLI
w katalogu głównym — przy instalacji ręcznej zmień jego nazwę na `opencodev2`, aby
nigdy nie kolidował z oficjalnym plikiem binarnym `opencode`.

```bash
# Przykład: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # odrębna nazwa, brak kolizji z oficjalnym plikiem binarnym
```

```powershell
# Przykład: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Lokalizacja pliku binarnego

| Metoda instalacji | Ścieżka pliku binarnego |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (ręcznie) | tam, gdzie go umieścisz |

### Aktualizacja

```bash
# Wbudowany aktualizator (pobiera najnowsze wydanie @lux-tech/opencode-ai)
opencodev2 upgrade

# Lub przez npm
npm update -g @lux-tech/opencode-ai
```

### Odinstalowanie

```bash
npm uninstall -g @lux-tech/opencode-ai
```

W systemie Windows usuń również przestarzały shim, jeśli npm go pozostawił:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Współistnienie z oficjalnym opencode

Fork (`@lux-tech/opencode-ai`) instaluje swoje polecenie jako **`opencodev2`**, podczas
gdy oficjalny opencode (`opencode-ai`) instaluje `opencode`. Te dwie nazwy nigdy nie
kolidują, a fork używa własnych katalogów danych
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), więc **oba mogą być zainstalowane i używane jednocześnie**.

### Kreator migracji przy pierwszym uruchomieniu

Przy pierwszym interaktywnym uruchomieniu `opencodev2` wykrywa, czy istnieje wcześniejsza
instalacja opencode (konfiguracja, klucze API, sesje) i pyta, co zrobić:

- **Importuj (zalecane)** — kopiuje Twoją konfigurację, poświadczenia (`auth.json`)
  i historię sesji (`opencode.db`) z oryginalnych katalogów opencode do katalogów
  opencodev2. Oryginalne dane pozostają nietknięte.
- **Później** — zaczyna od nowa i pyta ponownie przy następnym uruchomieniu.
- **Nigdy** — zaczyna z pustymi danymi opencodev2 (plik znacznika zapobiega dalszym
  pytaniom).

Środowiska bez interfejsu (CI, skrypty) mogą wymusić to zachowanie:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # importuj nieinteraktywnie
OPENCODEV2_MIGRATE=skip opencodev2 ...   # pomiń i oznacz jako rozstrzygnięte
```

Kreator uruchamia się tylko raz na katalog danych (znacznik `.migrate-state` zapisuje
decyzję). Po imporcie skopiowana baza danych należy do opencodev2 — kolejne migracje
bazy danych opencodev2 nigdy nie dotykają oryginalnej instalacji opencode.

### Którego powinieneś użyć?

| Potrzeba | Użyj |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Ten fork** (`opencodev2`) |
| Oficjalne, szeroko zweryfikowane wydanie | [oficjalny opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Oba pozostają aktualizowane niezależnie:

```bash
opencodev2 upgrade        # aktualizuje fork (@lux-tech/opencode-ai)
opencode upgrade          # aktualizuje oficjalny opencode (opencode-ai)
```

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
| **opencodev2 identity + migracja** | Instaluje się jako `opencodev2` z własnymi katalogami danych, dzięki czemu współistnieje z oficjalnym opencode; kreator przy pierwszym uruchomieniu importuje na życzenie Twoją konfigurację, klucze API i historię sesji |

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
