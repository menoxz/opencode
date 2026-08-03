# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [v1.18.69] - 2026-08-03

### Added
- **Logo `opencodev2` dans les README** : nouveaux assets `logo-ornate-v2-light.svg` / `logo-ornate-v2-dark.svg` (mot-symbole `OPENCODEV2`, bichromie `OPEN` atténué + `CODEV2` accentué, V pleine hauteur et 2 segmenté conformes au logo TTY validé). Les 22 README (anglais + 21 traductions) pointent désormais dessus ; les assets `logo-ornate-*` d'origine restent inchangés pour l'UI console/stats.

### Fixed
- **Fallback vision ignoré pour les résultats d'outils** : une image retournée par un outil (`read`, `webfetch`) arrive comme pièce jointe de résultat d'outil, jamais comme part `file` de message — or seul ce second chemin était traité. Avec un modèle sans entrée image, `read` sur une image produisait donc « Image read successfully » et aucun contenu exploitable. L'analyse du modèle de vision configuré (`attachment.image.vision_model`) est maintenant repliée dans le texte de sortie de l'outil et le média inutilisable est retiré. Test de non-régression : `test/session/vision-fallback.test.ts`.
- **Paquet npm `@lux-tech/opencode-ai` incomplet** : le tarball publié ne contenait que 4 fichiers, sans README — la page npm s'affichait donc vide (`readmeFilename: ""`). `publish-fork.ts` copie désormais le README du dépôt dans le méta-paquet et génère un `package.json` complet (`description`, `keywords`, `homepage`, `repository`, `bugs`, `files`, `engines`).

## [v1.18.68] - 2026-08-02

### Changed
- `tui` : le contexte courant (ex. `128k/1.0M (13%)`) s'affiche désormais sur la ligne agent · modèle · fournisseur · variante ; la ligne de statut du prompt n'utilise plus de séparateurs ` . ` (remplacés par des espaces).

### Fixed
- `agent` : le rapport final du mode swarm ne liste plus les points non traités — seuls les vrais bloqueurs sont documentés, avec la raison et la prochaine étape exacte.

## [v1.18.67] - 2026-08-02

### Fixed
- **Logo terminal OPENCODEV2 lisible** : les glyphes officiels `OPEN|CODE` sont conservés strictement ; le suffixe validé utilise un V agrandi sur cinq colonnes et toute la hauteur, sans tronc central pouvant évoquer un Y, ainsi qu'un 2 segmenté. Les rendus TTY et non-TTY sont désormais dérivés d'une source unique et protégés par des tests ciblés.

## [v1.18.66] - 2026-08-02

### Added
- **File d'attente de prompts correcte** : un prompt soumis pendant qu'un agent travaille est désormais exécuté par un **run frais** après que le run courant s'est entièrement terminé (idle) — il n'est plus absorbé dans le tour suivant du même run. Chaque run s'ancre au plus ancien prompt non traité (FIFO) et ignore les prompts plus récents via une vue bornée (`src/session/prompt-queue.ts` : `pendingUserID`/`boundToRun`/`turnClosed`) ; la compaction auto et les subtasks restent fonctionnels. Tests unitaires + test d'intégration « the run settles idle before the queued prompt runs ».
- **Snapshot de contexte fidèle** (`OPENCODE_CONTEXT_FILE`) : le fichier reçoit le payload réellement envoyé au LLM — `system` et `messages` verbatim (parts texte tels quels, autres parts en JSON sans perte) **plus les définitions d'outils** (`prepared.tools`, `execute` exclu) — sans troncature (plafond de 2000 caractères supprimé) et avec un en-tête réduit à une ligne machine-parseable. Objectif : évaluer la qualité du context builder d'opencodev2.
- **Hot-reload des plugins serveur** : les plugins chargés depuis la config globale ou une origine `file://` sont re-initialisés automatiquement quand leur fichier change (watcher @parcel/watcher, debounce 300 ms, erreurs par étape install/compatibilité/entrée publiées via `publishPluginError`).
- **Logo OPENCODEV2** : le logo ASCII (`cli/logo.ts`) et le wordmark non-TTY (`cli/ui.ts`) passent de 8 à 10 glyphes et lisent désormais OPENCODEV2 (V et 2 dessinés dans le même style) ; les zones TUI affichant la version du binaire (home footer, sidebar footer, sidebar session, toast de mise à jour) affichent « OPENCODEV2 + version ».

### Changed
- **Références utilisateur → `opencodev2`** : le message Continue de sortie de session (`opencodev2 -s <id>`), les tips du TUI, l'aide yargs, les messages d'erreur et les prompts utilisateur référencent la commande `opencodev2` ; fixes fonctionnels des chemins d'auto-invocation (`cli/cmd/pr.ts`, `eval/real-runner.ts`, `temporary.ts`).
- **Mode swarm orchestré par l'outil `task`** : le mode agent `swarm` décompose désormais le but en appels `task` parallèles (vagues topologiques) au lieu de l'outil `swarm` dédié — chaque sous-agent s'affiche nativement dans le TUI.
- README traduits resynchronisés sur l'identité opencodev2 ; progression affichée pendant l'import du wizard de migration première-exécution.

