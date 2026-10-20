---
name: fork-release-npm
description: Publication npm et distribution du fork — CI release-fork, 13 paquets, publish-fork.ts, lanceur Node opencodev2.mjs, faux .exe et postinstall, sauvegarde de binaire, propagation du registre, navigateur isolé, actions GitHub 422, modèles gratuits. Utiliser dès qu'on publie, installe, versionne ou distribue le binaire/paquet.
---

# Publication et distribution

## Voie canonique

CI `release-fork` : elle construit le ref **poussé** (12 plateformes) et publie les **13 paquets**. Pousser `dev` d'abord.

Un publish local ne couvre que la plateforme construite, or la méta doit lister les 12 (`postinstall.mjs` rejoue la résolution par `npm install <plateforme>@<version>`) ⇒ une méta à 1 plateforme casse l'installation ailleurs en remplaçant un `latest` qui marche.

Voie manuelle de secours : `bun ./packages/opencode/script/publish-fork.ts` (jeton via `NPM_CONFIG_USERCONFIG`), idempotent ; vérifier **13 paquets** sur le registre. Détails mesurés dans `docs/HARNESS.md`.

## Point d'entrée npm

Un **lanceur Node** (`script/opencodev2.mjs` → `bin/opencodev2.mjs`), **jamais** un faux `.exe` : aucun gestionnaire ne lance le `postinstall` par défaut (Bun sans approbation, pnpm, `--ignore-scripts`, npm : `install-scripts … not covered by allowScripts`), donc un placeholder script finit en « not a valid application for this OS platform ». Le lanceur **répare** au premier appel, puis exécute.

## Serveur

`opencodev2` sans commande = **`serve`** (l'UI est servie à la racine) ; en mode source le serveur est enveloppé d'un `bun --watch` ⇒ le veilleur ne surveille que le **dossier courant**.

## Binaire sauvegardé

Le **nom ne dit pas** ce qu'elle contient ⇒ `--version` sur une **copie** portant l'extension `.exe`, jamais sur le nom en `.bak.…`.

## Registre

Après un run de `release-fork`, la propagation prend **plusieurs minutes** ⇒ un paquet « absent » juste après n'est pas un échec. Sonder `registry.npmjs.org/@lux-tech%2Fopencode-ai-<plateforme>/<version>` et re-vérifier ~2 min plus tard (mesuré : 7/13 puis 13/13 sur le même lot, sans rien republier).

## Environnement

- Navigateur : `isolated` = `%LOCALAPPDATA%\McpBrowserProfiles\<navigateur>` ; `browser_ensure` **ignore** le profil dès qu'un CDP est actif ⇒ `chrome.exe --remote-debugging-port=9222 --user-data-dir=…` puis `browser_use` ; sinon piloter **par CDP direct** (`/json/list` → WebSocket → `Runtime.evaluate`). Jamais le navigateur réel sans accord explicite.
- Actions GitHub sur un fork : `422` malgré `enabled` ⇒ clic « I understand my workflows » dans l'onglet Actions (aucun endpoint ne le débloque).
- Modèles gratuits : tester `opencode-go/*-free` **avant** de conclure « pas de gratuit » ; `opencode/*-free` est fermé côté serveur ; `jev-1.13*` n'est **pas** un modèle de conversation (endpoint `/systemone`).

## Harnais

- Outil natif invisible ⇒ tableau `builtin` de `packages/opencode/src/tool/registry.ts` ; `always_tools`, carte `tools` et permissions ne filtrent qu'un catalogue **déjà construit**.
- Mode plan : `plan_enter`/`plan_exit` exigent `OPENCODE_EXPERIMENTAL_PLAN_MODE` **et** `flags.client === "cli"` ; distincts de `planning` (`experimental.planning.enabled`) et de `turn_plan`.
- Plugin livré = config seule, **aucun rebuild** ; changement dans `src/**` = rebuild. `.opencode/plugin/*` n'est **pas** auto-découvert ⇒ entrée explicite `file:///…` dans la config globale + redémarrage (composant `schedule` : `docs/HARNESS.md`).
- Workflow agentic : `.opencode/agent/coding-orchestrator.md`, entrée `/deliver`, spec `specs/agentic-coding-workflow.md` — config pure.
