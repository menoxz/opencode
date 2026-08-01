<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode fork-logo">
    </picture>
  </a>
</p>
<p align="center">AI-kodeagenten med åben kildekode — community-fork.

> **Fork-bemærkning** — dette repository (`menoxz/opencode`) er en community-fork af
> [den officielle opencode](https://github.com/anomalyco/opencode) med ekstra funktioner
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> Det er **ikke tilknyttet** det officielle opencode-team.
> **Se fork-forskellene →**</p>
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

[![OpenCode-terminalgrænseflade](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installation (fork)

Fork'en er udgivet på npm under scopet `@lux-tech` og installerer en binær ved navn
`opencode`, præcis som den officielle pakke. Det betyder, at fork'en **erstatter** den
officielle opencode, når begge installeres globalt — læs
**om sameksistens med den officielle opencode**, før du installerer.

### Anbefalet: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verificér:

```bash
opencode --version
# opencode v1.18.55 (eller den senest udgivne version)
```

Meta-pakken `@lux-tech/opencode-ai` downloader automatisk den korrekte platform-binær
fra en af sine 12 valgfrie afhængigheder (se **tabellen over platform-binærer**) og
stiller den til rådighed som `opencode`-binæren.

### Alternativ: GitHub Releases (manuelt)

Release-arkiver udgives på
[releases-siden](https://github.com/menoxz/opencode/releases) som `.tar.gz` (Linux)
og `.zip` (macOS / Windows). Hvert arkiv indeholder `opencode`-binæren (eller
`opencode.exe`) ved roden.

```bash
# Eksempel: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # omdøb for at undgå at overskrive den officielle binær
```

```powershell
# Eksempel: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Binær placering

| Installationsmetode | Binær sti |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (manuelt) | hvor end du har placeret den |

### Opdatering

```bash
# Indbygget opdatering (henter den nyeste @lux-tech/opencode-ai-udgivelse)
opencode upgrade

# Eller via npm
npm update -g @lux-tech/opencode-ai
```

### Afinstallation

```bash
npm uninstall -g @lux-tech/opencode-ai
```

På Windows skal du også fjerne den gamle shim, hvis npm har efterladt én:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Sameksistens med den officielle opencode

**Både fork'en (`@lux-tech/opencode-ai`) og den officielle opencode (`opencode-ai`)
installerer en binær ved navn `opencode`.** Hvis du installerer den ene globalt efter
den anden, erstatter den stille og roligt den forrige binær. Du kan ikke beholde begge
som den globale `opencode` på samme tid.

### Hvilken skal du bruge?

| Behov | Brug |
|---|---|
| MCP-servere med automatisk genforbindelse, hot reload, eval pipeline, memory consolidation, unified prompt | **Denne fork** (`@lux-tech/opencode-ai`) |
| Den officielle, bredt validerede udgivelse | [officiel opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Mulighed A — én global installation + npx til den anden (anbefalet)

Installer fork'en globalt, og kør den officielle opencode efter behov uden at installere
den globalt:

```bash
npm install -g @lux-tech/opencode-ai   # fork'en bliver den globale `opencode`

# Brug den officielle opencode uden at røre den globale installation:
npx -y opencode-ai@latest
```

Eller omvendt — behold den officielle opencode globalt, og kør fork'en efter behov:

```bash
npm install -g opencode-ai             # den officielle bliver den globale `opencode`
npx -y @lux-tech/opencode-ai@latest    # kør fork'en efter behov
```

### Mulighed B — begge installeret, én omdøbt

Installer begge, og omdøb derefter den sekundære binær, så de to kommandoer ikke
kolliderer:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # overskriver `opencode` — gør dette som nummer to
```

På Windows omdøbes fork-binæren derefter til `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # officiel
```

På Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # officiel
```

### Tjek, hvilken binær der er aktiv lige nu

```bash
which opencode                # sti til den aktive binær
opencode --version            # version af den aktive binær
opencode upgrade --help       # indbygget opdatering henter @lux-tech/opencode-ai
```

> [!TIP]
> Det indbyggede opdateringsværktøj (`opencode upgrade`) henter altid
> `@lux-tech/opencode-ai`. Hvis du vil have den **officielle** opencode til at opdatere
> automatisk, skal du køre den via `npx opencode-ai@latest` eller den officielle
> installer (se [opencode.ai](https://opencode.ai)).

---

## Platform-binærer

`@lux-tech/opencode-ai` leveres som en meta-pakke med 12 valgfrie platform-binærer
(alle udgivet i samme version):

| Pakke | Platform / CPU | Bemærkninger |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPU'er uden AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPU'er uden AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, uden AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPU'er uden AVX2 |

---

## Agents

OpenCode indeholder to indbyggede agents, som du kan skifte mellem med `Tab`-tasten.

- **build** - Standard, agent med fuld adgang til udviklingsarbejde
- **plan** - Skrivebeskyttet agent til analyse og kodeudforskning
  - Afviser filredigering som standard
  - Spørger om tilladelse, før bash-kommandoer køres
  - Ideel til at udforske ukendte kodebaser eller planlægge ændringer

Derudover findes en **general**-subagent til komplekse søgninger og flertrinsopgaver.
Den bruges internt og kan kaldes via `@general` i beskeder.

Fork'en leverer desuden en **planner**-agent, der automatisk nedbryder opgaver, før de
udføres. Læs mere om [agents i den officielle dokumentation](https://opencode.ai/docs/agents) —
adfærden er kompatibel med upstream.

---

## Dokumentation

- **Fork-specifik dokumentation** ligger i dette repository: [`docs/`](./docs) (arkitektur,
  ADR'er, hot reload & MCP-design) og [`CHANGELOG.md`](./CHANGELOG.md).
- **Generel konfigurationsdokumentation** er kompatibel med den officielle dokumentation:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Fork-forskelle

Denne fork (`menoxz/opencode`) tilføjer følgende funktioner oven på upstream:

| Funktion | Beskrivelse |
|---------|-------------|
| **MCP Auto-reconnect** | MCP-servere, hvis forbindelse dør, registreres (transportbegivenheder + sundhedsping) og genforbindes automatisk med eksponentiel backoff — ikke flere forældede "connected"-statusser eller døde sessioner |
| **Hot Reload** | Agents, plugins og MCP-servere genindlæses automatisk ved filændringer — ingen genstart nødvendig |
| **Eval Pipeline** | SQLite-baseret evaluering med regressionsdetektion, trendanalyse og compare-CLI-kommandoer |
| **Memory Consolidation** | Tværsessionshukommelse med automatisk henfald, mønsterdetektion og post-mortem-analyse |
| **Unified Prompt** | Én enkelt `core.txt` erstatter 10 modelspecifikke prompts — renere, mindre, nemmere at vedligeholde |
| **Continuous Improvement** | Metoder er levende dokumenter — opdater eksisterende skills med changelog i stedet for at oprette dubletter |
| **Planner Integration** | Indbygget `planner`-agent nedbryder automatisk opgaver, før de udføres |

Nye funktioner versionsstyres i [`CHANGELOG.md`](./CHANGELOG.md).

---

## Bidrag

Hvis du er interesseret i at bidrage til denne fork, så læs venligst vores
[bidragsdokumentation](./CONTRIBUTING.md), før du sender en pull request.
Pull requests skal rettes mod `dev`-grenen.

---

## Bygget på OpenCode

Hvis du arbejder på et projekt, der er relateret til OpenCode og bruger "opencode" som
en del af navnet, f.eks. "opencode-dashboard" eller "opencode-mobile", så tilføj en note
til din README, der gør klart, at projektet ikke er bygget af OpenCode-teamet og ikke er
tilknyttet os på nogen måde.

---

**Rapportér problemer** på [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Kilde** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
