# Verdict de validation — H4

## Proposal

`H4` — Un seul spawn git par étape (et non deux). Fiche validée : `docs/releases/v2.4.0/items/H4.md` (261 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Diagnostic confirmé dans le code : `processor.ts:144` (pré-appel) et `:708` (`step-finish`)
sont bien deux captures par étape, sérialisées par le sémaphore monoslot
(`snapshot/index.ts:73-82`). Deux défauts bloquants subsistent : (a) le critère §7.1 compte des
« processus `git` » alors qu'il ne mesure que les captures `write-tree` et **exclut
silencieusement** les N `patch()` (`git diff --cached`) que le patch ne supprime pas ; (b) le
« Code cible » §4 lit `ctx.snapshot` **avant** sa déclaration (`processor.ts:145`) et suppose un
`ctx` persistant d'une étape à l'autre, alors que `create` est instancié **à chaque itération**
de la boucle `while (true)` (`prompt.ts:1758`, `step++` `:1933`, `create` `:2103`) : la base
« conservée » n'a pas de porteur. Les deux sont corrigeables par réécriture du document.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — toutes vérifiées | `processor.ts:141-144`, `:131-138`, `:144-151`, `:706-708`, `:742-744`, `:759`, `:734`, `:169` ; `snapshot/index.ts:56-59`, `:73-82`, `:303-306`, `:319-322`, `:333-335` ; `snapshot.test.ts:209` (`expect(yield* snapshot.track()).toBe(before)`) ; baseline 118 ms reprise telle quelle |
| le correctif supprime bien la cause racine | KO | la cause est le pré-appel `processor.ts:144` ; le « Code cible » (§4) place `const initialSnapshot = ctx.snapshot ?? (yield* trackSnapshot)` **au même emplacement** que `:144`, avant la déclaration de `ctx` (`:145`) ⇒ ne compile pas ; faute de porteur inter-étapes, `ctx.snapshot` est neuf à chaque `create` (`prompt.ts:2103`), donc jamais renseigné (O2) |
| le critère §7 est ABSOLU et MONOTONE (et non un comptage qui s'exclut lui-même) | ok sur la forme, KO sur le périmètre | seuil `≤ N+1` monotone (N = taille du tour, ne baisse pas). Mais « le nombre de processus `git` lancés par le sous-système snapshot » est faux tel quel : il ne compte que les captures et omet les N `patch()` ; §2 sépare pourtant explicitement « 2 captures + 3 patches » (`H4.md:116`) (O1) |
| les tests §8 sont exécutables ici | ok | `bun test --timeout 30000 ./test/session/step-git-spawn.test.ts` et `…/revert-after-single-capture.test.ts` : chemins valides depuis `packages/opencode` (fichiers neufs) ; régression présente : `test/snapshot/snapshot.test.ts`, `test/session/processor-effect.test.ts`, `test/session/snapshot-tool-race.test.ts`, `test/session/revert-compact.test.ts`, `test/cli/tui/revert-diff.test.ts`, `test/session/prompt.test.ts` |
| les régressions potentielles sont nommées et réelles | ok | §6 nomme les bons fichiers ; le risque « revert cassé » est **traité** (base = mauvais `from` ⇒ diff sur-/sous-inclus ⇒ `revert()` restaure le mauvais état ; mitigation = test par mutation §8 cas 3, contenu restauré octet pour octet) |
| les `INFERE:` sont dûment marqués avec méthode | ok | un seul `INFERE:` (`H4.md:113-116`) : redondance du `write-tree` d'entrée/sortie ; méthode fournie (compteur d'invocations du spawner git ; attendu 2 captures + 3 patches → 1 capture + 3 patches) |
| l'effort §9 est réaliste | partiel | `M` sous-estime : au-delà du comptage et du test de revert, le patch exige le porteur d'état inter-étapes non spécifié (§4) ; `M`→`L` défendable |

## Objections

### O1 — MAJEUR. Le critère §7.1 compte les captures sous le nom de « processus `git` »

`H4.md:214-216` : « le nombre de processus `git` lancés par le sous-système snapshot est
**≤ N+1** (baseline ~2N) ». Or par étape le sous-système lance **1 pré-capture + 1 step-finish +
1 `patch()`** (`processor.ts:144`, `:708`, `:744`) : le total réel est `3N` en baseline et
`2N+1` après correctif, pas `2N`/`N+1`. Les `N+1` ne sont vrais que pour les **captures**
(`write-tree`) ; §2 le dit (`H4.md:116` : « 1 capture + 3 patches ») mais §7.1 ne le dit pas.

L'exclusion de `patch()` est **légitime en périmètre** : `patch()` n'est pas une capture
redondante et §4 la garde volontairement (`H4.md:166-167`) ; ce n'est donc **pas** un comptage qui
se donne raison — le correctif doit réellement faire passer les captures de `2N` à `N+1`. Mais le
critère, tel qu'écrit, est littéralement faux et non vérifiable.

**Ce qu'il faut changer** : formuler §7.1 comme H5 le fait pour ses sentinelles — « le nombre de
**captures** (`git write-tree` par `snapshot.track`, `snapshot/index.ts:321`) est ≤ N+1 ; les
`git diff --cached` de `snapshot.patch` (`snapshot/index.ts:334`) sont **exclus** du comptage
(hors périmètre, non supprimés par le correctif) ».

### O2 — CRITIQUE. Le « Code cible » §4 ne peut pas implémenter le mécanisme qu'il décrit

Le snippet (`H4.md:155`) écrit `const initialSnapshot = ctx.snapshot ?? (yield* trackSnapshot)`
à l'emplacement de `processor.ts:144` — alors que `ctx` est déclaré juste après
(`processor.ts:145`). Il ne compile pas en l'état. Plus profondément : `SessionProcessor.create`
est invoqué **à chaque itération** de la boucle `while (true)` (`prompt.ts:1758` ; `step++`
`:1933` ; `create` `:2103`) : `ctx` est donc **local à l'étape**. La base « hash de fin d'étape
*k* réutilisé à l'étape *k+1* » (§3.6, §4) n'a **aucun porteur** : ni `ctx` (neuf à chaque
`create`), ni un champ précisé ailleurs. §4 n'annonce qu'un fichier modifié, et le
`ctx.snapshot = undefined` « à la fin du tour » (§6) n'a pas davantage de support inter-étapes.

**Ce qu'il faut changer** : spécifier le porteur d'état (champ de tour, `Input` de `create`, ou
état de session) et réécrire le snippet à l'endroit réel du porteur ; sinon le `NEEDS_REVIEW` de
§10 reste ouvert et le critère §7.1 n'est pas démontré atteignable.

### O3 — MINEUR. La prose §4 promet un saut que le code cible n'implémente pas

§4 (`H4.md:147-149`) : « au `step-finish`, ne pas payer de capture supplémentaire si l'étape n'a
produit **aucune mutation** ». Le snippet (`H4.md:158`) montre
`const completedSnapshot = yield* trackSnapshot` **inconditionnel** : la capture de `step-finish`
est toujours payée, seuls les pré-appels sont réutilisés. Les deux formulations ne mesurent pas la
même chose.

**Ce qu'il faut changer** : aligner la prose et le snippet, ou retirer la promesse de saut.

## Required changes

1. **Réécrire §7.1** en « captures `write-tree` ≤ N+1 ; `patch()` (`git diff --cached`) exclu et
   déclaré hors périmètre » (O1).
2. **Spécifier le porteur d'état inter-étapes** et corriger le snippet §4 en conséquence (O2) —
   c'est le point que §10 laisse ouvert.
3. **Aligner la prose §4 et le snippet** sur le saut « étape sans mutation » (O3).
4. **Relever l'effort §9** à `L` au vu de (2).

## Implementation guidance

Ordre : (1) figer le porteur d'état — le plus vraisemblable est un champ de tour tenu dans
`prompt.ts` autour de `:2103` et transmis dans l'`Input` de `create`, plutôt qu'un `ctx` local à
`processor.ts` ; (2) n'implémenter la capture de pré-appel que pour l'étape 1 ; (3) tester le
compteur en instrumentant le spawner git (`snapshot/index.ts`), puis le revert octet pour octet.

Pièges : `snapshot.test.ts:209` assert `track()` reproductible — ne rien mémoïser dans le service
(§5.3 a raison) ; `snapshot-tool-race.test.ts` couvre une course où une capture trop tardive voit
le même arbre — la réutilisation du hash de fin d'étape *k* comme base de *k+1* doit rester
**postérieure** aux mutations de *k*.