### Fixed
- **Blocage indéfini de l'outil shell** : une commande lançant un processus d'arrière-plan long (ex. `opencodev2 serve`) ne terminait jamais — le spawner résolvait sur l'événement `close` (jamais émis quand un petit-fils hérite des handles via `Start-Process -RedirectStandardOutput`) ; il résout désormais sur `exit` (avec drain borné de 200 ms), aligné sur le comportement platform-node.

### Removed
- **Tool `swarm` supprimé** (`src/tool/swarm.ts`, enregistrement dans `tool/registry.ts`) : suringénierie et boîte noire côté TUI. Le mode agent `swarm` (`--agent swarm`, flag `OPENCODE_EXPERIMENTAL_SWARM`) reste et orchestre désormais via l'outil `task` existant — il décompose le but, émet des appels `task` parallèles (même message pour la vague 1, messages suivants pour les dépendances), puis synthétise les résultats `<task>`. Chaque sous-agent s'affiche nativement dans le TUI (footer tabs avec statut en direct, "view subagents", navigation Parent/Prev/Next) car ce sont de vrais appels `task`. Tests swarm du tool retirés ; le mode swarm est conservé dans `test/agent/agent.test.ts` (2 tests) ; `experimentalSwarm` reste dans runtime-flags.

## [v1.18.59] - 2026-08-01

### Added
- **Wizard de migration première-exécution** (`src/cli/migrate.ts`) : au premier lancement interactif, `opencodev2` détecte les données d'une installation opencode existante (config, `auth.json`, sessions) et propose de les importer — copie de `~/.config/opencode` et `~/.local/share/opencode` (DB + WAL/SHM + storage) vers les répertoires `opencodev2`, sans jamais modifier l'original. Options : Importer (recommandé) / Plus tard / Jamais ; marqueur `.migrate-state` (une seule demande) ; override headless `OPENCODEV2_MIGRATE=copy|skip` ; gardes TTY + commandes headless. Tests : `test/cli/migrate.test.ts` (5 tests).

### Changed
- **Identité du fork → `opencodev2`** : le binaire/commande npm est renommé `opencodev2` (clé `bin` de `publish-fork.ts`) et le fork utilise ses propres répertoires de données (`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`, `~/.cache/opencodev2`, `%LOCALAPPDATA%\opencodev2`, `%ProgramData%\opencodev2`) — coexistence complète avec l'opencode officiel, sans conflit de binaire ni de base SQLite.
  - `packages/core/src/global.ts` : `app = "opencodev2"` (chemins Global.Path).
  - Chemins codés en dur renommés : memory/eval/self-improve (`opencodev2/memory.sqlite`, `eval.sqlite`), daemon (pid/log/service/tasks/learnings/notifications/reports/triggers), config managée (`/etc/opencodev2`, `ProgramData\opencodev2`).
  - Auto-invocation (attach, daemon, auto-executor, pr import) et uninstall (`@lux-tech/opencode-ai`) adaptés ; `scriptName("opencodev2")`.
- README racine : sections Installation + Coexistence réécrites pour la coexistence native et le wizard de migration.

### Fixed

### Removed

## [v1.18.58] - 2026-08-01

### Added
- **Agent Swarm mode (natif)** : nouveau mode agent qui décompose une mission en tâches indépendantes, les exécute en vagues parallèles in-process et agrège les résultats.
  - Outil `swarm` (`src/tool/swarm.ts`) : planification topologique des vagues (`planSwarm`), exécution concurrente (`concurrency`), dépendances `depends`, tâches `optional`, isolation des échecs (dépendants skipés avec raison), sessions enfants sous le parent, permissions dérivées du type de sous-agent, annulation des enfants à l'abort, rapport agrégé `<swarm>` échappé, événements bus `swarm.started`/`swarm.task`/`swarm.completed`, mode background (job + injection du rapport dans le parent).
  - Agent natif `swarm` (mode primary) avec prompt d'orchestration `src/agent/prompt/swarm.txt` (arbre de décision prompt → swarm → résultat, règles de décomposition/agrégation/sécurité).
  - Activation : `OPENCODE_EXPERIMENTAL_SWARM=true` (ou `OPENCODE_EXPERIMENTAL=true`) ; l'agent et l'outil sont masqués sans le flag.
  - Tests : `test/tool/swarm.test.ts` (21 tests : vagues, parallélisme prouvé par gates, échecs/skips, échappement, permissions, abort, background) + tests agent dans `test/agent/agent.test.ts`.
  - Doc : `docs/agent-swarm.md` documente le mode natif (recommandé) et l'implémentation config-level existante.
- **Budget de contexte instrumenté** : nouveau test `test/session/context-budget.test.ts` qui capture la requête LLM réelle (TestLLMServer), découpe le system prompt en sections (core/env/instructions/skills/goal/reminder) et mesure chaque point d'entrée du contexte avec budgets anti-régression
- **contextSummary honnête** : les fragments fixes du system prompt (PROMPT_CORE, env, instructions AGENTS.md) sont désormais tracés dans le log « prompt context summary » — le `totalSize` couvre le système complet au lieu des seules sections variables

