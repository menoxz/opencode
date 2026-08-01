# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

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

[Unreleased]: https://github.com/menoxz/opencode/compare/v1.18.55...dev
[v1.18.55]: https://github.com/menoxz/opencode/compare/v1.18.54...v1.18.55
[v1.18.54]: https://github.com/menoxz/opencode/compare/v1.18.52...v1.18.54
[v1.18.52]: https://github.com/menoxz/opencode/compare/v1.18.51...v1.18.52
[v1.18.51]: https://github.com/menoxz/opencode/releases/tag/v1.18.51
