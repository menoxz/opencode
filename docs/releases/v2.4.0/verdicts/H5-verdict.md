# Verdict de validation — H5

## Proposal

`H5` — Mémoïser la découverte des fichiers d'instruction. Fiche validée : `docs/releases/v2.4.0/items/H5.md` (281 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Diagnostic vérifié : `instruction.system()` (`prompt.ts:2201`) appelle `systemPaths()`
(`instruction.ts:268`), qui refait `discoverSystemPaths()` (`instruction.ts:261`) — dont
`fs.findUp` (`filesystem.ts:187-212`) — à chaque étape, alors que seul le **contenu** est mémoïsé
(`instruction.ts:158-166`). La fiche est honnête (elle déclare elle-même l'exclusion des
sentinelles et marque `INFERE` le `mtime` Windows). Deux défauts bloquants : (a) le critère §7.1
n'est vrai que parce qu'il exclut les `stat` que le patch **ajoute** — il ne démontre à lui seul
aucune réduction ; (b) la sentinelle ne couvre pas toutes les sources de `discoverSystemPaths`
(`~/.claude/CLAUDE.md`, `config.instructions`), donc §7.2 peut être violé pour ces sources.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — toutes vérifiées | `prompt.ts:2199-2202` ; `instruction.ts:264-268`, `:260-262`, `:193-200`, `:210-214`, `:154-164`, `:116-124`, `:317`, `:277` ; `filesystem.ts:187`, `:193-201`, `:203-210` ; `instruction.test.ts:203` (`describe("Instruction.system")`), `:392` (`describe("Instruction.systemPaths global config")`) ; `prompt-budget.test.ts` bien situé en `src/session/` |
| le correctif supprime bien la cause racine | ok | la cause est l'absence de mémoïsation des chemins : `systemPaths` (`instruction.ts:260-262`) délègue nu à `discoverSystemPaths` ; insérer un cache au niveau `systemPaths` (§4) coupe l'appel répété tout en laissant `system()`/`resolve()` (`:268`, `:317`) l'utiliser |
| le critère §7 est ABSOLU et MONOTONE (et non un comptage qui s'exclut lui-même) | partiel | seuils absolus (`≤1` sur 10 steps ; détection à step+1), monotones — mais §7.1 **exclut** du comptage les `stat` de sentinelle, c.-à-d. précisément le travail disque que le patch **ajoute** : le critère est vrai par construction de son périmètre (O1) |
| les tests §8 sont exécutables ici | ok | `bun test --timeout 30000 ./test/session/instruction-discovery-cache.test.ts` : chemin valide depuis `packages/opencode` (fichier neuf) ; régression présente : `test/session/instruction.test.ts`, `test/session/prompt.test.ts`, `src/session/prompt-budget.test.ts` |
| les régressions potentielles sont nommées et réelles | partiel | §6 nomme les bons `describe` et le risque « cache périmé » ; mais la couverture de sentinelle est incomplète (O2) |
| les `INFERE:` sont dûment marqués avec méthode | ok | un `INFERE:` (`H5.md:129-132`) : coût unitaire `findUp` faible, coût réel = répétition ; méthode fournie (compteur `fs.existsSafe`/`findUp` sur 10 appels). §10 (`H5.md:275-281`) marque `INFERE` la fiabilité `mtime` Windows et en renvoie la preuve à §8 cas 2 |
| l'effort §9 est réaliste | ok | `S` — un champ de state, une clé de sentinelle, une garde de retour dans `systemPaths()` ; cohérent avec le seul fichier touché |

## Objections

### O1 — MAJEUR. Le critère §7.1 n'est vrai que parce qu'il exclut le coût que le patch ajoute

§7.1 (`H5.md:232-235`) : « le nombre d'appels disque **de découverte** (`fs.findUp` /
`fs.existsSafe` dans `discoverSystemPaths`) est **≤ 1** (baseline : 10). Les `stat` de
sentinelle sont **exclus** du comptage ». Or `systemPaths()` après correctif **fait** des appels
disque à chaque étape (`dirStamp`/`chainStamp`, §4 `H5.md:175`) : le patch déplace des appels
`exists`/`findUp` O(profondeur × cibles) vers des `stat` de répertoire O(profondeur), mais §7.1
ne mesure que la partie qui **baisse** et ignore celle qui **demeure**. Le critère nomme « appels
disque de découverte » une grandeur dont le patch définit lui-même le périmètre : il ne peut pas
échouer.

