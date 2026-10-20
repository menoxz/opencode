---
name: fork-tests
description: Commandes de test et de vérification du dépôt opencode-fork — bun test, vitest webui, tests .opencode, typecheck tsgo, perf-guard, A/B au HEAD avant de conclure à une régression. Utiliser dès qu'on lance, écrit ou corrige un test, un typecheck, ou qu'un test échoue.
---

# Tests du fork

## Commander les suites

- Paquet principal : `cd packages/opencode && bun test --timeout 30000 <chemins>`. `--timeout` est **obligatoire** : sans lui, des échecs fantômes apparaissent à 5 s.
- Typecheck : `bun run typecheck` (`tsgo --noEmit`, **jamais** `tsc`). Garde rapide : `perf-guard`.
- Webui : depuis `packages/webui`, `bun run test` (vitest + jsdom ; Bun n'exécute pas de JSX ici). Le glob `src/*.test.ts` **rate** les `.tsx` ⇒ lister `src/**/*.test.{ts,tsx}`.
- `.opencode` : lancer **depuis `.opencode`** — `cd .opencode && bun test --timeout 30000 tests/<f>.test.ts`. Depuis la racine, `bunfig.toml` refuse.

## Après une vague

Relancer **tous** les tests des items voisins, pas seulement la suite ciblée : un correctif peut en annuler un autre sans qu'aucune suite ciblée ne le voie.

## Un test échoue

A/B au HEAD avant de conclure à une régression : `git checkout <commit> -- <fichier>`, relancer, comparer. Les échecs déjà connus sont listés dans `docs/HARNESS.md` — y chercher le message exact avant d'enquêter.

## Fichiers

`glob` ou chemin explicite, **jamais `Get-ChildItem -Recurse`** depuis la racine.

## Tâches

`cmd /d /c bun run dev` (un chemin entre guillemets casse pwsh) ; `#force` enveloppe dans `Invoke-Expression`, où le multi-lignes casse ⇒ découper. `.opencode/tasks.json` est gitignoré ⇒ jamais dans un commit.

## Version

`docs/releases/<version>/` ; `PROGRESS.md` est la **seule** autorité de statut.
