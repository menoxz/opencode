<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo del fork OpenCode">
    </picture>
  </a>
</p>
<p align="center">L'agente di coding AI open source — fork della community.

> **Avviso sul fork** — questa repository (`menoxz/opencode`) è un fork della community
> dell'[opencode ufficiale](https://github.com/anomalyco/opencode) con funzionalità aggiuntive
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> **Non è affiliato** al team ufficiale di opencode.
> **Vedi le differenze del fork →**</p>
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

[![Interfaccia terminale di OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installazione (fork)

Il fork è pubblicato su npm sotto lo scope `@lux-tech` e installa un binario chiamato
`opencode`, esattamente come il pacchetto ufficiale. Questo significa che il fork
**sostituisce** l'opencode ufficiale quando entrambi sono installati globalmente — leggi
**coesistenza con l'opencode ufficiale** prima di installare.

### Consigliato: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verifica:

```bash
opencode --version
# opencode v1.18.55 (oppure l'ultima versione pubblicata)
```

Il meta-pacchetto `@lux-tech/opencode-ai` scarica automaticamente il binario corretto
per la tua piattaforma da una delle sue 12 dipendenze opzionali (vedi la
**tabella dei binari per piattaforma**) e lo espone come binario `opencode`.

### Alternativa: Release GitHub (manuale)

Gli archivi delle release sono pubblicati su
[la pagina delle release](https://github.com/menoxz/opencode/releases) come `.tar.gz` (Linux)
e `.zip` (macOS / Windows). Ogni archivio contiene il binario `opencode` (o `opencode.exe`)
alla sua radice.

```bash
# Esempio: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # rinominare per non sovrascrivere il binario ufficiale
```

```powershell
# Esempio: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Posizione del binario

| Metodo di installazione | Percorso del binario |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| Release GitHub (manuale) | dove l'hai posizionato |

### Aggiornamento

```bash
# Aggiornatore integrato (recupera l'ultima release di @lux-tech/opencode-ai)
opencode upgrade

# Oppure tramite npm
npm update -g @lux-tech/opencode-ai
```

### Disinstallazione

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Su Windows, rimuovi anche lo shim obsoleto se npm ne ha lasciato uno:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Coesistenza con l'opencode ufficiale

**Sia il fork (`@lux-tech/opencode-ai`) che l'opencode ufficiale (`opencode-ai`)
installano un binario chiamato `opencode`.** Installare uno globalmente dopo l'altro
sostituisce silenziosamente il binario precedente. Non puoi mantenere entrambi come
`opencode` globale allo stesso tempo.

### Quale dovresti usare?

| Esigenza | Usa |
|---|---|
| Server MCP con riconnessione automatica, hot reload, eval pipeline, memory consolidation, unified prompt | **Questo fork** (`@lux-tech/opencode-ai`) |
| La release ufficiale, ampiamente validata | [opencode ufficiale](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Opzione A — un'installazione globale + `npx` per l'altra (consigliata)

Installa il fork globalmente ed esegui l'opencode ufficiale on demand senza installarlo
globalmente:

```bash
npm install -g @lux-tech/opencode-ai   # il fork diventa l'`opencode` globale

# Usa l'opencode ufficiale senza toccare l'installazione globale:
npx -y opencode-ai@latest
```

O al contrario — tieni l'opencode ufficiale globale ed esegui il fork on demand:

```bash
npm install -g opencode-ai             # l'ufficiale diventa l'`opencode` globale
npx -y @lux-tech/opencode-ai@latest    # esegui il fork on demand
```

### Opzione B — entrambi installati, uno rinominato

Installa entrambi, poi rinomina il binario secondario in modo che i due comandi non
entrino in conflitto:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # sovrascrive `opencode` — fallo per secondo
```

Poi su Windows rinomina il binario del fork in `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # ufficiale
```

Su Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # ufficiale
```

### Verifica quale binario è attualmente attivo

```bash
which opencode                # percorso del binario attivo
opencode --version            # versione del binario attivo
opencode upgrade --help       # l'aggiornatore integrato punta a @lux-tech/opencode-ai
```

> [!TIP]
> L'aggiornatore integrato (`opencode upgrade`) recupera sempre `@lux-tech/opencode-ai`.
> Se vuoi che l'opencode **ufficiale** si aggiorni automaticamente, eseguilo tramite
> `npx opencode-ai@latest` o l'installer ufficiale (vedi
> [opencode.ai](https://opencode.ai)).

---

## Binari per piattaforma

`@lux-tech/opencode-ai` viene distribuito come meta-pacchetto con 12 binari opzionali
per piattaforma (tutti pubblicati alla stessa versione):

| Package | Piattaforma / CPU | Note |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPU senza AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPU senza AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, senza AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPU senza AVX2 |

---

## Agenti

OpenCode include due agenti integrati tra cui puoi passare usando il tasto `Tab`.

- **build** - Predefinito, agente con accesso completo per il lavoro di sviluppo
- **plan** - Agente in sola lettura per analisi ed esplorazione del codice
  - Nega le modifiche ai file per impostazione predefinita
  - Chiede il permesso prima di eseguire comandi bash
  - Ideale per esplorare codebase sconosciute o pianificare modifiche

È inoltre incluso un sotto-agente **general** per ricerche complesse e attività multi-step.
Viene utilizzato internamente e può essere invocato usando `@general` nei messaggi.

Il fork include inoltre un agente **planner** che scompone automaticamente le attività prima
dell'esecuzione. Scopri di più sugli
[agenti nella documentazione ufficiale](https://opencode.ai/docs/agents) — il comportamento
è compatibile con upstream.

---

## Documentazione

- **Documentazione specifica del fork** : in questa repository — [`docs/`](./docs) (architettura,
  ADR, progettazione di hot reload e MCP) e [`CHANGELOG.md`](./CHANGELOG.md).
- **Documentazione generale di configurazione** : compatibile con la documentazione ufficiale —
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Differenze del fork

Questo fork (`menoxz/opencode`) aggiunge le seguenti funzionalità rispetto a upstream:

| Funzionalità | Descrizione |
|---------|-------------|
| **MCP Auto-reconnect** | I server MCP la cui connessione cade vengono rilevati (eventi di trasporto + ping di salute) e riconnessi automaticamente con backoff esponenziale — niente più stato «connesso» obsoleto o sessioni morte |
| **Hot Reload** | Agents, plugin e server MCP si ricaricano automaticamente al cambiamento dei file — nessun riavvio necessario |
| **Eval Pipeline** | Valutazione basata su SQLite con rilevamento delle regressioni, analisi dei trend e comandi CLI di confronto |
| **Memory Consolidation** | Memoria tra sessioni con decadimento automatico, rilevamento di pattern e analisi post-mortem |
| **Unified Prompt** | Un unico `core.txt` sostituisce 10 prompt specifici per modello — più pulito, più leggero, più facile da mantenere |
| **Continuous Improvement** | I metodi sono documenti viventi — aggiorna gli skill esistenti con un changelog invece di creare duplicati |
| **Planner Integration** | L'agente `planner` integrato scompone automaticamente le attività prima dell'esecuzione |

Le nuove funzionalità sono versionate in [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contribuire

Se sei interessato a contribuire a questo fork, leggi la nostra
[guida alla contribuzione](./CONTRIBUTING.md) prima di inviare una pull request.
Le pull request puntano al ramo `dev`.

---

## Costruire su OpenCode

Se stai lavorando a un progetto correlato a OpenCode che usa «opencode» come parte del
suo nome, ad esempio «opencode-dashboard» o «opencode-mobile», aggiungi una nota al tuo
README per chiarire che non è stato costruito dal team OpenCode e che non è affiliato
a noi in alcun modo.

---

**Segnala i problemi** su [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Sorgente** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
