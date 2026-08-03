<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="Logo OpenCode forka">
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

Fork je objavljen na npm pod scope-om `@lux-tech` i instalira svoju komandu kao
**`opencodev2`** — zaseban binarni fajl koji **koegzistira** sa zvaničnim
`opencode` (instaliranim iz `opencode-ai`). Također koristi sopstvene direktorijume
za podatke i konfiguraciju (`~/.local/share/opencodev2`, `~/.config/opencodev2`),
tako da oba proizvoda mogu raditi jedan pored drugog bez diranja podataka onog
drugog. Pri prvom interaktivnom pokretanju, fork nudi da uveze vašu postojeću
opencode konfiguraciju, API ključeve i historiju sesija — originalna instalacija
ostaje netaknuta. Pogledaj
[koegzistenciju sa zvaničnim opencode](#koegzistencija-sa-zvaničnim-opencode).

### Preporučeno: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Provjera:

```bash
opencodev2 --version
# 1.18.59 (ili najnovija objavljena verzija)
```

Meta-paket `@lux-tech/opencode-ai` automatski preuzima ispravan binarni fajl za
vašu platformu iz jedne od 12 opcionalnih zavisnosti (pogledaj **tabelu binarnih
fajlova za platforme**) i izlaže ga kao `opencodev2` komandu.

### Alternativa: GitHub Releases (ručno)

Arhive izdanja se objavljuju na
[stranici izdanja](https://github.com/menoxz/opencode/releases) kao `.tar.gz`
(Linux) i `.zip` (macOS / Windows). Svaka arhiva sadrži kompajlirani CLI binarni
fajl u svom korijenu — preimenujte ga u `opencodev2` prilikom ručne instalacije
kako se nikada ne bi sukobio sa zvaničnim `opencode` binarnim fajlom.

```bash
# Primjer: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # zasebno ime, bez sukoba sa zvaničnim binarnim fajlom
```

```powershell
# Primjer: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Lokacija binarnog fajla

| Metoda instalacije | Putanja binarnog fajla |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (ručno) | gdje god ste ga stavili |

### Ažuriranje

```bash
# Ugrađeni alat za ažuriranje (preuzima najnovije @lux-tech/opencode-ai izdanje)
opencodev2 upgrade

# Ili putem npm-a
npm update -g @lux-tech/opencode-ai
```

### Deinstalacija

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Na Windows-u, uklonite i zastarjeli shim ako ga je npm ostavio:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Koegzistencija sa zvaničnim opencode

Fork (`@lux-tech/opencode-ai`) instalira svoju komandu kao **`opencodev2`**, dok
zvanični opencode (`opencode-ai`) instalira `opencode`. Ova dva imena se nikada ne
sukobljavaju, a fork koristi sopstvene direktorijume za podatke
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), tako da **oba mogu biti instalirana i korištena istovremeno**.

### Čarobnjak za migraciju pri prvom pokretanju

Pri prvom interaktivnom pokretanju, `opencodev2` detektuje da li postoji prethodna
opencode instalacija (konfiguracija, API ključevi, sesije) i pita šta učiniti:

- **Import (preporučeno)** — kopira vašu konfiguraciju, vjerodajnice (`auth.json`)
  i historiju sesija (`opencode.db`) iz originalnih opencode direktorijuma u
  opencodev2 direktorijume. Originalni podaci ostaju netaknuti.
- **Later** — počinje od nule i ponovo pita pri sljedećem pokretanju.
- **Never** — počinje sa praznim opencodev2 podacima (marker fajl sprječava
  daljnja pitanja).

Bezglava okruženja (CI, skripte) mogu nametnuti ponašanje:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # uvoz bez interakcije
OPENCODEV2_MIGRATE=skip opencodev2 ...   # preskoči i označi kao riješeno
```

Čarobnjak se pokreće samo jednom po direktorijumu podataka (marker `.migrate-state`
bilježi odluku). Nakon uvoza, kopirana baza podataka pripada opencodev2 — kasnije
migracije baze podataka opencodev2 nikada ne diraju originalnu opencode instalaciju.

### Koji koristiti?

| Potreba | Koristi |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Ovaj fork** (`opencodev2`) |
| Zvanično, široko validirano izdanje | [zvanični opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Oba se ažuriraju nezavisno:

```bash
opencodev2 upgrade        # ažurira fork (@lux-tech/opencode-ai)
opencode upgrade          # ažurira zvanični opencode (opencode-ai)
```

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
| **opencodev2 identity + migration** | Instalira se kao `opencodev2` sa sopstvenim direktorijumima podataka, tako da koegzistira sa zvaničnim opencode; čarobnjak prvog pokretanja uvozi vašu konfiguraciju, API ključeve i historiju sesija na zahtjev |

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
