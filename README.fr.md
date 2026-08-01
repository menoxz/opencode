<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo du fork OpenCode">
    </picture>
  </a>
</p>
<p align="center">L'agent de codage IA open source — fork communautaire.

> **Avis de fork** — ce dépôt (`menoxz/opencode`) est un fork communautaire de
> l'[opencode officiel](https://github.com/anomalyco/opencode) avec des fonctionnalités
> supplémentaires (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> Il n'est **pas affilié** à l'équipe officielle d'opencode.
> **Voir les différences du fork →**</p>
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

[![Interface terminal OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Installation (fork)

Le fork est publié sur npm sous le scope `@lux-tech` et installe un binaire nommé
`opencode`, exactement comme le package officiel. Cela signifie que le fork **remplace**
l'opencode officiel lorsque les deux sont installés globalement — lisez
**coexistence avec l'opencode officiel** avant d'installer.

### Recommandé : npm

```bash
npm install -g @lux-tech/opencode-ai
```

Vérification :

```bash
opencode --version
# opencode v1.18.55 (ou la dernière version publiée)
```

Le méta-package `@lux-tech/opencode-ai` télécharge automatiquement le binaire correct
pour votre plateforme depuis l'une de ses 12 dépendances optionnelles (voir le
**tableau des binaires par plateforme**) et l'expose sous le nom de binaire `opencode`.

### Alternative : Releases GitHub (manuelle)

Les archives de release sont publiées sur
[la page des releases](https://github.com/menoxz/opencode/releases) au format `.tar.gz` (Linux)
et `.zip` (macOS / Windows). Chaque archive contient le binaire `opencode` (ou `opencode.exe`)
à sa racine.

```bash
# Exemple : Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # renommer pour ne pas écraser le binaire officiel
```

```powershell
# Exemple : Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Emplacement du binaire

| Méthode d'installation | Chemin du binaire |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| Release GitHub (manuelle) | là où vous l'avez placé |

### Mise à jour

```bash
# Mise à jour intégrée (récupère la dernière release de @lux-tech/opencode-ai)
opencode upgrade

# Ou via npm
npm update -g @lux-tech/opencode-ai
```

### Désinstallation

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Sous Windows, supprimez aussi le shim obsolète si npm en a laissé un derrière :

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistence avec l'opencode officiel

**Le fork (`@lux-tech/opencode-ai`) et l'opencode officiel (`opencode-ai`)
installent tous deux un binaire nommé `opencode`.** Installer l'un globalement après
l'autre remplace silencieusement le binaire précédent. Vous ne pouvez pas conserver les
deux comme `opencode` global en même temps.

### Lequel devriez-vous utiliser ?

| Besoin | Utilisez |
|---|---|
| Serveurs MCP avec reconnexion automatique, hot reload, eval pipeline, memory consolidation, unified prompt | **Ce fork** (`@lux-tech/opencode-ai`) |
| La release officielle, largement validée | [opencode officiel](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Option A — une installation globale + `npx` pour l'autre (recommandé)

Installez le fork globalement et exécutez l'opencode officiel à la demande sans
l'installer globalement :

```bash
npm install -g @lux-tech/opencode-ai   # le fork devient le `opencode` global

# Utilisez l'opencode officiel sans toucher à l'installation globale :
npx -y opencode-ai@latest
```

Ou l'inverse — gardez l'opencode officiel global et exécutez le fork à la demande :

```bash
npm install -g opencode-ai             # l'officiel devient le `opencode` global
npx -y @lux-tech/opencode-ai@latest    # exécutez le fork à la demande
```

### Option B — les deux installés, l'un renommé

Installez les deux, puis renommez le binaire secondaire pour que les deux commandes
n'entrent pas en conflit :

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # écrase `opencode` — faites ceci en second
```

Ensuite, sous Windows, renommez le binaire du fork en `opencode-fork.exe` :

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # officiel
```

Sous Linux / macOS :

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # officiel
```

### Vérifier quel binaire est actuellement actif

```bash
which opencode                # chemin du binaire actif
opencode --version            # version du binaire actif
opencode upgrade --help       # la mise à jour intégrée cible @lux-tech/opencode-ai
```

> [!TIP]
> La mise à jour intégrée (`opencode upgrade`) récupère toujours `@lux-tech/opencode-ai`.
> Si vous voulez que l'opencode **officiel** se mette à jour automatiquement, exécutez-le via
> `npx opencode-ai@latest` ou l'installateur officiel (voir
> [opencode.ai](https://opencode.ai)).

---

## Binaires par plateforme

`@lux-tech/opencode-ai` est distribué comme méta-package avec 12 binaires optionnels
par plateforme (tous publiés à la même version) :

| Package | Plateforme / CPU | Notes |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPUs sans AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPUs sans AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, sans AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPUs sans AVX2 |

---

## Agents

OpenCode inclut deux agents intégrés entre lesquels vous pouvez basculer avec la touche `Tab`.

- **build** - Par défaut, agent avec accès complet pour le travail de développement
- **plan** - Agent en lecture seule pour l'analyse et l'exploration du code
  - Refuse les modifications de fichiers par défaut
  - Demande l'autorisation avant d'exécuter des commandes bash
  - Idéal pour explorer une base de code inconnue ou planifier des changements

Un sous-agent **general** est aussi inclus pour les recherches complexes et les tâches en
plusieurs étapes. Il est utilisé en interne et peut être invoqué via `@general` dans les messages.

Le fork inclut en outre un agent **planner** qui décompose automatiquement les tâches avant
l'exécution. En savoir plus sur les
[agents dans la documentation officielle](https://opencode.ai/docs/agents) — le comportement
est compatible avec l'upstream.

---

## Documentation

- **Documentation spécifique au fork** : dans ce dépôt — [`docs/`](./docs) (architecture,
  ADRs, conception du hot reload et des MCP) et [`CHANGELOG.md`](./CHANGELOG.md).
- **Documentation de configuration générale** : compatible avec la documentation officielle —
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Différences du fork

Ce fork (`menoxz/opencode`) ajoute les fonctionnalités suivantes par rapport à l'upstream :

| Fonctionnalité | Description |
|---------|-------------|
| **MCP Auto-reconnect** | Les serveurs MCP dont la connexion tombe sont détectés (événements de transport + ping de santé) et reconnectés automatiquement avec backoff exponentiel — plus de statut « connecté » obsolète ni de sessions mortes |
| **Hot Reload** | Les agents, plugins et serveurs MCP se rechargent automatiquement à chaque modification de fichier — pas besoin de redémarrer |
| **Eval Pipeline** | Évaluation basée sur SQLite avec détection de régression, analyse de tendances et commandes CLI de comparaison |
| **Memory Consolidation** | Mémoire inter-sessions avec décroissance automatique, détection de motifs et analyse post-mortem |
| **Unified Prompt** | Un seul `core.txt` remplace 10 prompts spécifiques par modèle — plus propre, plus léger, plus facile à maintenir |
| **Continuous Improvement** | Les méthodes sont des documents vivants — mettez à jour les skills existants avec un changelog au lieu de créer des doublons |
| **Planner Integration** | L'agent `planner` intégré décompose automatiquement les tâches avant l'exécution |

Les nouvelles fonctionnalités sont versionnées dans [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contribuer

Si vous souhaitez contribuer à ce fork, lisez nos
[docs de contribution](./CONTRIBUTING.md) avant de soumettre une pull request.
Les pull requests ciblent la branche `dev`.

---

## Construire sur OpenCode

Si vous travaillez sur un projet lié à OpenCode qui utilise « opencode » comme partie de
son nom, par exemple « opencode-dashboard » ou « opencode-mobile », ajoutez une note à votre
README pour préciser qu'il n'est pas construit par l'équipe OpenCode et qu'il n'est pas
affilié à nous d'aucune manière.

---

**Signalez les problèmes** sur [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Source** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
