<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="Logo del fork OpenCode">
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

Il fork è pubblicato su npm sotto lo scope `@lux-tech` e installa il suo comando come
**`opencodev2`** — un binario distinto che **coesiste** con l'`opencode` ufficiale
(installato da `opencode-ai`). Mantiene inoltre le proprie directory di dati/configurazione
(`~/.local/share/opencodev2`, `~/.config/opencodev2`), così entrambi i prodotti possono
essere eseguiti fianco a fianco senza toccare i dati dell'altro. Al primo avvio interattivo,
il fork offre di importare la configurazione opencode esistente, le chiavi API e la cronologia
delle sessioni — l'installazione originale rimane intatta. Consulta
**coesistenza con l'opencode ufficiale**.

### Consigliato: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verifica:

```bash
opencodev2 --version
# 1.18.59 (oppure l'ultima versione pubblicata)
```

Il meta-pacchetto `@lux-tech/opencode-ai` scarica automaticamente il binario corretto
per la tua piattaforma da una delle sue 12 dipendenze opzionali (vedi la
**tabella dei binari per piattaforma**) e lo espone come comando `opencodev2`.

### Alternativa: Release GitHub (manuale)

Gli archivi delle release sono pubblicati su
[la pagina delle release](https://github.com/menoxz/opencode/releases) come `.tar.gz` (Linux)
e `.zip` (macOS / Windows). Ogni archivio contiene il binario CLI compilato alla sua radice —
rinominalo in `opencodev2` durante l'installazione manuale così non entrerà mai in conflitto
con il binario `opencode` ufficiale.

```bash
# Esempio: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # nome distinto, nessun conflitto con il binario ufficiale
```

```powershell
# Esempio: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Posizione del binario

| Metodo di installazione | Percorso del binario |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| Release GitHub (manuale) | dove l'hai posizionato |

### Aggiornamento

```bash
# Aggiornatore integrato (recupera l'ultima release di @lux-tech/opencode-ai)
opencodev2 upgrade

# Oppure tramite npm
npm update -g @lux-tech/opencode-ai
```

### Disinstallazione

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Su Windows, rimuovi anche lo shim obsoleto se npm ne ha lasciato uno:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Coesistenza con l'opencode ufficiale

Il fork (`@lux-tech/opencode-ai`) installa il suo comando come **`opencodev2`**, mentre
l'opencode ufficiale (`opencode-ai`) installa `opencode`. I due nomi non entrano mai in
conflitto e il fork usa le proprie directory di dati
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), quindi **entrambi possono essere installati e usati contemporaneamente**.

### Procedura guidata di migrazione al primo avvio

Al primo avvio interattivo, `opencodev2` rileva se esiste una precedente installazione di
opencode (configurazione, chiavi API, sessioni) e chiede cosa fare:

- **Importa (consigliato)** — copia la configurazione, le credenziali (`auth.json`) e la
  cronologia delle sessioni (`opencode.db`) dalle directory opencode originali alle
  directory opencodev2. I dati originali rimangono intatti.
- **Più tardi** — parte da zero e richiede di nuovo al prossimo avvio.
- **Mai** — parte con dati opencodev2 vuoti (un file marcatore impedisce ulteriori richieste).

Gli ambienti senza interfaccia (CI, script) possono forzare il comportamento:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # importa senza interazione
OPENCODEV2_MIGRATE=skip opencodev2 ...   # salta e segna come deciso
```

La procedura guidata viene eseguita una sola volta per directory di dati (un marcatore
`.migrate-state` registra la decisione). Dopo un'importazione, il database copiato appartiene
a opencodev2 — le successive migrazioni del database opencodev2 non toccano mai
l'installazione opencode originale.

### Quale dovresti usare?

| Esigenza | Usa |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Questo fork** (`opencodev2`) |
| La release ufficiale, ampiamente validata | [opencode ufficiale](https://github.com/anomalyco/opencode) (`opencode`) |

Entrambi restano aggiornati indipendentemente:

```bash
opencodev2 upgrade        # aggiorna il fork (@lux-tech/opencode-ai)
opencode upgrade          # aggiorna l'opencode ufficiale (opencode-ai)
```

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
| **Identità opencodev2 + migrazione** | Si installa come `opencodev2` con le proprie directory di dati, quindi coesiste con l'opencode ufficiale; una procedura guidata al primo avvio importa configurazione, chiavi API e cronologia delle sessioni su richiesta |

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