### Changed
- **Skills list plus légère** : les descriptions des skills sont clippées à 200 chars dans la liste injectée (modes verbose/summary/caveman). Le texte complet reste utilisé pour le ranking BM25 et le tool `skill` — la découverte est inchangée. Mesure réelle : 13 362 → 8 724 chars (-35 %) par tour
- README réécrit pour le fork : installation/mise à jour/désinstallation via `@lux-tech/opencode-ai`, tableau des 12 binaires par plateforme, et section cohabitation avec l'opencode original (conflit de binaire `opencode`, options npx / renommage, vérification du binaire actif)
- 21 README traduits (ar, bn, br, bs, da, de, es, fr, gr, it, ja, ko, no, pl, ru, th, tr, uk, vi, zh, zht) resynchronisés sur la version fork : installation `@lux-tech/opencode-ai`, coexistence fork/original, badges du fork ; suppression des références à l'installation upstream (`opencode.ai/install`, `opencode-ai@latest`, section Desktop App, badge anomalyco)

### Fixed
- **config.instructions perdues silencieusement** : les patterns relatifs (`"./rules.md"`) déclarés dans le fichier de config global étaient résolus uniquement dans l'arbre projet et jamais trouvés. Fallback vers le répertoire de config — les instructions configurées sont maintenant injectées (3 fichiers récupérés dans la config réelle)
- **doublons skill** : avertissement `duplicate skill name` quand plusieurs SKILL.md partagent le même `name` (docx vs word-design-pro) — comportement conservé, uniquement observé

### Removed

## [v1.18.56] - 2026-08-01

### Added
- Auto-reconnexion MCP : un serveur MCP dont le processus meurt ou dont le transport se ferme est détecté (événements `onclose`/`onerror` + health-check périodique par ping JSON-RPC) puis reconnecté automatiquement avec backoff exponentiel (1s → 30s), au lieu de rester affiché « connected » avec des appels en échec
- Options `experimental.mcp_health_interval_ms` (intervalle du health-check, défaut 5000, 0 = désactivé) et `experimental.mcp_autoreconnect` (défaut true)
- Test d'intégration `src/mcp/reconnect.test.ts` + fixture `test/fixtures/dummy-mcp-server.mjs` : tue le processus serveur et vérifie la reconnexion automatique (nouveau pid + outils de nouveau disponibles)

### Fixed
- Le statut MCP restait figé à « connected » après la mort du processus serveur : `mcp_list` affiche désormais `failed` avec la raison dès la détection
- Événements `ToolsChanged` publiés lors d'une déconnexion/reconnexion pour que les clients attach voient les outils revenir

## [v1.18.55] - 2026-08-01

### Added
- Build CI multi-plateforme : workflow `.github/workflows/release-fork.yml` (workflow_dispatch, runner ubuntu, 12 cibles linux/darwin/windows) avec publication npm et création de la release GitHub automatiques
- Script `packages/opencode/script/publish-fork.ts` : publie uniquement les dossiers contenant un binaire et construit le wrapper méta `@lux-tech/opencode-ai`

### Changed
- Publication npm sous le scope `@lux-tech` : wrapper `@lux-tech/opencode-ai` + 12 binaires `@lux-tech/opencode-ai-<plateforme>-<arch>` (13 packages)

### Fixed
- `postinstall.mjs` : résolution du binaire par plateforme/architecture corrigée pour le scope `@lux-tech`
- `installation/index.ts` : `NPM_PACKAGE_NAME` pointe vers `@lux-tech/opencode-ai` (détection latest + upgrade npm/pnpm/bun)

## [v1.18.54] - 2026-07-31

### Changed
- Publication npm initiale du fork sous le scope `@lux-tech/opencode-ai`

### Fixed
- Binaire `dist/opencode-windows-x64/bin/opencode.exe` périmé (v1.15.13) détecté avant publication, remplacé par le build 1.18.54

## [v1.18.52] - 2026-07-30

### Added
- `opencode attach <url>` : démarrage automatique du serveur (`opencode serve`) s'il n'est pas joignable (`ensureServer()` dans `src/cli/cmd/tui/attach.ts`)

### Changed
- Optimisation multi-session : `serve` + `attach` au lieu de N sessions autonomes (RAM divisée par ~2,4 : 3,9 Go → ~1,6 Go)

## [v1.18.51] - 2026-07-28

### Added
- Fallback vision pour les pièces jointes d'images

[Unreleased]: https://github.com/menoxz/opencode/compare/v1.18.58...dev
[v1.18.58]: https://github.com/menoxz/opencode/compare/v1.18.56...v1.18.58
[v1.18.56]: https://github.com/menoxz/opencode/compare/v1.18.55...v1.18.56
[v1.18.55]: https://github.com/menoxz/opencode/compare/v1.18.54...v1.18.55
[v1.18.54]: https://github.com/menoxz/opencode/compare/v1.18.52...v1.18.54
[v1.18.52]: https://github.com/menoxz/opencode/compare/v1.18.51...v1.18.52
[v1.18.51]: https://github.com/menoxz/opencode/releases/tag/v1.18.51
