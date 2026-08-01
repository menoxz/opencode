<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode fork-logo">
    </picture>
  </a>
</p>
<p align="center">AI-kodeagenten med åpen kildekode — community-fork.

> **Fork-bemerkning** — dette repository (`menoxz/opencode`) er en community-fork av
> [den offisielle opencode](https://github.com/anomalyco/opencode) med ekstra funksjoner
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> Den er **ikke tilknyttet** det offisielle opencode-teamet.
> **Se fork-forskjellene →**</p>
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

[![OpenCode-terminalgrensesnitt](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installasjon (fork)

Forken er publisert på npm under scopet `@lux-tech` og installerer en binærfil som heter
`opencode`, akkurat som den offisielle pakken. Det betyr at forken **erstatter** den
offisielle opencode når begge installeres globalt — les
**om samspill med den offisielle opencode**, før du installerer.

### Anbefalt: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verifiser:

```bash
opencode --version
# opencode v1.18.55 (eller den sist publiserte versjonen)
```

Metapakken `@lux-tech/opencode-ai` laster automatisk ned riktig plattform-binærfil fra
en av de 12 valgfrie avhengighetene (se **tabellen over plattform-binærfiler**) og
tilgjengeliggjør den som `opencode`-binæren.

### Alternativ: GitHub Releases (manuelt)

Utgivelsesarkiver publiseres på
[utgivelsessiden](https://github.com/menoxz/opencode/releases) som `.tar.gz` (Linux)
og `.zip` (macOS / Windows). Hvert arkiv inneholder `opencode`-binæren (eller
`opencode.exe`) ved roten.

```bash
# Eksempel: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # gi nytt navn for å unngå å overskrive den offisielle binæren
```

```powershell
# Eksempel: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Plassering av binærfilen

| Installasjonsmetode | Plassering av binærfil |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (manuelt) | der du plasserte den |

### Oppdatering

```bash
# Innebygd oppdatering (henter den nyeste @lux-tech/opencode-ai-utgivelsen)
opencode upgrade

# Eller via npm
npm update -g @lux-tech/opencode-ai
```

### Avinstallering

```bash
npm uninstall -g @lux-tech/opencode-ai
```

På Windows må du også fjerne den gamle shimen hvis npm har etterlatt én:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Samspill med den offisielle opencode

**Både forken (`@lux-tech/opencode-ai`) og den offisielle opencode (`opencode-ai`)
installerer en binærfil som heter `opencode`.** Installerer du én globalt etter den
andre, erstattes den forrige binæren uten videre. Du kan ikke beholde begge som den
globale `opencode` samtidig.

### Hvilken bør du bruke?

| Behov | Bruk |
|---|---|
| MCP-servere med automatisk tilkobling på nytt, hot reload, eval pipeline, memory consolidation, unified prompt | **Denne forken** (`@lux-tech/opencode-ai`) |
| Den offisielle, bredt validerte utgivelsen | [offisiell opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Alternativ A — én global installasjon + npx for den andre (anbefalt)

Installer forken globalt og kjør den offisielle opencode ved behov uten å installere
den globalt:

```bash
npm install -g @lux-tech/opencode-ai   # forken blir den globale `opencode`

# Bruk den offisielle opencode uten å røre den globale installasjonen:
npx -y opencode-ai@latest
```

Eller omvendt — behold den offisielle opencode globalt og kjør forken ved behov:

```bash
npm install -g opencode-ai             # den offisielle blir den globale `opencode`
npx -y @lux-tech/opencode-ai@latest    # kjør forken ved behov
```

### Alternativ B — begge installert, én omdøpt

Installer begge, og gi deretter den sekundære binæren et nytt navn så de to
kommandoene ikke kolliderer:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overskriver `opencode` — gjør dette som nummer to
```

På Windows omdøper du forken-binæren til `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # offisiell
```

På Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # offisiell
```

### Sjekk hvilken binærfil som er aktiv

```bash
which opencode                # sti til den aktive binæren
opencode --version            # versjon av den aktive binæren
opencode upgrade --help       # innebygd oppdatering henter @lux-tech/opencode-ai
```

> [!TIP]
> Det innebygde oppdateringsverktøyet (`opencode upgrade`) henter alltid
> `@lux-tech/opencode-ai`. Hvis du vil at den **offisielle** opencode skal oppdatere
> seg selv, kjør den via `npx opencode-ai@latest` eller den offisielle installatøren
> (se [opencode.ai](https://opencode.ai)).

---

## Plattform-binærfiler

`@lux-tech/opencode-ai` leveres som en metapakke med 12 valgfrie plattform-binærfiler
(alle publisert i samme versjon):

| Pakke | Plattform / CPU | Merknader |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | Prosessorer uten AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | Prosessorer uten AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, uten AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | Prosessorer uten AVX2 |

---

## Agenter

OpenCode inneholder to innebygde agenter du kan bytte mellom med `Tab`-tasten.

- **build** - Standard, agent med full tilgang for utviklingsarbeid
- **plan** - Skrivebeskyttet agent for analyse og kodeutforsking
  - Nekter filendringer som standard
  - Spør om tillatelse før bash-kommandoer kjøres
  - Ideell for å utforske ukjente kodebaser eller planlegge endringer

Det finnes også en **general**-underagent for komplekse søk og flertrinnsoppgaver.
Den brukes internt og kan kalles via `@general` i meldinger.

Forken leverer i tillegg en **planner**-agent som automatisk dekomponerer oppgaver før
utførelse. Les mer om [agenter i den offisielle dokumentasjonen](https://opencode.ai/docs/agents) —
oppførselen er kompatibel med upstream.

---

## Dokumentasjon

- **Fork-spesifikk dokumentasjon** ligger i dette repositoryet: [`docs/`](./docs)
  (arkitektur, ADR-er, hot reload & MCP-design) og [`CHANGELOG.md`](./CHANGELOG.md).
- **Generell konfigurasjonsdokumentasjon** er kompatibel med den offisielle
  dokumentasjonen: [opencode.ai/docs](https://opencode.ai/docs).

---

## Fork-forskjeller

Denne forken (`menoxz/opencode`) legger til følgende funksjoner på toppen av upstream:

| Funksjon | Beskrivelse |
|---------|-------------|
| **MCP Auto-reconnect** | MCP-servere hvis tilkobling dør, oppdages (transporthendelser + helsesjekk) og kobles til igjen automatisk med eksponentiell backoff — ikke flere utdaterte "connected"-statuser eller døde økter |
| **Hot Reload** | Agenter, plugins og MCP-servere lastes inn på nytt automatisk ved filendringer — ingen omstart nødvendig |
| **Eval Pipeline** | SQLite-basert evaluering med regresjonsdeteksjon, trendanalyse og compare-CLI-kommandoer |
| **Memory Consolidation** | Tverrsessjonsminne med automatisk forfall, mønsterdeteksjon og post-mortem-analyse |
| **Unified Prompt** | Én enkelt `core.txt` erstatter 10 modelspesifikke prompts — renere, mindre, enklere å vedlikeholde |
| **Continuous Improvement** | Metoder er levende dokumenter — oppdater eksisterende skills med changelog i stedet for å opprette duplikater |
| **Planner Integration** | Innebygd `planner`-agent dekomponerer automatisk oppgaver før utførelse |

Nye funksjoner versjonsstyres i [`CHANGELOG.md`](./CHANGELOG.md).

---

## Bidra

Hvis du er interessert i å bidra til denne forken, kan du lese vår
[bidragsdokumentasjon](./CONTRIBUTING.md) før du sender en pull request.
Pull requests rettes mot `dev`-grenen.

---

## Bygge på OpenCode

Hvis du jobber med et prosjekt som er relatert til OpenCode og bruker "opencode" som en
del av navnet, for eksempel "opencode-dashboard" eller "opencode-mobile", legg til en
merknad i README som tydeliggjør at prosjektet ikke er bygget av OpenCode-teamet og
ikke er tilknyttet oss på noen måte.

---

**Rapporter problemer** på [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Kilde** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