C'est moins grave que le cas P19-O1 (aucun ratio, seuil monotone, et l'exclusion est **déclarée
ici** — contrairement à H4), mais le critère seul ne démontre pas de réduction.

**Ce qu'il faut changer** : adjoindre une mesure non évitable — total des `syscalls` disque
(`exists` + `stat` + `findUp`) sur 10 steps **strictement inférieur** à la baseline mesurée avant
patch, ou temps mur de `systemPaths()` × 10 steps. Le comptage « découverte ≤ 1 » peut rester
**secondaire**.

### O2 — MAJEUR. La sentinelle ne couvre pas toutes les sources de `discoverSystemPaths`

La clé §4 (`H5.md:175`) couvre `ctx.directory`, `ctx.worktree`,
`Flag.OPENCODE_DISABLE_PROJECT_CONFIG` et `dirStamp(global.config)`. Mais
`discoverSystemPaths` lit aussi :

- `globalFiles` = `global.config/AGENTS.md` **et** `home/.claude/CLAUDE.md`
  (`instruction.ts:110-113`, testé `:200`) — le répertoire `~/.claude` n'est pas dans la clé ;
- `config.instructions` (chemins locaux et globs, `instruction.ts:229-254`) — aucun de ces
  répertoires n'est dans la clé.

Un `CLAUDE.md` ou une entrée `instructions` ajoutée en cours de session ne changerait donc ni
`mtime(global.config)` ni la chaîne `directory→worktree` : §7.2 (« détecté au step suivant »)
serait violé pour ces sources.

**Ce qu'il faut changer** : étendre la sentinelle aux répertoires de `globalFiles`
(`global.home/.claude`) et aux répertoires parents des entrées locales de `config.instructions`
— ou documenter explicitement ces sources comme non couvertes et restreindre §7.2 à
`AGENTS.md`/`CLAUDE.md` de projet.

### O3 — MINEUR. `mtime` de répertoire sous Windows : signal réel mais paresseux, à assumer dans le test

§10 (`H5.md:275-281`) marque `INFERE` la fiabilité du `mtime` de répertoire sur Windows et en
renvoie la preuve à §8 cas 2. Sur NTFS, le `mtime` d'un répertoire change bien à la
**création/suppression** d'une entrée directe — donc il détecte l'ajout d'un `AGENTS.md` dans un
ancêtre scanné par `findUp` — mais la mise à jour est **différée** (fenêtre d'environ une seconde
avant propagation). Un test qui écrit puis relit immédiatement peut manquer l'invalidation. §8
cas 2 le prévoit (« `touch`/délai ») : c'est nécessaire, pas optionnel.

**Ce qu'il faut changer** : confirmer le marquage `INFERE` par le cas 2 **avec** délai **et** par
le cas 3 (sentinelle figée ⇒ échec attendu), et écrire noir sur blanc que la granularité différée
de Windows est une contrainte du test, pas un défaut du patch.

## Required changes

1. **Ajouter une mesure non exclue** au §7 — total `syscalls` disque ou temps mur strictement
   inférieur à la baseline — le comptage « découverte ≤ 1 » passant en critère secondaire (O1).
2. **Étendre la sentinelle** (§4) aux répertoires de `globalFiles` (`~/.claude`) et de
   `config.instructions`, ou restreindre explicitement §7.2 aux fichiers de projet (O2).
3. **Verrouiller le cas 2 avec délai** et l'assumer comme contrainte de granularité Windows (O3).

## Implementation guidance

Ordre : (1) instrumenter d'abord la **baseline** (compteur de `syscalls` disque sur 10 appels
`instruction.system()` **avant** patch) — sans elle, O1 reste invérifiable ; (2) poser le cache
dans `systemPaths()` (`instruction.ts:260`) avec une clé de sentinelle **complète** (O2) ;
(3) exécuter §8 cas 1-4.

Pièges : le cache vit dans `state` (`instruction.ts:116-125`), **déjà** keyé par répertoire via
`InstanceState` — l'isolation §8 cas 4 est donc quasi acquise, mais la clé doit tout de même
inclure le répertoire pour ne pas confondre deux `ctx.directory` d'une même instance ; ne pas
toucher à la clé `size:mtime` du cache `reads` (`instruction.ts:158`) ; vérifier que `resolve()`
(`instruction.ts:317`) bénéficie du cache sans casser `find()` (`instruction.ts:302-308`), qui
garde ses propres `existsSafe` et n'est pas dans le périmètre du patch.
