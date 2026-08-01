<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode-Fork-Logo">
    </picture>
  </a>
</p>
<p align="center">Der Open-Source-KI-Coding-Agent — Community-Fork.

> **Fork-Hinweis** — dieses Repository (`menoxz/opencode`) ist ein Community-Fork des
> [offiziellen opencode](https://github.com/anomalyco/opencode) mit zusätzlichen Funktionen
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> Es ist **nicht mit dem** offiziellen opencode-Team verbunden.
> **Siehe Fork-Unterschiede →**</p>
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

[![OpenCode-Terminal-Benutzeroberfläche](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installation (Fork)

Der Fork wird auf npm unter dem Scope `@lux-tech` veröffentlicht und installiert seinen
Befehl als **`opencodev2`** — eine eigenständige Binärdatei, die **koexistiert** mit
dem offiziellen `opencode` (installiert aus `opencode-ai`). Er verwendet außerdem
eigene Daten-/Konfigurationsverzeichnisse (`~/.local/share/opencodev2`,
`~/.config/opencodev2`), sodass beide Produkte nebeneinander laufen können, ohne die
Daten des jeweils anderen zu berühren. Beim ersten interaktiven Start bietet der Fork
an, deine bestehende opencode-Konfiguration, API-Schlüssel und den Sitzungsverlauf zu
importieren — die ursprüngliche Installation bleibt unangetastet. Siehe
[Koexistenz mit dem offiziellen opencode](#koexistenz-mit-dem-offiziellen-opencode).

### Empfohlen: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Überprüfung:

```bash
opencodev2 --version
# 1.18.59 (oder die neueste veröffentlichte Version)
```

Das Meta-Paket `@lux-tech/opencode-ai` lädt automatisch die korrekte Plattform-
Binärdatei aus einer seiner 12 optionalen Abhängigkeiten herunter (siehe die
**Tabelle der Plattform-Binärdateien**) und stellt sie als Befehl `opencodev2` bereit.

### Alternative: GitHub Releases (manuell)

Release-Archive werden auf
[der Releases-Seite](https://github.com/menoxz/opencode/releases) als `.tar.gz` (Linux)
und `.zip` (macOS / Windows) veröffentlicht. Jedes Archiv enthält die kompilierte
CLI-Binärdatei in seinem Stammverzeichnis — benenne sie bei manueller Installation in
`opencodev2` um, damit sie nie mit der offiziellen `opencode`-Binärdatei kollidiert.

```bash
# Beispiel: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # eindeutiger Name, keine Kollision mit der offiziellen Binärdatei
```

```powershell
# Beispiel: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Speicherort der Binärdatei

| Installationsmethode | Pfad der Binärdatei |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub-Release (manuell) | wo auch immer du sie abgelegt hast |

### Aktualisierung

```bash
# Integrierter Updater (holt die neueste @lux-tech/opencode-ai-Release)
opencodev2 upgrade

# Oder über npm
npm update -g @lux-tech/opencode-ai
```

### Deinstallation

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Unter Windows entferne außerdem den veralteten Shim, falls npm einen hinterlassen hat:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Koexistenz mit dem offiziellen opencode

Der Fork (`@lux-tech/opencode-ai`) installiert seinen Befehl als **`opencodev2`**,
während der offizielle opencode (`opencode-ai`) `opencode` installiert. Die beiden
Namen kollidieren nie, und der Fork verwendet seine eigenen Datenverzeichnisse
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), sodass **beide gleichzeitig installiert und verwendet werden
können**.

### Migrationsassistent beim ersten Start

Beim ersten interaktiven Start erkennt `opencodev2`, ob eine frühere opencode-
Installation vorhanden ist (Konfiguration, API-Schlüssel, Sitzungen) und fragt, was
getan werden soll:

- **Importieren (empfohlen)** — kopiert deine Konfiguration, Anmeldedaten
  (`auth.json`) und den Sitzungsverlauf (`opencode.db`) aus den ursprünglichen
  opencode-Verzeichnissen in die opencodev2-Verzeichnisse. Die ursprünglichen Daten
  bleiben unangetastet.
- **Später** — startet frisch und fragt beim nächsten Start erneut.
- **Nie** — startet mit leeren opencodev2-Daten (eine Markierungsdatei verhindert
  weitere Aufforderungen).

Headless-Umgebungen (CI, Skripte) können das Verhalten erzwingen:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # nicht-interaktiv importieren
OPENCODEV2_MIGRATE=skip opencodev2 ...   # überspringen und als entschieden markieren
```

Der Assistent läuft nur einmal pro Datenverzeichnis (eine `.migrate-state`-Markierung
zeichnet die Entscheidung auf). Nach einem Import gehört die kopierte Datenbank zu
opencodev2 — nachfolgende opencodev2-Datenbankmigrationen berühren die ursprüngliche
opencode-Installation nie.

### Welches solltest du verwenden?

| Bedarf | Verwende |
|---|---|
| MCP-Auto-Reconnect, Hot Reload, Eval-Pipeline, Memory-Consolidation, Unified-Prompt | **Dieser Fork** (`opencodev2`) |
| Die offizielle, breit validierte Release | [offizieller opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Beide bleiben unabhängig voneinander aktuell:

```bash
opencodev2 upgrade        # aktualisiert den Fork (@lux-tech/opencode-ai)
opencode upgrade          # aktualisiert den offiziellen opencode (opencode-ai)
```

---

## Plattform-Binärdateien

`@lux-tech/opencode-ai` wird als Meta-Paket mit 12 optionalen Plattform-Binärdateien
ausgeliefert (alle in derselben Version veröffentlicht):

| Package | Plattform / CPU | Hinweise |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPUs ohne AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPUs ohne AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, ohne AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPUs ohne AVX2 |

---

## Agents

OpenCode enthält zwei eingebaute Agents, zwischen denen du mit der `Tab`-Taste wechseln kannst.

- **build** - Standard-Agent mit vollem Zugriff für Entwicklungsarbeit
- **plan** - Nur-Lese-Agent für Analyse und Code-Exploration
  - Verweigert Datei-Edits standardmäßig
  - Fragt vor dem Ausführen von bash-Befehlen um Erlaubnis
  - Ideal zum Erkunden unbekannter Codebases oder zum Planen von Änderungen

Außerdem ist ein **general**-Subagent für komplexe Suchen und mehrstufige Aufgaben enthalten.
Dieser wird intern genutzt und kann in Nachrichten mit `@general` aufgerufen werden.

Der Fork enthält zusätzlich einen **planner**-Agent, der Aufgaben vor der Ausführung
automatisch zerlegt. Mehr dazu unter
[Agents in der offiziellen Dokumentation](https://opencode.ai/docs/agents) — das Verhalten
ist mit upstream kompatibel.

---

## Dokumentation

- **Fork-spezifische Dokumentation** : in diesem Repository — [`docs/`](./docs) (Architektur,
  ADRs, Hot-Reload- und MCP-Design) und [`CHANGELOG.md`](./CHANGELOG.md).
- **Allgemeine Konfigurationsdokumentation** : kompatibel mit der offiziellen Dokumentation —
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Fork-Unterschiede

Dieser Fork (`menoxz/opencode`) fügt gegenüber upstream die folgenden Funktionen hinzu:

| Funktion | Beschreibung |
|---------|-------------|
| **MCP Auto-reconnect** | MCP-Server, deren Verbindung abbricht, werden erkannt (Transport-Events + Health-Ping) und mit exponentiellem Backoff automatisch neu verbunden — keine veralteten „verbunden“-Status oder toten Sessions mehr |
| **Hot Reload** | Agents, Plugins und MCP-Server laden bei Dateiänderungen automatisch neu — kein Neustart nötig |
| **Eval Pipeline** | SQLite-basierte Evaluierung mit Regressionserkennung, Trendanalyse und Compare-CLI-Befehlen |
| **Memory Consolidation** | Sitzungsübergreifender Speicher mit automatischem Verfall, Mustererkennung und Post-Mortem-Analyse |
| **Unified Prompt** | Ein einziges `core.txt` ersetzt 10 modellspezifische Prompts — sauberer, kleiner, leichter zu pflegen |
| **Continuous Improvement** | Methoden sind lebende Dokumente — aktualisiere bestehende Skills mit Changelog statt Duplikate zu erstellen |
| **Planner Integration** | Der integrierte `planner`-Agent zerlegt Aufgaben vor der Ausführung automatisch |
| **opencodev2-Identität + Migration** | Installiert als `opencodev2` mit eigenen Datenverzeichnissen, sodass es mit dem offiziellen opencode koexistiert; ein Assistent beim ersten Start importiert auf Wunsch deine Konfiguration, API-Schlüssel und den Sitzungsverlauf |

Neue Funktionen werden in [`CHANGELOG.md`](./CHANGELOG.md) versioniert.

---

## Mitwirken

Wenn du an diesem Fork mitwirken möchtest, lies bitte unsere
[Contributing Docs](./CONTRIBUTING.md), bevor du einen Pull Request einreichst.
Pull Requests zielen auf den `dev`-Branch.

---

## Auf OpenCode aufbauen

Wenn du an einem Projekt arbeitest, das mit OpenCode zusammenhängt und „opencode“ als
Teil seines Namens verwendet, z. B. „opencode-dashboard“ oder „opencode-mobile“, füge
bitte einen Hinweis zu deiner README hinzu, um klarzustellen, dass es nicht vom
OpenCode-Team gebaut wird und in keiner Weise mit uns verbunden ist.

---

**Melde Probleme** auf [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Quellcode** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
