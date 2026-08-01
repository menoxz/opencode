# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- **Agent Swarm mode (natif)** : nouveau mode agent qui décompose une mission en tâches indépendantes, les exécute en vagues parallèles in-process et agrège les résultats.
  - Outil `swarm` (`src/tool/swarm.ts`) : planification topologique des vagues (`planSwarm`), exécution concurrente (`concurrency`), dépendances `depends`, tâches `optional`, isolation des échecs (dépendants skipés avec raison), sessions enfants sous le parent, permissions dérivées du type de sous-agent, annulation des enfants à l'abort, rapport agrégé `<swarm>` échappé, événements bus `swarm.started`/`swarm.task`/`swarm.completed`, mode background (job + injection du rapport dans le parent).
  - Agent natif `swarm` (mode primary) avec prompt d'orchestration `src/agent/prompt/swarm.txt` (arbre de décision prompt → swarm → résultat, règles de décomposition/agrégation/sécurité).
  - Activation : `OPENCODE_EXPERIMENTAL_SWARM=true` (ou `OPENCODE_EXPERIMENTAL=true`) ; l'agent et l'outil sont masqués sans le flag.
  - Tests : `test/tool/swarm.test.ts` (21 tests : vagues, parallélisme prouvé par gates, échecs/skips, échappement, permissions, abort, background) + tests agent dans `test/agent/agent.test.ts`.
  - Doc : `docs/agent-swarm.md` documente le mode natif (recommandé) et l'implémentation config-level existante.

### Changed
- README réécrit pour le fork : installation/mise à jour/désinstallation via `@lux-tech/opencode-ai`, tableau des 12 binaires par plateforme, et section cohabitation avec l'opencode original (conflit de binaire `opencode`, options npx / renommage, vérification du binaire actif)
- 21 README traduits (ar, bn, br, bs, da, de, es, fr, gr, it, ja, ko, no, pl, ru, th, tr, uk, vi, zh, zht) resynchronisés sur la version fork : installation `@lux-tech/opencode-ai`, coexistence fork/original, badges du fork ; suppression des références à l'installation upstream (`opencode.ai/install`, `opencode-ai@latest`, section Desktop App, badge anomalyco)

### Fixed

### Removed

## [v1.18.58] - 2026-08-01

### Added
- **Budget de contexte instrumenté** : nouveau test `test/session/context-budget.test.ts` qui capture la requête LLM réelle (TestLLMServer), découpe le system prompt en sections (core/env/instructions/skills/goal/reminder) et mesure chaque point d'entrée du contexte avec budgets anti-régression
- **contextSummary honnête** : les fragments fixes du system prompt (PROMPT_CORE, env, instructions AGENTS.md) sont désormais tracés dans le log « prompt context summary » — le `totalSize` couvre le système complet au lieu des seules sections variables

### Changed
- **Skills list plus légère** : les descriptions des skills sont clippées à 200 chars dans la liste injectée (modes verbose/summary/caveman). Le texte complet reste utilisé pour le ranking BM25 et le tool `skill` — la découverte est inchangée. Mesure réelle : 13 362 → 8 724 chars (-35 %) par tour

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

[Unreleased]: https://github.com/menoxz/opencode/compare/v1.18.56...dev
[v1.18.56]: https://github.com/menoxz/opencode/compare/v1.18.55...v1.18.56
[v1.18.55]: https://github.com/menoxz/opencode/compare/v1.18.54...v1.18.55
[v1.18.54]: https://github.com/menoxz/opencode/compare/v1.18.52...v1.18.54
[v1.18.52]: https://github.com/menoxz/opencode/compare/v1.18.51...v1.18.52
[v1.18.51]: https://github.com/menoxz/opencode/releases/tag/v1.18.51
