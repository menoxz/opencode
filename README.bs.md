<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo OpenCode forka">
    </picture>
  </a>
</p>
<p align="center">OpenCode je open source AI agent za programiranje — fork zajednice.

> **Napomena o forku** — ovo spremište (`menoxz/opencode`) je fork
> [zvaničnog opencode](https://github.com/anomalyco/opencode) od strane zajednice
> sa dodatnim funkcijama (MCP auto-reconnect, hot reload, eval pipeline,
> memory consolidation, unified prompt). **Nije povezano** sa zvaničnim opencode
> timom. **Pogledaj razlike forka →**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="Licenca" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
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

[![OpenCode terminal interfejs](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Instalacija (fork)

Fork je objavljen na npm pod scope-om `@lux-tech` i instalira binarni fajl
pod nazivom `opencode`, potpuno kao i zvanični paket. To znači da fork
**zamjenjuje** zvanični opencode kada su oba instalirana globalno — pročitaj
**koegzistenciju sa zvaničnim opencode** prije instalacije.

### Preporučeno: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Provjera:

```bash
opencode --version
# opencode v1.18.55 (ili najnovija objavljena verzija)
```

Meta-paket `@lux-tech/opencode-ai` automatski preuzima ispravan binarni fajl za
vašu platformu iz jedne od 12 opcionalnih zavisnosti (pogledaj **tabelu binarnih
fajlova za platforme**) i izlaže ga kao `opencode` binarni fajl.

### Alternativa: GitHub Releases (ručno)

Arhive izdanja se objavljuju na
[stranici izdanja](https://github.com/menoxz/opencode/releases) kao `.tar.gz`
(Linux) i `.zip` (macOS / Windows). Svaka arhiva sadrži `opencode` (ili
`opencode.exe`) binarni fajl u svom korijenu.

```bash
# Primjer: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # preimenovanje da se ne prepiše zvanični binarni fajl
```

```powershell
# Primjer: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Lokacija binarnog fajla

| Metoda instalacije | Putanja binarnog fajla |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (ručno) | gdje god ste ga stavili |

### Ažuriranje

```bash
# Ugrađeni alat za ažuriranje (preuzima najnovije @lux-tech/opencode-ai izdanje)
opencode upgrade

# Ili putem npm-a
npm update -g @lux-tech/opencode-ai
```

### Deinstalacija

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Na Windows-u, uklonite i zastarjeli shim ako ga je npm ostavio:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Koegzistencija sa zvaničnim opencode

**I fork (`@lux-tech/opencode-ai`) i zvanični opencode (`opencode-ai`) instaliraju
binarni fajl pod nazivom `opencode`.** Globalna instalacija jednog nakon drugog
tiho zamjenjuje prethodni binarni fajl. Ne možete imati oba kao globalni
`opencode` istovremeno.

### Koji koristiti?

| Potreba | Koristi |
|---|---|
| MCP serveri sa automatskim ponovnim povezivanjem, hot reload, eval pipeline, memory consolidation, unified prompt | **Ovaj fork** (`@lux-tech/opencode-ai`) |
| Zvanično, široko validirano izdanje | [zvanični opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Opcija A — jedna globalna instalacija + `npx` za drugu (preporučeno)

Instalirajte fork globalno i pokrećite zvanični opencode po potrebi bez
globalne instalacije:

```bash
npm install -g @lux-tech/opencode-ai   # fork postaje globalni `opencode`

# Koristi zvanični opencode bez diranja globalne instalacije:
npx -y opencode-ai@latest
```

Ili obrnuto — zadržite zvanični opencode globalnim i pokrećite fork po potrebi:

```bash
npm install -g opencode-ai             # zvanični postaje globalni `opencode`
npx -y @lux-tech/opencode-ai@latest    # pokretanje forka po potrebi
```

### Opcija B — oba instalirana, jedno preimenovano

Instalirajte oba, zatim preimenujte sekundarni binarni fajl da se dvije komande
ne sukobe:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # prepisuje `opencode` — uradite ovo drugo
```

Zatim na Windows-u preimenujte fork binarni fajl u `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # zvanični
```

Na Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # zvanični
```

### Provjeri koji je binarni fajl trenutno aktivan

```bash
which opencode                # putanja aktivnog binarnog fajla
opencode --version            # verzija aktivnog binarnog fajla
opencode upgrade --help       # ugrađeni alat za ažuriranje cilja @lux-tech/opencode-ai
```

> [!TIP]
> Ugrađeni alat za ažuriranje (`opencode upgrade`) uvijek preuzima
> `@lux-tech/opencode-ai`. Ako želite da se **zvanični** opencode automatski
> ažurira, pokrećite ga preko `npx opencode-ai@latest` ili zvaničnog
> instalatera (vidi [opencode.ai](https://opencode.ai)).

---

## Binarni fajlovi za platforme

`@lux-tech/opencode-ai` se isporučuje kao meta-paket sa 12 opcionalnih binarnih
fajlova za platforme (svi objavljeni u istoj verziji):

| Paket | Platforma / CPU | Napomene |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | Procesori bez AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | Procesori bez AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, bez AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | Procesori bez AVX2 |

---

## Agenti

OpenCode uključuje dva ugrađena agenta između kojih se možete prebacivati
tasterom `Tab`.

- **build** — podrazumijevani, agent sa punim pristupom za razvojne poslove
- **plan** — agent samo za čitanje za analizu i istraživanje koda
  - Podrazumijevano odbija izmjene fajlova
  - Traži dozvolu prije pokretanja bash komandi
  - Idealan za istraživanje nepoznatih codebase-ova ili planiranje izmjena

Također je uključen **general** pod-agent za složene pretrage i zadatke u više
koraka. Koristi se interno i može se pozvati pomoću `@general` u porukama.

Fork dodatno isporučuje **planner** agenta koji automatski razlaže zadatke
prije izvršenja. Saznajte više o
[agentima u zvaničnoj dokumentaciji](https://opencode.ai/docs/agents) — ponašanje
je kompatibilno sa upstream-om.

---

## Dokumentacija

- **Dokumentacija specifična za fork** se nalazi u ovom spremištu:
  [`docs/`](./docs) (arhitektura, ADR, hot reload & MCP dizajn)
  i [`CHANGELOG.md`](./CHANGELOG.md).
- **Opća dokumentacija za konfiguraciju** je kompatibilna sa zvaničnom
  dokumentacijom: [opencode.ai/docs](https://opencode.ai/docs).

---

## Razlike forka

Ovaj fork (`menoxz/opencode`) dodaje sljedeće funkcije na vrh upstream-a:

| Funkcija | Opis |
|---------|-------------|
| **MCP Auto-reconnect** | MCP serveri čija veza pukne se otkrivaju (transportni događaji + health ping) i automatski ponovo povezuju sa eksponencijalnim backoff-om — više nema zastarjelog "connected" statusa ili mrtvih sesija |
| **Hot Reload** | Agenti, pluginovi i MCP serveri se automatski ponovo učitavaju pri promjeni fajlova — nije potreban restart |
| **Eval Pipeline** | Evaluacija zasnovana na SQLite sa detekcijom regresija, analizom trendova i CLI komandama za poređenje |
| **Memory Consolidation** | Memorija između sesija sa automatskim raspadanjem, detekcijom obrazaca i post-mortem analizom |
| **Unified Prompt** | Jedan `core.txt` zamjenjuje 10 model-specifičnih promptova — čišće, manje, lakše za održavanje |
| **Continuous Improvement** | Metode su živi dokumenti — ažurirajte postojeće skill-ove sa changelog-om umjesto kreiranja duplikata |
| **Planner Integration** | Ugrađeni `planner` agent automatski razlaže zadatke prije izvršenja |

Nove funkcije su verzionirane u [`CHANGELOG.md`](./CHANGELOG.md).

---

## Doprinosi

Ako ste zainteresovani da doprinesete ovom forku, molimo pročitajte
[dokumentaciju o doprinosima](./CONTRIBUTING.md) prije slanja pull request-a.
Pull request-ovi ciljaju `dev` granu.

---

## Gradnja na OpenCode-u

Ako radite na projektu koji je povezan sa OpenCode-om i koristi "opencode" kao
dio svog naziva, na primjer "opencode-dashboard" ili "opencode-mobile", dodajte
napomenu u svoj README da pojasnite da ga nije napravio OpenCode tim i da nije
povezan s nama ni na koji način.

---

**Prijavi probleme** na [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Izvorni kod** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
